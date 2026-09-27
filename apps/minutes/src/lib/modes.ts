/**
 * 要約モード（2026-09-27 ユーザー構想「ゴルフレッスンのように状況に応じて要約を変える」）
 *
 * どのモードでも必ず出す「共通の核」＝ 決定事項 / ToDo（担当・期限）/ 未決事項。
 * そのうえでモードごとに「何を抜き出すか（sections）」と「何を書いてはいけないか（rules）」を変える。
 *
 * 全モード共通の約束（Lesson OS 会話メモ #179/#181 から引き継ぎ）:
 *   - 発言を言い換えない。各項目に根拠の発言（q）を原文のまま付けさせ、サーバー側で文字起こしと照合する。
 *   - 録音に無いことは書かない。推測・一般論・助言の追加は禁止。
 *   - AIの出力は下書き。人が確定した本文だけが正式な議事録。
 *
 * ⚠ 純粋関数だけ（テスト tests/minutes-modes.test.ts）。
 */
import type { Level } from "./levels";

export type ModeId =
  | "general"
  | "contract"
  | "dev"
  | "sales"
  | "hearing"
  | "legal"
  | "lawyer"
  | "one_on_one";

export type Section = { key: string; label: string; hint: string };

export type Mode = {
  id: ModeId;
  label: string;
  desc: string;
  /** このモードを使える最低の機密レベル。lawyer は L3 でしか動かない */
  requiresLevel?: Level;
  sections: Section[];
  rules: string[];
};

export const MODES: Mode[] = [
  {
    id: "general",
    label: "社内定例・一般",
    desc: "定例会議・打ち合わせ全般",
    sections: [{ key: "topics", label: "話し合ったこと", hint: "議題ごとの要点。誰が何を言ったか" }],
    rules: ["議題ごとにまとめる。雑談は入れない。"],
  },
  {
    id: "contract",
    label: "契約・商談",
    desc: "条件交渉・契約前の打ち合わせ",
    sections: [
      { key: "terms", label: "条件（金額・期間・範囲）", hint: "金額・数量・期間・納期・支払条件・対象範囲。数字は発言のまま" },
      { key: "their_requests", label: "相手の要望・懸念", hint: "相手側が求めたこと、心配していること" },
      { key: "our_promises", label: "こちらが約束したこと", hint: "こちらが『やります』『出します』と言ったこと" },
      { key: "not_agreed", label: "まだ合意していないこと", hint: "持ち帰り・検討中・保留になった条件" },
    ],
    rules: [
      "金額・日付・数量は発言どおりに書く。丸めない・計算しない・円や税込/税抜を補わない。",
      "『合意した』と書いてよいのは、双方が了承した発言があるものだけ。片方が言っただけなら『まだ合意していないこと』に入れる。",
    ],
  },
  {
    id: "dev",
    label: "開発会議",
    desc: "仕様・設計・実装の打ち合わせ",
    sections: [
      { key: "spec", label: "決まった仕様", hint: "画面・機能・データの決定" },
      { key: "rejected", label: "採らなかった案とその理由", hint: "検討して却下したもの。理由が話されていれば必ず残す" },
      { key: "issues", label: "技術的な課題・リスク", hint: "未解決の不具合・懸念・調べること" },
      { key: "next_units", label: "次に作るもの", hint: "次の実装単位・順番" },
    ],
    rules: ["『なぜそうしたか』が話されていれば必ず残す（あとで同じ議論を繰り返さないため）。"],
  },
  {
    id: "sales",
    label: "営業会議",
    desc: "案件の進み具合・数字・打ち手",
    sections: [
      { key: "deals", label: "案件ごとの状況", hint: "案件名（会社名）ごとに、進み具合と次の一手" },
      { key: "numbers", label: "数字（目標・実績・見込み）", hint: "発言に出た数字だけ。発言のまま" },
      { key: "actions", label: "打ち手", hint: "決まった施策・やり方の変更" },
    ],
    rules: ["案件名（会社名・店舗名）で整理する。発言に無い見込み額や確度を付けない。"],
  },
  {
    id: "hearing",
    label: "顧客ヒアリング",
    desc: "お客様の困りごと・現状を聞く場",
    sections: [
      { key: "pains", label: "困りごと", hint: "お客様が困っていること。お客様の言葉のまま" },
      { key: "current", label: "いまのやり方", hint: "現状の運用・使っている道具・人数" },
      { key: "budget", label: "予算感・時期", hint: "発言に出たものだけ" },
      { key: "decider", label: "決める人・決め方", hint: "誰が決めるか、稟議など" },
      { key: "next_step", label: "次の一手", hint: "次回の約束・送るもの" },
    ],
    rules: ["お客様の言葉を言い換えない。こちらの解釈や提案を混ぜない。"],
  },
  {
    id: "legal",
    label: "法務的会議",
    desc: "契約書レビュー・トラブル対応・コンプライアンス",
    sections: [
      { key: "issues", label: "論点", hint: "争点・検討した論点" },
      { key: "risks", label: "リスク", hint: "話に出たリスクと、その大きさについての発言" },
      { key: "grounds", label: "根拠（条文・契約条項・資料）", hint: "発言で挙がった条文・条項・資料名。番号は発言のまま" },
      { key: "views", label: "見解（誰の意見か）", hint: "『〇〇さんは〜との見解』の形。対立していれば両方" },
      { key: "to_check", label: "要確認事項", hint: "調べる・確認する・専門家に聞くこと" },
    ],
    rules: [
      "結論を断定しない。法的な判断・評価をAIが加えない。『〜との見解』の形で、誰の意見かを必ず残す。",
      "条文番号・条項番号・日付は発言どおり。補わない。",
    ],
  },
  {
    id: "lawyer",
    label: "弁護士・秘匿",
    desc: "依頼者との相談・事件の打ち合わせ（L3専用）",
    requiresLevel: "L3",
    sections: [
      { key: "timeline", label: "事実関係（時系列）", hint: "日付と出来事。発言どおり" },
      { key: "client_claims", label: "依頼者の主張・希望", hint: "依頼者の言葉のまま" },
      { key: "evidence", label: "証拠・資料の有無", hint: "あると言ったもの／無いと言ったもの／確認中のもの" },
      { key: "strategy", label: "方針案", hint: "話し合った方針。弁護士の発言として" },
      { key: "deadlines", label: "期限", hint: "期日・時効・提出期限など発言に出たもの" },
    ],
    rules: [
      "法的な評価・勝ち目の判断をAIが加えない。",
      "依頼者の発言と弁護士の発言を混ぜない。",
      "日付・金額・固有名詞は発言どおり。",
    ],
  },
  {
    id: "one_on_one",
    label: "1on1・面談",
    desc: "面談・評価面談・相談",
    sections: [
      { key: "their_words", label: "本人の話", hint: "本人の言葉のまま" },
      { key: "goals", label: "合意した目標", hint: "双方が合意したもの" },
      { key: "company_promises", label: "会社側が約束したこと", hint: "上長・会社が約束したこと" },
    ],
    rules: [
      "本人の評価・性格・人物像をAIが書かない。",
      "健康・家族など私的な話は、本人が議事に残すことを求めた発言がない限り入れない。",
    ],
  },
];

