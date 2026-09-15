/**
 * オンラインレッスンの返信文づくり（純関数 / サーバー・クライアント両用）
 *
 * AIに渡す材料を組み立てるところだけをここに置く（呼び出しは online-actions.ts）。
 *
 * 大事な決まり:
 *   1. **AIは動画を見ていない。** 動きについての指摘は、コーチのメモに書いてあることだけ。
 *      メモが空なら動きを断定しない（「確認して〜」「送ってください」に留める）。
 *   2. **URLは作らせない。** 参考動画はライブラリから候補を渡し、選ばれたURLも候補に無ければ捨てる。
 *   3. 言い回しは本人の過去の返信から学ぶ（似た相談への実際の返信を例として渡す）。
 *   4. 送信はしない。出すのは下書きだけ。LINEに貼るのは本人。
 */
import { normalize } from "../jp-search.ts";

export type OnlineProfile = {
  coach_name?: string;
  service_name?: string;
  tone?: string;
  plan_rules?: { regular?: string; premium?: string; other?: string };
  signature?: string;
  max_chars?: number;
};

export const DEFAULT_PROFILE: Required<Omit<OnlineProfile, "plan_rules">> & { plan_rules: Required<NonNullable<OnlineProfile["plan_rules"]>> } = {
  coach_name: "コーチ",
  service_name: "オンラインレッスン",
  tone: "明るく丁寧な「です・ます」。良くなった点を先に褒め、直す点は1〜2個に絞る。",
  plan_rules: {
    regular: "スイングに関するアドバイスのみ。",
    premium: "スイングに加えて、コースマネジメント・練習方法・メンタル・クラブまでアドバイスしてよい。",
    other: "",
  },
  signature: "",
  max_chars: 400,
};

export function withDefaults(p: OnlineProfile | null | undefined) {
  return {
    ...DEFAULT_PROFILE,
    ...(p ?? {}),
    plan_rules: { ...DEFAULT_PROFILE.plan_rules, ...(p?.plan_rules ?? {}) },
  };
}

export const PLAN_LABEL: Record<string, string> = { regular: "レギュラー", premium: "プレミアム", other: "その他" };

export type ThreadMsg = {
  direction: "in" | "out" | "system";
  kind: string;
  body: string;
  sentAt: string;
};

export type ReplyOptions = {
  length?: "short" | "normal" | "long";
  praise?: boolean;
  nextStep?: boolean;
  askFeeling?: boolean;
  keepGoing?: boolean;
  apology?: boolean;
  extra?: string;
};

export type ExamplePair = { incoming: string; reply: string; memberName?: string; sentAt?: string };
export type VideoCand = { url: string; title: string; tags?: string[]; useCount?: number };

/* ---------------- 返信待ちの判定 ---------------- */

export function waitInfo(lastIn: string | null, lastOut: string | null, now = new Date()) {
  if (!lastIn) return { waiting: false, hours: 0 };
  if (lastOut && lastOut >= lastIn) return { waiting: false, hours: 0 };
  const hours = Math.max(0, (now.getTime() - new Date(lastIn).getTime()) / 3600000);
  return { waiting: true, hours };
}

export function waitLabel(hours: number): string {
  if (hours < 1) return "たった今";
  if (hours < 24) return `${Math.floor(hours)}時間`;
  return `${Math.floor(hours / 24)}日`;
}

/** 最後の返信より後に届いた会員の発言（＝今回返すもの）。動画・写真は件数で添える */
export function pendingIncoming(thread: ThreadMsg[]): { text: string; videos: number; photos: number; since: string | null } {
  let i = thread.length - 1;
  while (i >= 0 && thread[i].direction !== "out") i--;
  const rest = thread.slice(i + 1).filter((m) => m.direction === "in");
  const texts = rest.filter((m) => m.kind === "text").map((m) => m.body.trim()).filter(Boolean);
  return {
    text: texts.join("\n\n"),
    videos: rest.filter((m) => m.kind === "video").length,
    photos: rest.filter((m) => m.kind === "photo").length,
    since: rest[0]?.sentAt ?? null,
  };
}

/* ---------------- 過去の返信例を選ぶ ---------------- */

