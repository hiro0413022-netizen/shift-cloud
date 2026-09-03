import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { askData } from "@yozan/core/ask-data";
import { jstYmd } from "@/lib/jst";
import {
  getCockpitData,
  computeGenesisScore,
  applyJudgmentPenalties,
  buildJudgmentList,
  alertKey,
  getAckedAlertKeys,
} from "@/lib/kernel";
import { getJudgmentFeed, type JudgmentItem } from "@/lib/judgment-feed";
import type { GenesisActor } from "@/lib/auth";
import {
  NAV_MAP,
  findNav,
  toBriefing,
  openingLine,
  jstHour,
  parseDecision,
  normalizePriority,
  alertTag,
  isActType,
  ACT_TYPES,
  type JarvisBriefing,
} from "@/lib/jarvis-pure";
import { enqueueAction } from "@/lib/ai-execution";

// 純粋な部分は jarvis-pure.ts（テスト tests/jarvis.test.ts で固定）。画面からはここ経由で使う。
export { toBriefing, openingLine, jstHour, NAV_MAP, alertTag };
export type { JarvisBriefing, BriefKpi } from "@/lib/jarvis-pure";

/* ============================================================
   JARVIS — ホームの対話AI（migration 0133 / DECISIONS #182）

   なぜ作るか（2026-08-28 ユーザー依頼）:
     「アイアンマンのジャービスのような会話型のAIにしていきたい」
     これまでのホームは "見る画面" で、見に行かないと何も起きなかった。
     話しかけたら答え、案内し、開発依頼まで受け取る面にする。

   ハルシネーション対策（Ask Data と同じ思想を引き継ぐ）:
     - 数字を含む質問は JARVIS が自分で答えない。Ask Data に丸投げし、
       SQLをPostgresに実行させた結果だけを読み上げる（生成SQLと件数も返す）。
     - ブリーフィング（スコア・判断件数・5大KPI）は画面と同じ計算済みの値を
       そのまま渡す。ここに無い数字を語らせない。

   権限（VISION §7 の線引きは崩さない）:
     - JARVIS が単独で実行してよい: 調べる・案内する・下書きを作る・開発依頼を積む
     - 人の承認が要る: 外部送信・課金・本番デプロイ・本番DB変更・契約
       → 承認はこれまで通りホームの判断フィードのボタンで行う。
   ============================================================ */

const MODEL = process.env.JARVIS_MODEL || "claude-sonnet-4-5-20250929";


/** サーバーアクション側から（画面のデータを持っていないとき）ブリーフィングを作り直す */
export async function loadBriefing(actor: GenesisActor, storeIds: string[] | null): Promise<JarvisBriefing> {
  const [d, feed, ackedKeys] = await Promise.all([
    getCockpitData(actor.companyId, storeIds),
    getJudgmentFeed(actor.companyId, storeIds).catch(() => [] as JudgmentItem[]),
    getAckedAlertKeys(actor.companyId).catch(() => new Set<string>()),
  ]);
  const alerts = buildJudgmentList(d)
    .filter((j) => j.kind !== "approval")
    .filter((j) => !ackedKeys.has(alertKey(j)));
  const { score, grade, factors } = applyJudgmentPenalties(computeGenesisScore(d), alerts);
  return toBriefing({
    name: actor.name,
    score,
    grade,
    factors,
    approvals: d.approvals.length,
    feed,
    alerts,
    kpis: d.kpis as unknown as Record<string, unknown>[],
    recentEvents: d.recentEvents as unknown as { title: unknown }[],
    today: jstYmd(),
  });
}


/* ------------------------------------------------------------
   1回の会話
------------------------------------------------------------ */
export type JarvisTurnInput = {
  actor: GenesisActor;
  storeIds: string[] | null;
  said: string;
  history: { role: "user" | "assistant"; text: string }[];
  inputMode: "text" | "voice";
};

export type JarvisReply = {
  intent: "data" | "navigate" | "dev" | "talk" | "act" | "error";
  reply: string;
  link: { href: string; label: string } | null;
  dev: { id: string; title: string } | null;
  /** #186: 積んだ操作（取消枠つき）。画面は「◯分後に実行・取り消せます」と出す */
  act: { id: string; title: string; runsAt: string; mode: string } | null;
  sql: string | null;
  rowCount: number | null;
  rows: Record<string, unknown>[];
  error: string | null;
  elapsedMs: number;
};

