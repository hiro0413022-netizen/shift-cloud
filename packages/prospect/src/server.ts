// 自動ピックアップの本体。Vercel Cron から呼ばれ、PCが閉じていても進む唯一の入口。
//
// 流れ: 巡回元(prs_sources) → 候補列挙(アダプタ) → 重複除外 → 営業先化(dms_prospects)
//        → Web現況スコア(audit) → スコア上位を自動デモ生成(onDemo コールバック)
//
// 設計の要点
//  - 1回で全部やり切ろうとしない。時間予算(budgetMs)を超えたらそこで止め、次のcronが続きから進む。
//    外部サイトの取得は遅く、件数も読めないため「途中で終われること」が前提条件になる。
//  - デモ生成の実装は持たない（renderDemo は demo-sales のもの）。onDemo で受け取る＝パッケージをアプリ非依存に保つ。
//  - 失敗は握りつぶさず prs_runs.detail に残す。自動化は「静かに止まる」のが最悪の壊れ方なので、
//    動いた証跡を必ず1行残す。

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditPage, unreachableAudit } from "./audit";
import { dedupeKeys, isDuplicate, type DedupeKeys } from "./dedupe";
import { fetchPage, pageSpeedScore, sleep } from "./http";
import { ADAPTERS } from "./sources";
import type { ProspectCandidate, SourceRow, WebAudit } from "./types";

export interface PickupOptions {
  /** 実行の時間予算。超えたら次のcronに続きを譲る */
  budgetMs?: number;
  /** 1回の実行で新規に営業先化する上限（急に増やさない） */
  maxNewProspects?: number;
  /** 1回の実行でスコアを付ける上限 */
  maxAudits?: number;
  /** 自動デモ生成のスコア下限。これ未満は人が判断する */
  demoScoreMin?: number;
  /** 1回の実行で自動生成するデモの上限 */
  maxDemos?: number;
  /** 同一サイトへの連続アクセス間隔 */
  delayMs?: number;
  env?: Record<string, string | undefined>;
  /** デモ生成。アプリ側が渡す。true を返したら生成できたとみなす */
  onDemo?: (p: { id: string; name: string; industry: string; phone: string | null; address: string | null; score: number }) => Promise<boolean>;
}

export interface PickupResult {
  runId: string | null;
  picked: number;
  skipped: number;
  audited: number;
  demos: number;
  detail: Record<string, unknown>;
}

const DEFAULTS = {
  budgetMs: 240_000,
  maxNewProspects: 30,
  maxAudits: 25,
  demoScoreMin: 55,
  maxDemos: 3,
  delayMs: 1200,
};

