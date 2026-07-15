import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { StepTarget } from "@/lib/directives";

/* ============================================================
   工程プランナー（DECISIONS #59）
   改善提案の「実行手順」を、担当（スタッフ / AI社員）まで割り当てた
   工程リストに分解する。Claude があれば実データ（人員名簿・AI社員の役割）
   を読ませて下書きし、無ければルールベースで手順を工程に割る。
   ここで作るのは「下書き」= 古川さんが画面で修正して確定する（VISION §7）。
   ============================================================ */

export type DraftStep = {
  title: string;
  detail: string;
  target_kind: StepTarget;
  staff_id: string | null;
  agent_id: string | null;
};

type Staff = { id: string; name: string };
type Agent = { id: string; name: string; code: string; role?: string | null };

type SuggestionLike = {
  title: string;
  body?: string | null;
  suggested_action?: string | null;
};

async function loadRoster(companyId: string): Promise<{ staff: Staff[]; agents: Agent[] }> {
  const admin = createAdmin();
  const [staffRes, agentRes] = await Promise.all([
    admin.from("staff").select("id, name").eq("company_id", companyId).eq("status", "active").is("deleted_at", null).order("name"),
    admin.from("ai_agents").select("id, name, code, role").eq("company_id", companyId).is("deleted_at", null).order("code"),
  ]);
  return { staff: (staffRes.data ?? []) as Staff[], agents: (agentRes.data ?? []) as Agent[] };
}

/** 名前/コードのゆるいマッチで担当IDを引く（見つからなければ null＝人が選ぶ） */
function matchStaff(hint: string | null | undefined, staff: Staff[]): string | null {
  if (!hint) return null;
  const h = hint.trim();
  const hit = staff.find((s) => s.name && (h.includes(s.name) || s.name.includes(h)));
  return hit?.id ?? null;
}
function matchAgent(hint: string | null | undefined, agents: Agent[]): string | null {
  if (!hint) return null;
  const h = hint.trim().toLowerCase();
  const hit =
    agents.find((a) => a.code && h.includes(a.code.toLowerCase())) ??
    agents.find((a) => a.name && (hint!.includes(a.name) || a.name.includes(hint!)));
  return hit?.id ?? null;
}

/* ---------- ルールベース（Claude無し/失敗時のフォールバック） ---------- */
function splitAction(text: string): string[] {
  if (!text) return [];
  // ①②③ / 1. 2. / 改行 / 「→」 で分割
  const byCircled = text.split(/[①②③④⑤⑥⑦⑧⑨⑩]/).map((s) => s.trim()).filter(Boolean);
  if (byCircled.length >= 2) return byCircled;
  const byArrow = text.split(/\s*(?:→|=>)\s*/).map((s) => s.trim()).filter(Boolean);
  if (byArrow.length >= 2) return byArrow;
  const byLine = text.split(/\n+/).map((s) => s.replace(/^\s*(?:\d+[.)、]|[-・])\s*/, "").trim()).filter(Boolean);
  if (byLine.length >= 2) return byLine;
  return [text.trim()];
}

// スタッフ寄り/AI寄りをキーワードで推定
const AI_HINTS = ["配信案", "文面", "投稿案", "下書き", "分析", "案を作", "アップ", "生成", "作成案", "リスト作成", "レポート"];
const STAFF_HINTS = ["撮影", "動画", "台本", "ヒアリング", "配布", "電話", "訪問", "声かけ", "設置", "編集", "接客", "面談"];

function guessTarget(text: string): StepTarget {
  const ai = AI_HINTS.some((k) => text.includes(k));
  const staff = STAFF_HINTS.some((k) => text.includes(k));
  if (staff && !ai) return "staff";
  if (ai && !staff) return "ai_agent";
  // 既定はスタッフ（現場が動く前提）
  return "staff";
}

function ruleDraft(s: SuggestionLike): DraftStep[] {
  const parts = splitAction(s.suggested_action ?? s.body ?? s.title);
  return parts.slice(0, 8).map((p) => ({
    title: p.length > 60 ? p.slice(0, 60) : p,
    detail: p.length > 60 ? p : "",
    target_kind: guessTarget(p),
    staff_id: null,
    agent_id: null,
  }));
}

/* ---------- Claude（実データを読ませて担当まで下書き） ---------- */
async function claudeDraft(s: SuggestionLike, staff: Staff[], agents: Agent[]): Promise<DraftStep[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const staffList = staff.map((p) => p.name).join(" / ") || "（登録なし）";
  const agentList = agents.map((a) => `${a.code}=${a.name}${a.role ? `（${a.role}）` : ""}`).join("\n") || "（登録なし）";

  const system = [
    "あなたはYOZAN（インドアゴルフ GOLF WING が本丸）のCEO AI。改善提案を『現場が実際に回る工程』へ分解する。",
    "各工程は『誰が・何を・どうやって』まで具体化する。曖昧な工程（例:『検討する』『頑張る』）は禁止。",
    "撮影・台本・配布・ヒアリング・接客など現場作業は担当=staff。文面/配信案/分析/下書き/広告アップなどPC上の作業は担当=ai_agent。",
    "担当は必ず下記の名簿から選ぶ（assignee にスタッフ名 または AI社員コードを入れる。適任が不明なら空文字）。",
    `## スタッフ名簿\n${staffList}`,
    `## AI社員（コード=名前）\n${agentList}`,
    '出力は次のJSONのみ: {"steps":[{"seq":1,"title":"20〜40字","detail":"やり方・台本・手順を1〜2文","target_kind":"staff|ai_agent","assignee":"名前orコードor空"}]}',
    "工程は実行順に3〜7件。前工程の成果物を次工程が使う連鎖にする。",
  ].join("\n");

  const user = [
    `## 改善提案\nタイトル: ${s.title}`,
    s.body ? `背景: ${s.body}` : "",
    s.suggested_action ? `実行手順(要分解): ${s.suggested_action}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.CEO_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1600,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { steps?: { title?: string; detail?: string; target_kind?: string; assignee?: string }[] };
    const rows = (parsed.steps ?? [])
      .filter((st) => st.title)
      .slice(0, 8)
      .map((st) => {
        const target: StepTarget = st.target_kind === "ai_agent" ? "ai_agent" : "staff";
        return {
          title: String(st.title).slice(0, 80),
          detail: st.detail ? String(st.detail) : "",
          target_kind: target,
          staff_id: target === "staff" ? matchStaff(st.assignee, staff) : null,
          agent_id: target === "ai_agent" ? matchAgent(st.assignee, agents) : null,
        } as DraftStep;
      });
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/** 改善提案を工程リストに下書き分解する。戻り値はDBに保存しない（画面で編集→確定）。 */
export async function draftCampaignSteps(companyId: string, suggestion: SuggestionLike): Promise<{ steps: DraftStep[]; engine: "claude" | "rules" }> {
  const { staff, agents } = await loadRoster(companyId);
  const viaClaude = await claudeDraft(suggestion, staff, agents);
  if (viaClaude && viaClaude.length > 0) return { steps: viaClaude, engine: "claude" };
  return { steps: ruleDraft(suggestion), engine: "rules" };
}
