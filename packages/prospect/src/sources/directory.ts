// 取得アダプタ① 公開名簿ページ（医師会・歯科医師会・獣医師会・商工会など）
//
// 既存13件はまさにここから拾っている（伊丹市医師会DB・宝塚市医師会DB・Googleマップ）。
//
// **一覧ページの「行」から拾う**（2026-08-07の設計変更 #114）。
// 当初は詳細ページの見出しから屋号を取っていたが、CGI型の名簿は詳細ページに見出しが無く
// title が全ページ共通のため、10件拾って全部同じ屋号になり重複判定で消えた。
// 名簿は一覧の表に「屋号・住所・電話・診療科」が揃っているので、そこから読む方が確実。
// 詳細ページは**公式サイトのURLを取るためだけ**に、必要な件数だけ訪問する。

import { fetchPage, sleep, UA } from "../http";
import { aiExtractRows, verifyAgainstSource } from "../ai-extract";
import { extractContact, extractRows, guessIndustry, looksBroken } from "../parse";
import { isAllowed, loadRobots } from "../robots";
import type { AdapterContext, ProspectCandidate, SourceAdapter, SourceRow } from "../types";

export { extractContact, extractRows, looksBroken };

export const directoryAdapter: SourceAdapter = {
  kind: "directory",
  async collect(source: SourceRow, ctx: AdapterContext) {
    const errors: string[] = [];
    const candidates: ProspectCandidate[] = [];
    if (!source.url) return { candidates, errors: ["urlが未設定です"] };

    const origin = new URL(source.url).origin;
    const robots = await loadRobots(origin, UA);

    let list;
    try {
      list = await fetchPage(source.url);
    } catch (e) {
      return { candidates, errors: [`一覧ページの取得に失敗: ${String(e)}`] };
    }
    if (list.status >= 400) return { candidates, errors: [`一覧ページが ${list.status}`] };

    // まず規則で読む（速い・無料）。ダメならAIに読ませる（#117）。
    // どちらで読んだかは errors に残して、あとから費用と成否を追えるようにする。
    const parser = source.parser ?? "auto";
    let rows = parser === "ai" ? [] : extractRows(list.html, list.finalUrl, source.link_pattern);
    let broken = rows.length === 0 ? "規則では1件も拾えませんでした" : looksBroken(rows);

    if (broken && parser !== "rules") {
      const ai = await aiExtractRows(list.html, list.finalUrl, { apiKey: ctx.env.ANTHROPIC_API_KEY });
      if (ai.rows && ai.rows.length > 0) {
        // AIが指示に反して補完することがあるので、元のHTMLに実在する屋号だけを残す
        const { kept, dropped } = verifyAgainstSource(ai.rows, list.html);
        if (dropped.length) errors.push(`AIの出力から元ページに無い${dropped.length}件を除外しました`);
        if (kept.length > 0) {
          rows = kept;
          broken = looksBroken(kept);
          errors.push(`AIで読み取りました（${kept.length}件・HTML ${Math.round(ai.usedChars / 1000)}KB）`);
        }
      } else if (ai.error) {
        errors.push(`AI読み取りに失敗: ${ai.error}`);
      }
    }

    if (rows.length === 0) {
      return { candidates, errors: [...errors, "一覧ページから営業先を1件も拾えませんでした（一覧ページURLと詳細ページの見分け方を確認してください）"] };
    }
    // 抽出が壊れているなら、中途半端に登録せず巡回元ごと止める。
    // 「1件だけ登録されて残りは重複扱い」という静かな失敗を防ぐ（#114の実障害）
    if (broken) return { candidates, errors: [...errors, broken] };

    const fresh = rows.filter((r) => !ctx.seen.has(r.refKey)).slice(0, ctx.limit);

    for (const row of fresh) {
      // 一覧の時点で屋号・住所・電話は揃っているので、詳細ページは既定で開かない（#116）。
      // 1件ごとに待ち時間が要るため、開くと1回に拾える件数が10分の1以下になる。
      // 公式サイトのURLが要るときだけ visit_detail=true にする。
      let websiteUrl: string | null = null;
      if (source.visit_detail && isAllowed(robots, new URL(row.refKey).pathname)) {
        await sleep(ctx.delayMs);
        try {
          const page = await fetchPage(row.refKey);
          if (page.status < 400) {
            const c = extractContact(page.html, page.finalUrl);
            websiteUrl = c.websiteUrl ?? null;
            // 一覧で取れなかった項目だけ詳細で補う（一覧の値を上書きしない）
            row.phone = row.phone ?? c.phone ?? null;
            row.address = row.address ?? c.address ?? null;
            row.city = row.city ?? c.city ?? null;
            row.hint = `${row.hint} ${c.name}`;
          } else {
            errors.push(`${row.name}: 詳細ページが ${page.status}`);
          }
        } catch (e) {
          errors.push(`${row.name}: ${String(e).slice(0, 80)}`);
        }
      } else if (source.visit_detail) {
        errors.push(`robots.txtで拒否: ${row.refKey}`);
      }

      candidates.push({
        refKey: row.refKey,
        name: row.name,
        // 名簿は診療科が混在するので、行の文言（診療科名など）から寄せる
        industry: guessIndustry(`${row.name} ${row.hint}`, source.industry),
        city: row.city ?? source.city ?? null,
        address: row.address,
        phone: row.phone,
        websiteUrl,
        // 詳細ページを開いたときだけ「公式サイトを探した」と言える（#119）。
        // 一覧しか見ていないのに websiteUrl=null を「HPなし」と扱うと最優先が嘘になる
        websiteChecked: !!source.visit_detail,
        sourceUrl: row.refKey,
      });
    }

    return { candidates, errors };
  },
};