export async function runProspectPickup(
  admin: SupabaseClient,
  companyId: string,
  opts: PickupOptions = {},
): Promise<PickupResult> {
  const o = { ...DEFAULTS, ...opts };
  const env = opts.env ?? (typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {});
  const startedAt = Date.now();
  const left = () => o.budgetMs - (Date.now() - startedAt);

  const { data: run } = await admin.from("prs_runs").insert({ company_id: companyId }).select("id").single();
  const runId: string | null = run?.id ?? null;

  const detail: Record<string, unknown> = {};
  let picked = 0;
  let skipped = 0;
  let audited = 0;
  let demos = 0;

  // ---------------------------------------------------------------
  // 1) 候補の収集と営業先化
  // ---------------------------------------------------------------
  const { data: sources } = await admin
    .from("prs_sources")
    .select("id,company_id,name,kind,industry,city,url,link_pattern,query,max_per_run")
    .eq("company_id", companyId)
    .eq("enabled", true)
    .is("deleted_at", null)
    .order("sort");

  const { data: seenRows } = await admin.from("prs_seen").select("ref_key").eq("company_id", companyId);
  const seen = new Set<string>((seenRows ?? []).map((r: { ref_key: string }) => r.ref_key));

  // 既存の営業先は重複判定のために一度だけ読む（数千件までは素直にこれで足りる）
  const { data: existingRows } = await admin
    .from("dms_prospects")
    .select("id,name,phone,website_url,city")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const existing: (DedupeKeys & { city: string | null })[] = (existingRows ?? []).map(
    (r: { name: string; phone: string | null; website_url: string | null; city: string | null }) => ({
      ...dedupeKeys({ name: r.name, phone: r.phone, websiteUrl: r.website_url }),
      city: r.city,
    }),
  );

  const sourceLog: Record<string, unknown>[] = [];
  for (const src of (sources ?? []) as SourceRow[]) {
    if (left() < 30_000 || picked >= o.maxNewProspects) break;
    const adapter = ADAPTERS[src.kind];
    if (!adapter) {
      sourceLog.push({ source: src.name, error: `未知のkind: ${src.kind}` });
      continue;
    }
    const limit = Math.min(src.max_per_run ?? 10, o.maxNewProspects - picked);
    let collected: { candidates: ProspectCandidate[]; errors: string[] };
    try {
      collected = await adapter.collect(src, { limit, seen, delayMs: o.delayMs, env });
    } catch (e) {
      sourceLog.push({ source: src.name, error: String(e) });
      continue;
    }

    let addedHere = 0;
    const collectErrors: string[] = [];
    for (const c of collected.candidates) {
      seen.add(c.refKey);
      const keys = { ...dedupeKeys(c), city: c.city ?? null };
      const dup = existing.some((e) => isDuplicate(keys, e));
      if (dup) {
        skipped++;
        await admin
          .from("prs_seen")
          .insert({ company_id: companyId, source_id: src.id, ref_key: c.refKey, skip_reason: "duplicate", note: c.name });
        continue;
      }
      const { data: ins, error: insErr } = await admin
        .from("dms_prospects")
        .insert({
          company_id: companyId,
          name: c.name,
          industry: c.industry,
          city: c.city ?? null,
          address: c.address ?? null,
          phone: c.phone ?? null,
          website_url: c.websiteUrl ?? null,
          gmap_url: c.gmapUrl ?? null,
          status: "unanalyzed",
          source: "auto",
          prs_source_id: src.id,
          source_url: c.sourceUrl ?? null,
        })
        .select("id")
        .single();
      // 失敗は必ず理由を残す。握りつぶすと「なぜ0件なのか」が追えなくなる（#114の教訓）
      if (insErr) collectErrors.push(`${c.name}: 登録に失敗 ${insErr.message}`);
      await admin.from("prs_seen").insert({
        company_id: companyId,
        source_id: src.id,
        ref_key: c.refKey,
        prospect_id: ins?.id ?? null,
        skip_reason: ins?.id ? null : "insert_failed",
        // 何を拾ったのかを残す。これが無いと抽出のおかしさに気づけない
        note: `${c.name}${c.phone ? " / " + c.phone : ""}`,
      });
      if (ins?.id) {
        existing.push(keys);
        picked++;
        addedHere++;
      }
    }

    const result = {
      picked: addedHere,
      candidates: collected.candidates.length,
      errors: [...collected.errors, ...collectErrors].slice(0, 8),
    };
    sourceLog.push({ source: src.name, ...result });
    await admin.from("prs_sources").update({ last_run_at: new Date().toISOString(), last_result: result }).eq("id", src.id);
  }
  detail.sources = sourceLog;

  // ---------------------------------------------------------------
  // 2) Web現況スコア（未計測から順に）
  // ---------------------------------------------------------------
  const { data: toAudit } = await admin
    .from("dms_prospects")
    .select("id,name,website_url,industry,phone,address,email")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("audited_at", null)
    .not("website_url", "is", null)
    .order("created_at")
    .limit(o.maxAudits);

  const auditErrors: string[] = [];
  for (const p of (toAudit ?? []) as { id: string; name: string; website_url: string; industry: string; email: string | null }[]) {
    if (left() < 25_000) break;
    let result: WebAudit;
    try {
      const snap = await fetchPage(p.website_url);
      if (snap.status >= 400) {
        result = unreachableAudit(`HTTP ${snap.status}`);
      } else {
        const psi = await pageSpeedScore(snap.finalUrl, env.PAGESPEED_API_KEY);
        result = auditPage(snap, { psiScore: psi });
      }
    } catch (e) {
      result = unreachableAudit(String(e).slice(0, 120));
      auditErrors.push(`${p.name}: ${String(e).slice(0, 80)}`);
    }

    // 先方サイトに公表されているメールアドレス。②outreach の送信根拠（特定電子メール法3条1項3号）なので、
    // 「どのページで見つけたか」まで残す。推測アドレス（info@ドメインの組み立て等）は作らない。
    // 既に入っているアドレス（人が入れたもの）は上書きしない
    const emails = p.email ? [] : ((result.raw.emails as string[] | undefined) ?? []);
    const emailPatch =
      emails.length > 0
        ? {
            email: emails[0],
            email_source: "site",
            email_found_at: new Date().toISOString(),
            email_page_url: String(result.raw.finalUrl ?? p.website_url),
          }
        : {};

    // analysis は「所見」。機械の観測は audit に置き、analysis.items は初期値として入れる（人が上書きできる）
    await admin
      .from("dms_prospects")
      .update({
        ...emailPatch,
        analysis: {
          items: result.items,
          summary: result.ok
            ? `自動計測（${new Date().toISOString().slice(0, 10)}）: ${result.improvePoints.slice(0, 3).join(" / ") || "大きな不足は見つかりませんでした"}`
            : `サイトを取得できませんでした（${result.reason}）`,
        },
        audit: { ...result.raw, noSolicit: result.noSolicit, ok: result.ok },
        score: result.score,
        good_points: result.goodPoints.join("\n") || null,
        improve_points: result.improvePoints.join("\n") || null,
        caution_points: result.noSolicit ? "サイトに「営業お断り」の記載あり。メール送信の対象外にすること" : null,
        audited_at: new Date().toISOString(),
        status: "analyzed",
      })
      .eq("id", p.id);
    audited++;
    await sleep(o.delayMs);
  }
  if (auditErrors.length) detail.auditErrors = auditErrors.slice(0, 10);

  // ---------------------------------------------------------------
  // 3) スコア上位の自動デモ生成
  // ---------------------------------------------------------------
  if (o.onDemo) {
    const { data: forDemo } = await admin
      .from("dms_prospects")
      .select("id,name,industry,phone,address,score,audit")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("status", "analyzed")
      .is("auto_demo_at", null)
      .gte("score", o.demoScoreMin)
      .order("score", { ascending: false })
      .limit(o.maxDemos);

    const demoErrors: string[] = [];
    for (const p of (forDemo ?? []) as {
      id: string;
      name: string;
      industry: string;
      phone: string | null;
      address: string | null;
      score: number;
      audit: { noSolicit?: boolean } | null;
    }[]) {
      if (left() < 15_000) break;
      // 「営業お断り」の先はデモも作らない（作れば送りたくなる。入口で止める）
      if (p.audit?.noSolicit) continue;
      try {
        const ok = await o.onDemo({ id: p.id, name: p.name, industry: p.industry, phone: p.phone, address: p.address, score: p.score });
        if (ok) {
          await admin.from("dms_prospects").update({ auto_demo_at: new Date().toISOString() }).eq("id", p.id);
          demos++;
        }
      } catch (e) {
        demoErrors.push(`${p.name}: ${String(e).slice(0, 100)}`);
      }
    }
    if (demoErrors.length) detail.demoErrors = demoErrors;
  }

  detail.elapsedMs = Date.now() - startedAt;
  detail.budgetLeftMs = left();
  if (runId) {
    await admin
      .from("prs_runs")
      .update({ finished_at: new Date().toISOString(), picked, skipped, audited, demos, detail })
      .eq("id", runId);
  }

  return { runId, picked, skipped, audited, demos, detail };
}