function systemPrompt(b: JarvisBriefing): string {
  return [
    "あなたは株式会社YOZANの統合AI「GENESIS」です。社長（古川博庸）の分身として、全社の状況を常に見ています。",
    "話し方: 落ち着いた執事。簡潔に1〜3文。前置き・相槌・謝罪をしない。相手は「" + b.name + "さん」と呼ぶ。",
    "",
    "## いまの会社（この数字はすでに確定しています。ここにある事は調べ直さず即答してください）",
    `- 日付: ${b.today}`,
    `- 全体スコア: ${b.score}点（${b.grade}）${b.factors.length ? " / 減点: " + b.factors.join("・") : " / 減点要因なし"}`,
    `- 本日の判断: ${b.decisionCount}件`,
    ...b.topDecisions.map((t) => `  - [${t.tag}] ${t.title}`),
    "- 5大KPI:",
    ...b.kpis.map((k) => `  - ${k.name}: ${k.value ?? "未取得"}${k.unit}${k.target != null ? `（目標 ${k.target}${k.unit}）` : ""}`),
    "- AIの直近の動き:",
    ...b.recent.map((r) => `  - ${r}`),
    "",
    "## あなたができること（必ず次のどれか1つを選ぶ）",
    "1. talk — 上のブリーフィングと会話の流れだけで答えられる。所感・要約・段取りの相談もここ。",
    "2. data — 上に無い数字を聞かれた。社内DB（売上・会員・体験・勤怠・給与・経理・契約・キャディ）に問い合わせる。",
    "   question に「調べたい内容を1文」で書く。あなたは数字を書かない（DBが計算した値だけを後で読み上げる）。",
    "3. navigate — その話は特定の画面を開くのが早い。href は次の一覧から選ぶ:",
    ...NAV_MAP.map((n) => `   ${n.href} = ${n.label}（${n.about}）`),
    "4. act — その場で実行してよい操作。**入れてから5分間は取り消せる**（ホームの「実行予定」に出る）。",
    "   act.type は次のどれか:",
    "     booking_create … FRANKの打席予約を入れる。args: {date:'YYYY-MM-DD', start:'HH:MM', minutes:60, guest_name または member_no, phone?, party_size?, bay_name?, lefty?, note?}",
    "     booking_cancel … 予約を取り消す。args: {booking_id}（IDが分からなければ act にせず data で先に調べる）",
    "     walkin_add     … 受付台帳に来店/体験を1件。args: {guest_name, visited_on:'YYYY-MM-DD', visit_type:'trial'|'visit', kana?, phone?, note?}",
    "     staff_directive… スタッフへ公式LINEで連絡。args: {body, store?}",
    "                      store は宛先の店舗名（例: 'FRANK' / '姫路' / 'GOLF WING' / '宝塚'）。",
    "                      **その店の話はその店のグループにしか流さない**（他店のLINEに出さない）。",
    "                      全店に伝えることだけ store を省く。",
    "   **日付は必ず YYYY-MM-DD に直す**（「明日」は上の日付から計算）。時刻は HH:MM。",
    "   **足りない情報があるときは act にしない**。talk で1つだけ聞き返す（例: お名前は？ 何時からですか？）。",
    "   reply には「何を・いつ・誰の分で入れるか」と「5分以内なら取り消せる」ことを必ず入れる。",
    "5. dev — システムの追加・修正・不具合の依頼。「〜できるようにして」「〜が動かない」「〜を直して」など。",
    "   dev.title に一行で要件、dev.app に触りそうなアプリ（genesis / member-os / lesson-os / shift-cloud / money-os / swing-cortex / frank-golf / その他）、",
    "   dev.priority に urgent | normal | low。",
    "",
    "## 出力形式（JSONのみ。前後に文章やコードフェンスを付けない）",
    '{"intent":"talk|data|navigate|dev|act","reply":"読み上げる日本語","question":"dataのときだけ","href":"navigateのときだけ","dev":{"title":"","app":"","priority":""},"act":{"type":"","args":{}}}',
    "",
    "## 厳守",
    "- ブリーフィングに無い数字を自分で書かない（推測・概算・一般論の数字は禁止）。数字が要るなら intent=data。",
    "- お客様への送信・課金・本番デプロイ・契約は act にしない（承認が要る）。navigate で承認画面へ案内する。",
    "- 推測で予約を入れない。日付・時刻・お名前のどれかが曖昧なら、必ず talk で聞き返す。",
    "- reply は必ず日本語で、そのまま音声で読み上げられる文にする（記号・箇条書き・URLを入れない）。",
  ].join("\n");
}

