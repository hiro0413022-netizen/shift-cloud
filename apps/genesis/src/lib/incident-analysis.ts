import { createAdmin } from "@/lib/supabase/admin";
import {
  incidentCategoryLabel,
  normalizeIncidentCategory,
  ruleBasedInsights,
  type InsightDraft,
} from "@yozan/core/incidents";

type Admin = ReturnType<typeof createAdmin>;

/**
 * イレギュラー報告の再発防止分析（DECISIONS #125）
 *
 * 狙い: 報告を溜めるだけで終わらせない。「同じことが何度も起きている」を見つけ、
 *       次に同じことが起きないための具体策まで落とす。
 *
 * 壊れ方の設計:
 *   AIキーが無い・APIが落ちている場合でも **ルールベースで必ず結果を出す**（generated_by='rule'）。
 *   「分析されませんでした」で空白になるのが一番困るため。AIが動けば同じ枠を上書きする。
 *
 * 冪等性: 同一期間・同一タイトルの insight は作り直さない（毎日のcronで重複しない）。
 */

export type IncidentForAnalysis = {
  id: string;
  category: string;
  severity: string;
  occurred_at: string;
  place: string | null;
  involved: string | null;
  body: string;
  action_taken: string | null;
  status: string;
  store_id: string | null;
  store_name?: string | null;
};

/** 分析対象の報告を取得（既定: 直近90日） */
export async function loadIncidents(admin: Admin, companyId: string, days = 90): Promise<IncidentForAnalysis[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await admin
    .from("sp_incidents")
    .select("id, category, severity, occurred_at, place, involved, body, action_taken, status, store_id, stores:store_id(name)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(300);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    category: String(r.category),
    severity: String(r.severity),
    occurred_at: String(r.occurred_at),
    place: r.place as string | null,
    involved: r.involved as string | null,
    body: String(r.body),
    action_taken: r.action_taken as string | null,
    status: String(r.status),
    store_id: r.store_id as string | null,
    store_name: (r.stores as unknown as { name: string } | null)?.name ?? null,
  }));
}

/** Claude による分析。失敗時は null（呼び出し側がルールベースに落ちる） */
async function claudeInsights(rows: IncidentForAnalysis[]): Promise<InsightDraft[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || rows.length === 0) return null;

  // 本文はそのまま渡す（要約してから渡すと、原因の手がかりになる細部が落ちる）
  const snapshot = rows
    .slice(0, 120)
    .map((r) => {
      const when = new Date(r.occurred_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      return [
        `- id:${r.id}`,
        `  分類:${incidentCategoryLabel(r.category)} 重大度:${r.severity} 日時:${when}`,
        `  場所:${r.store_name ?? "-"}${r.place ? ` / ${r.place}` : ""} 対象:${r.involved ?? "-"}`,
        `  内容:${r.body.replace(/\n/g, " ").slice(0, 300)}`,
        r.action_taken ? `  対応:${r.action_taken.replace(/\n/g, " ").slice(0, 200)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const system = [
    "あなたはゴルフ練習場・インドアゴルフスタジオ（GOLF WING / FRANK GOLF）の店舗運営を分析する担当です。",
    "スタッフが書いたイレギュラー報告（クレーム・設備トラブル・ミスなど）を読み、同じことが繰り返されないようにする改善策をまとめます。",
    "",
    "守ること:",
    "- 報告に書かれていない事実を作らない。推測は cause に書き、pattern には事実だけを書く。",
    "- prevention は今週から実行できる具体的な行動にする（「注意する」「意識する」は禁止。誰が・いつ・何を確認するかを書く）。",
    "- 個人を責める書き方をしない。仕組みで防ぐ案にする。",
    "- 1件しかない出来事でも、重大なら取り上げてよい。",
    "- 最大5件。優先度の高い順。",
    "",
    '出力は必ず次のJSONのみ: {"insights":[{"title":"20字程度の見出し","pattern":"何が繰り返されているか(事実)","cause":"推定原因","prevention":"具体的な再発防止策","incident_ids":["根拠にした報告のid"]}]}',
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.CEO_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: `イレギュラー報告 全${rows.length}件:\n${snapshot}` }],
      }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      insights?: { title?: string; pattern?: string; cause?: string; prevention?: string; incident_ids?: string[] }[];
    };
    const valid = new Set(rows.map((r) => r.id));
    const out = (parsed.insights ?? [])
      .filter((i) => i?.title && i?.pattern && i?.prevention)
      .slice(0, 5)
      .map((i) => {
        // AIが返したidのうち実在するものだけ採用（存在しないidを根拠に置かない）
        const ids = (i.incident_ids ?? []).map(String).filter((id) => valid.has(id));
        const cats = [...new Set(rows.filter((r) => ids.includes(r.id)).map((r) => normalizeIncidentCategory(r.category)))];
        const stores = [...new Set(rows.filter((r) => ids.includes(r.id)).map((r) => r.store_id).filter(Boolean))] as string[];
        return {
          title: String(i.title).slice(0, 80),
          pattern: String(i.pattern).slice(0, 800),
          cause: i.cause ? String(i.cause).slice(0, 500) : null,
          prevention: String(i.prevention).slice(0, 800),
          categories: cats,
          incident_ids: ids.slice(0, 20),
          store_id: stores.length === 1 ? stores[0] : null,
        };
      });
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * 分析を実行し sp_incident_insights に保存する。
 * 既存の open/doing な insight と同じタイトルは作り直さない（人が対応中のものを消さない）。
 */
export async function runIncidentAnalysis(
  companyId: string,
  opts: { days?: number } = {}
): Promise<{ created: number; engine: "claude" | "rule" | "none"; incidents: number }> {
  const admin = createAdmin();
  const days = opts.days ?? 90;
  const rows = await loadIncidents(admin, companyId, days);
  if (rows.length === 0) return { created: 0, engine: "none", incidents: 0 };

  const ai = await claudeInsights(rows);
  const drafts = ai ?? ruleBasedInsights(rows);
  const engine: "claude" | "rule" = ai ? "claude" : "rule";
  if (drafts.length === 0) return { created: 0, engine, incidents: rows.length };

  const periodEnd = new Date().toISOString().slice(0, 10);
  const periodStart = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  // 進行中のものと同じ見出しは重複させない
  const { data: existing } = await admin
    .from("sp_incident_insights")
    .select("title, status")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["open", "doing"]);
  const busy = new Set((existing ?? []).map((e) => String(e.title)));

  const fresh = drafts.filter((d) => !busy.has(d.title));
  if (fresh.length === 0) return { created: 0, engine, incidents: rows.length };

  const { error } = await admin.from("sp_incident_insights").insert(
    fresh.map((d) => ({
      company_id: companyId,
      store_id: d.store_id,
      period_start: periodStart,
      period_end: periodEnd,
      title: d.title,
      pattern: d.pattern,
      cause: d.cause,
      prevention: d.prevention,
      categories: d.categories,
      incident_ids: d.incident_ids,
      incident_count: d.incident_ids.length,
      generated_by: engine === "claude" ? "ai" : "rule",
    }))
  );
  if (error) return { created: 0, engine, incidents: rows.length };

  return { created: fresh.length, engine, incidents: rows.length };
}