/** スレッド（時刻順）から「会員の相談 → 本人の返信」の組を作る */
export function buildPairs(thread: ThreadMsg[], memberName?: string): ExamplePair[] {
  const out: ExamplePair[] = [];
  let buf: string[] = [];
  let media = 0;
  for (const m of thread) {
    if (m.direction === "in") {
      if (m.kind === "text" && m.body.trim()) buf.push(m.body.trim());
      else if (m.kind === "video" || m.kind === "photo") media++;
      continue;
    }
    if (m.direction !== "out" || m.kind !== "text") continue;
    const reply = m.body.trim();
    if (reply.length < 25) continue; // 「ありがとうございます！」だけの返信は例にしない
    if (buf.length || media) {
      const incoming = [media ? `（動画・写真 ${media}件）` : "", ...buf].filter(Boolean).join("\n");
      out.push({ incoming, reply, memberName, sentAt: m.sentAt });
    }
    buf = [];
    media = 0;
  }
  return out;
}

const STOP = new Set(
  "ますです した して いま ござ ざい いま ます。 あり りが がと とう うご ごさ さい よろ ろし しく くお おね ねが がい かく かん んじ ので から ような よう けど ても でも ない いる てい てる".split(" ")
);

function grams(text: string): string[] {
  const s = normalize(text).slice(0, 600);
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    if (!STOP.has(g)) out.add(g);
  }
  return [...out];
}

/** 文書集合に対する2-gramの希少度（よく出る語ほど軽く） */
export function makeScorer(docs: string[]) {
  const df = new Map<string, number>();
  const docGrams = docs.map((d) => {
    const g = grams(d);
    for (const x of g) df.set(x, (df.get(x) ?? 0) + 1);
    return new Set(g);
  });
  const N = Math.max(1, docs.length);
  const idf = (g: string) => Math.log(1 + N / (1 + (df.get(g) ?? 0)));
  return {
    score(query: string, index: number): number {
      const q = grams(query);
      const d = docGrams[index];
      if (!q.length || !d.size) return 0;
      let s = 0;
      for (const g of q) if (d.has(g)) s += idf(g);
      return s / Math.sqrt(q.length * d.size);
    },
  };
}