async function callClaude(system: string, messages: { role: "user" | "assistant"; content: string }[], maxTokens: number): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function jarvisTurn(input: JarvisTurnInput): Promise<JarvisReply> {
  const started = Date.now();
  const said = input.said.trim().slice(0, 500);
  const admin = createAdmin();

  const base: JarvisReply = {
    intent: "talk", reply: "", link: null, dev: null, act: null, sql: null, rowCount: null, rows: [], error: null, elapsedMs: 0,
  };

  if (!said) return { ...base, intent: "error", reply: "もう一度お願いします。", error: "empty", elapsedMs: 0 };

  const briefing = await loadBriefing(input.actor, input.storeIds);

  const messages = [
    ...input.history.slice(-8).map((h) => ({ role: h.role, content: h.text })),
    { role: "user" as const, content: said },
  ];

  const raw = await callClaude(systemPrompt(briefing), messages, 700);
  if (!raw) {
    const out = {
      ...base,
      intent: "error" as const,
      reply: "いま思考を担当するAIに繋がりません。数字は「データに聞く」から確認してください。",
      error: "llm_unavailable",
      elapsedMs: Date.now() - started,
    };
    await logTurn(admin, input, out, briefing);
    return out;
  }

  const decision = parseDecision(raw);
  if (!decision) {
    const out = { ...base, reply: raw.slice(0, 400), elapsedMs: Date.now() - started };
    await logTurn(admin, input, out, briefing);
    return out;
  }

  let out: JarvisReply = { ...base, reply: (decision.reply ?? "").trim(), elapsedMs: 0 };

  if (decision.intent === "data") {
    const q = (decision.question ?? said).trim();
    const ask = await askData({
      question: q.slice(0, 500),
      companyId: input.actor.companyId,
      staffId: input.actor.staffId,
      scope: "hq",
      admin,
    });
    out = {
      ...out,
      intent: "data",
      reply: ask.answer,
      sql: ask.sql,
      rowCount: ask.rowCount,
      rows: ask.rows.slice(0, 20),
      error: ask.error,
    };
  } else if (decision.intent === "navigate") {
    const hit = findNav(decision.href);
    out = {
      ...out,
      intent: hit ? "navigate" : "talk",
      link: hit ? { href: hit.href, label: hit.label } : null,
      reply: out.reply || (hit ? `${hit.label}を開きます。` : "どの画面をご覧になりますか。"),
    };
  } else if (decision.intent === "act") {
    const type = decision.act?.type;
    if (!isActType(type)) {
      out = { ...out, intent: "talk", reply: out.reply || "その操作はまだできません。" };
    } else {
      const done = await enqueueJarvisAction({
        admin,
        actor: input.actor,
        type,
        args: (decision.act?.args ?? {}) as Record<string, unknown>,
        said,
      });
      out = {
        ...out,
        intent: done ? "act" : "talk",
        act: done,
        reply: out.reply || (done ? "承知しました。5分以内なら取り消せます。" : "うまく積めませんでした。"),
        error: done ? null : "enqueue_failed",
      };
    }
  } else if (decision.intent === "dev") {
    const created = await createDevRequest({
      admin,
      actor: input.actor,
      said,
      title: (decision.dev?.title ?? said).slice(0, 120),
      app: decision.dev?.app ?? null,
      priority: normalizePriority(decision.dev?.priority),
      briefing,
    });
    out = {
      ...out,
      intent: "dev",
      dev: created,
      reply: out.reply || (created ? `開発依頼として受け付けました。指示書に起こしてキューへ積んでいます。` : "開発依頼を保存できませんでした。"),
    };
  }

  out.elapsedMs = Date.now() - started;
  await logTurn(admin, input, out, briefing);
  return out;
}