export const MODE_BY_ID: Record<ModeId, Mode> = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, Mode>;

export function isModeId(v: unknown): v is ModeId {
  return typeof v === "string" && v in MODE_BY_ID;
}

const LEVEL_RANK: Record<Level, number> = { L1: 1, L2: 2, L3: 3 };

/** そのレベルの会議で選べるモード。lawyer は L3 だけ */
export function modesForLevel(level: Level): Mode[] {
  return MODES.filter((m) => !m.requiresLevel || LEVEL_RANK[level] >= LEVEL_RANK[m.requiresLevel]);
}

export function modeAllowed(mode: ModeId, level: Level): boolean {
  return modesForLevel(level).some((m) => m.id === mode);
}

/* ------------------------------------------------------------------ */
/* 要約の形                                                             */
/* ------------------------------------------------------------------ */

/** 根拠照合の結果: ok＝原文にある / near＝言い回しが少し違う / none＝原文に見当たらない */
export type QuoteCheck = "ok" | "near" | "none";

export type Item = { text: string; q: string; check?: QuoteCheck };
export type Todo = { task: string; owner: string; due: string; q: string; check?: QuoteCheck };

export type Summary = {
  mode: ModeId;
  title: string;
  overview: string;
  decisions: Item[];
  todos: Todo[];
  open: Item[];
  sections: Record<string, Item[]>;
};

export const COMMON_RULES = [
  "あなたは会議の記録係。会議の文字起こしを読み、議事録の下書きを作る。",
  "厳守すること:",
  "- **文字起こしに無いことは書かない。** 推測・一般論・助言・感想の追加は禁止。",
  "- 各項目には、根拠になった発言を q に**原文のまま**短く（15〜60字）入れる。言い換え・要約した文を q に入れない。",
  "- 根拠の発言が見つからない項目は作らない。該当が無い欄は空配列にする。",
  "- 話者名は文字起こしの表記をそのまま使う（『話者A』なら『話者A』）。",
  "- 同じ内容を複数の欄に重ねて書かない。",
  "- 雑談・あいさつ・音声確認などは入れない。",
];