/** 似た相談への過去の返信を上位 n 件（同じ返信は1回だけ） */
export function pickExamples(pairs: ExamplePair[], query: string, n = 4): ExamplePair[] {
  if (!pairs.length || !query.trim()) return [];
  const scorer = makeScorer(pairs.map((p) => p.incoming + "\n" + p.reply));
  const ranked = pairs
    .map((p, i) => ({ p, s: scorer.score(query, i) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const seen = new Set<string>();
  const out: ExamplePair[] = [];
  for (const { p } of ranked) {
    const k = p.reply.slice(0, 40);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * メモと相談に近い動画を上位 n 件（よく使う動画を少し優先）。
 * primary（コーチのメモ）を重く、secondary（会員の文）を軽く見る。
 * 会員の文には宣伝の転送など関係ない文が混ざるので、同じ重さにすると候補がずれる。
 */
export function rankVideos(videos: VideoCand[], primary: string, n = 10, secondary = ""): VideoCand[] {
  if (!videos.length) return [];
  const scorer = makeScorer(videos.map((v) => `${v.title} ${(v.tags ?? []).join(" ")}`));
  return videos
    .map((v, i) => ({
      v,
      s:
        scorer.score(primary, i) * 2 +
        (secondary ? scorer.score(secondary, i) * 0.5 : 0) +
        Math.log(1 + (v.useCount ?? 0)) * 0.02,
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.v);
}

/* ---------------- プロンプト ---------------- */

const LEN_GUIDE: Record<string, string> = {
  short: "80〜150字程度。要点1つ。",
  normal: "150〜300字程度。",
  long: "300〜450字程度。【現状】【理想】【練習方法】のように見出しを使ってもよい。",
};

function fmtDate(iso: string): string {
  return iso.slice(5, 10).replace("-", "/");
}

function threadLines(thread: ThreadMsg[], limit = 16): string {
  const recent = thread.filter((m) => m.direction !== "system").slice(-limit);
  const lines: string[] = [];
  let media = 0;
  const flush = (who: string, date: string) => {
    if (media) lines.push(`[${date}] ${who}: （動画・写真 ${media}件）`);
    media = 0;
  };
  for (const m of recent) {
    const who = m.direction === "in" ? "会員" : "コーチ";
    const date = fmtDate(m.sentAt);
    if (m.kind === "video" || m.kind === "photo") {
      media++;
      continue;
    }
    flush(who, date);
    if (m.kind !== "text") continue;
    const body = m.body.length > 260 ? m.body.slice(0, 260) + "…" : m.body;
    lines.push(`[${date}] ${who}: ${body.replace(/\n+/g, " / ")}`);
  }
  flush("会員", recent.length ? fmtDate(recent[recent.length - 1].sentAt) : "");
  return lines.join("\n");
}

export type MemberCtx = {
  name: string;
  plan: string;
  goal?: string | null;
  profile?: string | null;
  focus?: string[];
  memo?: string | null;
  startedOn?: string | null;
};

export function buildSystemPrompt(profileIn: OnlineProfile | null | undefined, plan: string): string {
  const p = withDefaults(profileIn);
  const rule = p.plan_rules[plan as "regular" | "premium" | "other"] || "";
  return [
    `あなたはゴルフのオンラインレッスン「${p.service_name}」のコーチ「${p.coach_name}」本人として、会員へのLINE返信の下書きを書きます。`,
    "",
    "# 書き方",
    p.tone,
    `文字数の上限は${p.max_chars}字（指定があればそちらを優先）。`,
    "LINEにそのまま貼るので、マークダウン（** や # や - の箇条書き記号）は使わない。箇条書きが要るときは「・」か「1、」。",
    "会員の名前は本文に入れなくてよい。",
    "",
    "# プランのルール",
    `この会員は${PLAN_LABEL[plan] ?? plan}プラン。${rule}`,
    "",
    "# 絶対に守ること",
    "・あなたはスイング動画を見ていない。動きについて指摘してよいのは「コーチのメモ」に書かれていることだけ。メモに無い動きを作らない。",
    "・メモが空のときは、会員の文章への返答・励まし・次に確認したいことに留め、動画の中身を断定しない。",
    "・参考動画は「動画ライブラリの候補」からだけ選ぶ（0〜1本、多くても2本）。メモの内容に合うものが無ければ貼らない。URLを作らない・変えない。貼るときはタイトルをそのまま1行、次の行にURL。",
    "・医療的な判断はしない。痛みの相談には無理をしないよう伝え、続く場合は専門家へ相談を勧める。",
    "・過去の返信例は言い回しの参考。内容を他の会員から持ち込まない。",
    "",
    "# 出力",
    'JSONだけを返す: {"reply": "返信本文", "focus": ["この会員の今の課題（最大3つ・各20字以内）"], "videos": ["使ったURL"]}',
  ].join("\n");
}

export function buildUserPrompt(input: {
  member: MemberCtx;
  thread: ThreadMsg[];
  incoming: string;
  memo: string;
  options: ReplyOptions;
  examples: ExamplePair[];
  memberExamples: ExamplePair[];
  videos: VideoCand[];
  waitingHours?: number;
}): string {
  const { member, options } = input;
  const dir: string[] = [LEN_GUIDE[options.length ?? "normal"]];
  if (options.apology) dir.push("冒頭で返信が遅くなったことを短くお詫びする。");
  if (options.praise) dir.push("良くなった点を具体的に、いつもより多めに褒める。");
  if (options.nextStep) dir.push("今の課題ができてきているので、次の課題を1つだけ提案する（メモに次の課題があればそれ）。");
  if (options.keepGoing) dir.push("新しいことは増やさず、今の意識の継続を促す。");
  if (options.askFeeling) dir.push("最後に、練習での感覚や結果を1つ質問して締める。");
  if (options.extra?.trim()) dir.push(`追加の指示: ${options.extra.trim()}`);

  const ex = (list: ExamplePair[]) =>
    list
      .map(
        (e, i) =>
          `## 例${i + 1}\n会員: ${e.incoming.slice(0, 280)}\nコーチの返信:\n${e.reply.slice(0, 600)}`
      )
      .join("\n\n");

  return [
    "# 会員",
    `名前: ${member.name} / プラン: ${PLAN_LABEL[member.plan] ?? member.plan}${member.startedOn ? ` / 受講開始: ${member.startedOn}` : ""}`,
    member.goal ? `目標: ${member.goal}` : "",
    member.profile ? `プロフィール: ${member.profile}` : "",
    member.focus?.length ? `いまの課題: ${member.focus.join("、")}` : "",
    member.memo ? `コーチの覚え書き: ${member.memo}` : "",
    "",
    "# 直近のやり取り（古い→新しい）",
    threadLines(input.thread) || "（まだありません）",
    "",
    "# 今回届いた会員のメッセージ",
    input.incoming.trim() || "（文章なし。動画のみ）",
    input.waitingHours && input.waitingHours >= 24 ? `（届いてから${Math.floor(input.waitingHours / 24)}日経過）` : "",
    "",
    "# コーチのメモ（動画を見て気づいたこと。これが事実の源）",
    input.memo.trim() || "（メモなし）",
    "",
    "# 今回の返信の方向",
    dir.join("\n"),
    "",
    "# 動画ライブラリの候補（ここからだけ選ぶ）",
    input.videos.length ? input.videos.map((v) => `・タイトル: ${v.title}\n  URL: ${v.url}`).join("\n") : "（候補なし＝動画は貼らない）",
    "",
    "# この会員への過去の返信（口調・流れの参考）",
    ex(input.memberExamples) || "（なし）",
    "",
    "# 似た相談への過去の返信（言い回しの参考）",
    ex(input.examples) || "（なし）",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export type DraftJson = { reply?: string; focus?: string[]; videos?: string[] };

/** AIの出力を整える: マークダウン除去・候補外URLの除去・長すぎる行の整理 */
export function cleanDraft(raw: DraftJson | null, allowedUrls: string[]): { reply: string; focus: string[] } {
  let reply = String(raw?.reply ?? "").replace(/\r\n?/g, "\n");
  reply = reply
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "・");
  const allowed = new Set(allowedUrls);
  reply = reply.replace(/https?:\/\/\S+/g, (u) => {
    const base = u.replace(/[)）」』。、!！]+$/, "");
    return allowed.has(base) ? u : "";
  });
  reply = reply.replace(/\n{3,}/g, "\n\n").trim();
  const focus = (Array.isArray(raw?.focus) ? raw!.focus : [])
    .map((f) => String(f).trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((f) => (f.length > 24 ? f.slice(0, 24) : f));
  return { reply, focus };
}

/** 書き直しのプロンプト */
export function buildRewritePrompt(current: string, instruction: string): string {
  return [
    "次のLINE返信の下書きを、指示どおりに書き直してください。",
    "内容（指摘している動き・ドリル・URL）は変えない。URLは一字一句そのまま残す。マークダウンは使わない。",
    `指示: ${instruction}`,
    "",
    "# 下書き",
    current,
    "",
    '# 出力\nJSONだけ: {"reply": "書き直した本文"}',
  ].join("\n");
}

/** AIが使えないときの下書き（メモと候補動画をそのまま並べる） */
export function fallbackDraft(input: { memo: string; options: ReplyOptions; video?: VideoCand | null }): string {
  const parts: string[] = [];
  if (input.options.apology) parts.push("お返事が遅くなり申し訳ございません🙇‍♀️");
  parts.push("動画ありがとうございます😊");
  if (input.memo.trim()) parts.push(input.memo.trim());
  if (input.video) parts.push(`${videoBlock(input.video)}\nこちらの動画を参考にしてください！`);
  if (input.options.askFeeling) parts.push("練習してみて感覚はいかがでしたか？");
  return parts.join("\n\n");
}

export const DIVIDER = "┈┈┈┈┈┈┈┈┈┈";

/** 返信に貼る形（タイトル行＋URL行）。タイトルはライブラリの表記のまま */
export function videoBlock(v: { title: string; url: string }): string {
  const t = v.title.trim();
  return t && t !== "（タイトル未設定）" ? `${t}\n${v.url}` : v.url;
}