/* ------------------------------------------------------------
   操作を実行キューへ（#186）

   直接DBに書かない。**必ず ai_action_queue を通す**。理由:
     - 実行モード（取消枠5分）と取り消しUIが既にそこにある（#61・ホームの「実行予定」）
     - 実行の瞬間に空きを見直せる（積んだ時点と5分後で状況が変わる）
     - 監査ログと失敗理由が1か所に残る
   ai_execution_policies が approval のものは、ここに積むと承認カードになる（＝勝手に実行されない）。
------------------------------------------------------------ */
async function enqueueJarvisAction(args: {
  admin: ReturnType<typeof createAdmin>;
  actor: GenesisActor;
  type: string;
  args: Record<string, unknown>;
  said: string;
}): Promise<{ id: string; title: string; runsAt: string; mode: string } | null> {
  const payload: Record<string, unknown> = { ...args.args, _said: args.said };
  // 受付台帳は店舗が要る。指定が無ければ本人の主所属に寄せる
  if (args.type === "walkin_add" && !payload.store_id) {
    payload.store_id = args.actor.primaryStoreId ?? args.actor.storeIds[0] ?? null;
  }
  /* スタッフ連絡の宛先（#198）:
       これまでは宛先を書かないと「既定のグループ」＝GOLF WING だけに届き、
       **FRANKのスタッフには一生届かない**（しかもFRANKの話がGWに出る）。
       ①言われた店舗名 → ②本人が1店舗しか持たないならその店 → ③どれでもなければ全店（両方のグループ）。 */
  if (args.type === "staff_directive" && !payload.store_id && !payload.group_id && !payload.target) {
    const wantStore = String(payload.store ?? "").trim();
    delete payload.store;
    let storeId: string | null = null;
    if (wantStore) {
      const { data: stores } = await args.admin
        .from("stores")
        .select("id, name")
        .eq("company_id", args.actor.companyId)
        .is("deleted_at", null);
      const norm = (s: string) => s.toLowerCase().replace(/[\s\u3000]/g, "");
      const w = norm(wantStore);
      const hit = (stores ?? []).filter((s) => {
        const n = norm(String(s.name));
        return n.includes(w) || w.includes(n);
      });
      // 1つに決まらないときは寄せない（間違った店に流すより全店の方が安全）
      if (hit.length === 1) storeId = String(hit[0].id);
    }
    if (!storeId && !args.actor.isOwner && args.actor.storeIds.length === 1) storeId = args.actor.storeIds[0];
    if (storeId) payload.store_id = storeId;
    else payload.target = "all";
  }
  const title = actionTitle(args.type, args.args);
  try {
    const r = await enqueueAction(args.admin, {
      companyId: args.actor.companyId,
      actionType: args.type,
      title,
      payload,
      originKind: "jarvis",
      createdBy: args.actor.staffId,
    });
    if (!r.id) return null;
    return { id: r.id, title, runsAt: r.scheduledAt, mode: r.mode };
  } catch {
    return null;
  }
}

function actionTitle(type: string, a: Record<string, unknown>): string {
  const who = String(a.guest_name ?? a.member_no ?? "");
  switch (type) {
    case "booking_create":
      return `予約を入れる: ${String(a.date ?? "")} ${String(a.start ?? "")} ${who}`.trim();
    case "booking_cancel":
      return "予約を取り消す";
    case "walkin_add":
      return `受付台帳に登録: ${String(a.visited_on ?? "")} ${who}`.trim();
    case "staff_directive": {
      const to = String(a.store ?? "").trim();
      return `スタッフへ連絡${to ? `（${to}）` : "（全店）"}: ${String(a.body ?? "").slice(0, 40)}`;
    }
    default:
      return type;
  }
}