/** モードごとの要約指示（system）。出力はJSONのみ */
export function summarySystem(mode: Mode): string {
  const sectionSchema = mode.sections
    .map((s) => `    "${s.key}": [ { "text": "${s.label}（${s.hint}）", "q": "根拠の発言" } ]`)
    .join(",\n");
  return [
    ...COMMON_RULES,
    "",
    `この会議の種類: 「${mode.label}」（${mode.desc}）`,
    "この種類の会議で特に守ること:",
    ...mode.rules.map((r) => `- ${r}`),
    "",
    "出力は次のJSONのみ（前置き・説明文なし）:",
    "{",
    '  "title": "会議の件名（20字以内・発言から）",',
    '  "overview": "全体の要点を3〜5文で。文字起こしに無いことは書かない",',
    '  "decisions": [ { "text": "決まったこと", "q": "根拠の発言" } ],',
    '  "todos": [ { "task": "やること", "owner": "担当（発言に無ければ空文字）", "due": "期限（発言のまま。無ければ空文字）", "q": "根拠の発言" } ],',
    '  "open": [ { "text": "決まらなかったこと・持ち越し", "q": "根拠の発言" } ],',
    '  "sections": {',
    sectionSchema,
    "  }",
    "}",
  ].join("\n");
}

/** モードの自動判定（要約モードをAIに「提案」させる。確定は人） */
export function classifySystem(candidates: Mode[]): string {
  return [
    "会議の文字起こしの冒頭を読んで、会議の種類を1つ選ぶ。",
    "候補（id: 名前 — 説明）:",
    ...candidates.map((m) => `- ${m.id}: ${m.label} — ${m.desc}`),
    "迷ったら general。候補に無い id は返さない。",
    '出力は次のJSONのみ: { "mode": "id", "reason": "20字以内" }',
  ].join("\n");
}

export function parseClassify(raw: unknown, candidates: Mode[]): ModeId {
  const obj = asObj(raw);
  const m = obj?.mode;
  return candidates.some((c) => c.id === m) ? (m as ModeId) : "general";
}

/* ------------------------------------------------------------------ */
/* AIの返事を正規化する（型が崩れていても落ちない・余計な欄は捨てる）   */
/* ------------------------------------------------------------------ */

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function items(v: unknown, max = 30): Item[] {
  if (!Array.isArray(v)) return [];
  const out: Item[] = [];
  for (const x of v) {
    const o = asObj(x);
    const text = o ? str(o.text, 400) : str(x, 400);
    if (!text) continue;
    out.push({ text, q: o ? str(o.q, 200) : "" });
    if (out.length >= max) break;
  }
  return out;
}

function todos(v: unknown, max = 40): Todo[] {
  if (!Array.isArray(v)) return [];
  const out: Todo[] = [];
  for (const x of v) {
    const o = asObj(x);
    if (!o) continue;
    const task = str(o.task, 300);
    if (!task) continue;
    out.push({ task, owner: str(o.owner, 60), due: str(o.due, 60), q: str(o.q, 200) });
    if (out.length >= max) break;
  }
  return out;
}

export function parseSummary(raw: unknown, mode: Mode): Summary {
  const o = asObj(raw) ?? {};
  const sec = asObj(o.sections) ?? {};
  const sections: Record<string, Item[]> = {};
  // モードで決めた欄だけ拾う（AIが勝手に足した欄は捨てる）
  for (const s of mode.sections) sections[s.key] = items(sec[s.key]);
  return {
    mode: mode.id,
    title: str(o.title, 60),
    overview: str(o.overview, 1500),
    decisions: items(o.decisions),
    todos: todos(o.todos),
    open: items(o.open),
    sections,
  };
}

/**
 * 画面で編集する本文の初期値（確定前の下書きテキスト）。確定後はこの本文が正典。
 * ToDo は本文に入れない（担当・期限を表で直すので、本文と二重になってズレるのを防ぐ）。
 */
export function summaryToText(s: Summary, mode: Mode): string {
  const lines: string[] = [];
  const list = (label: string, xs: Item[]) => {
    if (!xs.length) return;
    lines.push(`■ ${label}`);
    for (const x of xs) lines.push(`・${x.text}`);
    lines.push("");
  };
  if (s.overview) {
    lines.push("■ 概要", s.overview, "");
  }
  list("決定事項", s.decisions);
  for (const sec of mode.sections) list(sec.label, s.sections[sec.key] ?? []);
  list("未決事項・持ち越し", s.open);
  return lines.join("\n").trim();
}
