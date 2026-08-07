// 取得アダプタ① 公開名簿ページ（医師会・歯科医師会・獣医師会・商工会など）
//
// 既存13件はまさにここから拾っている（伊丹市医師会DB・宝塚市医師会DB・Googleマップ）。
// サイトごとに専用スクレイパを書くと増やすたびに実装が要るので、
// 「一覧ページからリンクを拾う → 詳細ページから連絡先を拾う」の2段だけを汎用化し、
// サイト差は prs_sources.link_pattern（正規表現1つ）で吸収する。
//
// 抽出は当たり外れがあるので、名前が取れなければ落とす（中途半端な行を営業先に混ぜない）。

import { fetchPage, sleep, UA } from "../http";
import { extractContact, extractLinks, guessIndustry } from "../parse";
import { isAllowed, loadRobots } from "../robots";
import type { AdapterContext, ProspectCandidate, SourceAdapter, SourceRow } from "../types";

export { extractContact, extractLinks };

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

    const links = extractLinks(list.html, list.finalUrl, source.link_pattern).filter((u) => !ctx.seen.has(u));

    for (const url of links) {
      if (candidates.length >= ctx.limit) break;
      if (!isAllowed(robots, new URL(url).pathname)) {
        errors.push(`robots.txtで拒否: ${url}`);
        continue;
      }
      await sleep(ctx.delayMs);
      try {
        const page = await fetchPage(url);
        if (page.status >= 400) {
          errors.push(`${url} が ${page.status}`);
          continue;
        }
        const c = extractContact(page.html, page.finalUrl);
        if (!c.name) {
          errors.push(`屋号を取得できず: ${url}`);
          continue;
        }
        candidates.push({
          refKey: url,
          // 名簿は診療科が混在するので、ページの文言から寄せる（拾えなければ巡回元の設定のまま）
          industry: guessIndustry(page.html.replace(/<[^>]+>/g, " ") + " " + c.name, source.industry),
          ...c,
          city: c.city ?? source.city ?? null,
        });
      } catch (e) {
        errors.push(`${url}: ${String(e)}`);
      }
    }
    return { candidates, errors };
  },
};