/* ------------------------------------------------------------
   開発依頼 → 正式な指示書に起こしてキューへ

   /command の generatePrompt と同じ型（背景・現在の状態・目的・変更対象・注意点・
   完了条件・禁止事項）で書く。Cowork側のClaudeはこの spec だけを読んで着手できる。
   AIが落ちても依頼そのものは必ず残す（テンプレートだけで積む）。
------------------------------------------------------------ */
const SPEC_SYSTEM = [
  "あなたはYOZANの開発ディレクターです。社長の一言を、実装者（Claude Code）がそのまま着手できる開発指示書に起こします。",
  "リポジトリは monorepo（apps/genesis, member-os, lesson-os, shift-cloud, money-os, swing-cortex, caddy-os, legal-os, report-os ほか / packages/core）。",
  "Next.js App Router + TypeScript + Supabase(PostgreSQL) + Tailwind v4 + Vercel。",
  "",
  "次の見出しで、日本語のMarkdownだけを出力してください（前後に説明を付けない）:",
  "## 目的 / ## 想定する対象 / ## 実装内容 / ## 注意点 / ## 完了条件 / ## 確認したいこと",
  "",
  "厳守:",
  "- 社長の言葉を勝手に広げない。書いていないことは「## 確認したいこと」に質問として置く。",
  "- 対象ファイルが特定できないときは断定せず「実装者が調査して宣言すること」と書く。",
  "- 既存の稼働機能を壊さない・1作業1機能・差分のみ・CHANGELOG.md に記録、を注意点に必ず含める。",
].join("\n");

async function createDevRequest(args: {
  admin: ReturnType<typeof createAdmin>;
  actor: GenesisActor;
  said: string;
  title: string;
  app: string | null;
  priority: "urgent" | "normal" | "low";
  briefing: JarvisBriefing;
}): Promise<{ id: string; title: string } | null> {
  const ai = await callClaude(
    SPEC_SYSTEM,
    [{ role: "user", content: `社長の依頼（原文）:\n${args.said}\n\n一行要件: ${args.title}\n想定アプリ: ${args.app ?? "不明"}\n本日: ${args.briefing.today}` }],
    1200
  );

  const spec = [
    ai ??
      [
        "## 目的",
        args.title,
        "",
        "## 想定する対象",
        args.app ? `apps/${args.app}（推定）` : "実装者が調査して宣言すること",
        "",
        "## 実装内容",
        args.said,
        "",
        "## 確認したいこと",
        "（AIによる整形が使えなかったため、原文のまま残しています）",
      ].join("\n"),
    "",
    "---",
    "## 禁止事項（VISION §7 AI権限の線引き）",
    "- 本番への直接デプロイ / 本番DBの破壊的変更 / シークレットのコミット",
    "- 外部への実送信（メール・LINE・顧客連絡）/ 課金 / 個人情報の外部持ち出し",
    "- DECISIONS.md にある決定の再議論",
    "",
    "## 依頼の出どころ",
    `Genesis ホームの対話AI（JARVIS）で ${args.briefing.today} に受け付け。原文は said 列にそのまま保存。`,
  ].join("\n");

  const { data, error } = await args.admin
    .from("gn_dev_requests")
    .insert({
      company_id: args.actor.companyId,
      requested_by: args.actor.staffId,
      source: "jarvis",
      title: args.title,
      said: args.said,
      spec,
      app_hint: args.app,
      priority: args.priority,
      status: "queued",
    })
    .select("id, title")
    .single();

  if (error || !data) return null;
  return { id: String(data.id), title: String(data.title) };
}

/* ------------------------------------------------------------
   ログ（失敗しても会話は止めない）
------------------------------------------------------------ */
async function logTurn(
  admin: ReturnType<typeof createAdmin>,
  input: JarvisTurnInput,
  out: JarvisReply,
  briefing: JarvisBriefing
) {
  try {
    await admin.from("gn_jarvis_turns").insert({
      company_id: input.actor.companyId,
      staff_id: input.actor.staffId,
      said: input.said.slice(0, 500),
      intent: out.intent,
      reply: out.reply,
      action: {
        link: out.link,
        dev: out.dev,
        act: out.act,
        score: briefing.score,
        decisions: briefing.decisionCount,
      },
      generated_sql: out.sql,
      row_count: out.rowCount,
      input_mode: input.inputMode,
      elapsed_ms: out.elapsedMs,
      error: out.error,
    });
  } catch {
    /* ログの失敗で会話を止めない */
  }
}
