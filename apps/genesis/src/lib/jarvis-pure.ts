/* ============================================================
   JARVIS の純粋な部分（DECISIONS #182）

   なぜ切り出すか（#173 と同じ理由）:
     「最初の一言」「AIの返事の読み取り」「案内先の検証」は、
     見た目の話に見えて 実際には壊れると分かりにくい所。
     DBもネットワークも要らないので、テストで固定しておく。

   ここには server-only を入れない（node --test から直接読めるようにする）。
   ============================================================ */

/* ------------------------------------------------------------
   案内できる画面（ここに無い href へは飛ばさない）
   AIが存在しないURLを作って「開く」ボタンを出すのが一番みっともないので、
   必ずこの表に当てて、外れたら案内自体を取り下げる。
------------------------------------------------------------ */
export type NavEntry = { href: string; label: string; about: string };

export const NAV_MAP: NavEntry[] = [
  { href: "/", label: "ホーム", about: "今日やること・今月の数字・止まっているもの" },
  { href: "/todo", label: "今日やること", about: "判断が要る案件の全件一覧" },
  { href: "/stores", label: "店舗のシステム", about: "予約・受付台帳・シフト・お金など各アプリへの入口" },
  { href: "/chat", label: "データに聞く", about: "売上・会員・勤怠などへの自由質問" },
  { href: "/agents", label: "AI社員", about: "21体のAIエージェントの稼働状況" },
  { href: "/finance", label: "数字", about: "事業別の売上・経費・収支" },
  { href: "/command", label: "CEO AI 司令室", about: "開発状況・KPI更新・日次レポート生成" },
  { href: "/ai-sales", label: "AI営業 司令室", about: "自動集客の稼働状況" },
  { href: "/suggestions", label: "改善提案", about: "AIからの改善案" },
  { href: "/directives", label: "実行指示", about: "AI社員への指示" },
  { href: "/executions", label: "AI自動実行", about: "実行待ち・実行済みのアクション" },
  { href: "/approvals", label: "承認待ち", about: "承認が要る案件" },
  { href: "/inbox", label: "問い合わせ受信箱", about: "お客様からの問い合わせと返信下書き" },
  { href: "/deliverables", label: "成果物レビュー", about: "AIが作った成果物の確認" },
  { href: "/incidents", label: "イレギュラー分析", about: "現場からの異常報告" },
  { href: "/notice", label: "スタッフへ連絡", about: "公式LINEでの全体連絡" },
  { href: "/legal", label: "契約・法務", about: "契約書と期限" },
  { href: "/library", label: "資料室", about: "社内資料" },
  { href: "/network", label: "システム相関図", about: "全システムの接続と死活" },
  { href: "/memories", label: "経営メモ", about: "AIが覚えている経営判断" },
  { href: "/decisions", label: "決定事項ログ", about: "過去の決定" },
  { href: "/dev-requests", label: "開発依頼", about: "JARVISが受けた開発依頼のキュー" },
  { href: "/dev", label: "開発状況", about: "各モジュールの進捗" },
  { href: "/future", label: "未来シミュレーション", about: "資金繰り・KPI予測" },
  { href: "/vault", label: "システム台帳", about: "ID・URL・パスワード" },
];

export function findNav(href: unknown): NavEntry | null {
  if (typeof href !== "string") return null;
  return NAV_MAP.find((n) => n.href === href.trim()) ?? null;
}

/* ------------------------------------------------------------
   ブリーフィング
------------------------------------------------------------ */
export type BriefKpi = { code: string; name: string; value: number | null; unit: string; target: number | null };

export type JarvisBriefing = {
  name: string;
  score: number;
  grade: string;
  factors: string[];
  decisionCount: number;
  topDecisions: { tag: string; title: string }[];
  kpis: BriefKpi[];
  recent: string[];
  today: string;
};

/** ホームの表示と同じ並び。ここを変えると喋る順番も変わる */
export const KPI_ORDER = ["monthly_sales", "members", "conversion_rate", "churn_rate", "trial_bookings", "labor_cost"];

export type BriefFeedItem = { source: string; tag: string; title: string };
export type BriefAlert = { kind: string; title: string };

/**
 * 画面が計算し終えた値からブリーフィングを組む。
 * ここで数字を作り直さない＝JARVISが喋る数字と画面の数字が必ず一致する。
 */
export function toBriefing(args: {
  name: string;
  score: number;
  grade: string;
  factors: string[];
  approvals: number;
  feed: BriefFeedItem[];
  alerts: BriefAlert[];
  kpis: Record<string, unknown>[];
  recentEvents: { title: unknown }[];
  today: string;
}): JarvisBriefing {
  // undo（実行予定の取消枠）は「判断」ではないので数に入れない＝ホームの totalDecisions と同じ定義
  const decisions = args.feed.filter((f) => f.source !== "undo");
  const decisionCount = args.approvals + decisions.length + args.alerts.length;

  const topDecisions = [
    ...decisions.map((f) => ({ tag: f.tag, title: f.title })),
    ...args.alerts.map((a) => ({ tag: alertTag(a.kind), title: a.title })),
  ].slice(0, 5);

  const kpis = KPI_ORDER.map((code) => args.kpis.find((k) => String(k.code) === code))
    .filter((k): k is Record<string, unknown> => k != null)
    .map((k) => ({
      code: String(k.code),
      name: String(k.name),
      value: k.current_value != null ? Number(k.current_value) : null,
      unit: String(k.unit ?? ""),
      target: k.target_value != null ? Number(k.target_value) : null,
    }));

  return {
    name: args.name,
    score: args.score,
    grade: args.grade,
    factors: args.factors,
    decisionCount,
    topDecisions,
    kpis,
    recent: args.recentEvents.slice(0, 5).map((e) => String(e.title)),
    today: args.today,
  };
}

export function alertTag(kind: string): string {
  if (kind === "risk") return "リスク";
  if (kind === "blocker") return "ブロッカー";
  return "確認";
}

/** JST の「いま何時か」。挨拶を変えるためだけに使う */
export function jstHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(now));
}

/**
 * 起動時のひとこと。
 * ここでLLMを呼ばない＝APIが落ちていても・キーが無くても・課金しなくても、
 * ホームを開いた瞬間に必ず声が出る。JARVISが「無言で立っている」状態を作らない。
 */
export function openingLine(b: JarvisBriefing, hour: number = jstHour()): string {
  const greet =
    hour < 5 ? "夜分おそくまでおつかれさまです" : hour < 11 ? "おはようございます" : hour < 18 ? "おつかれさまです" : "おかえりなさい";
  const head = `${greet}、${b.name}さん。`;
  if (b.decisionCount === 0) {
    return `${head}全体スコアは${b.score}点、本日の判断はありません。会社は問題なく回っています。`;
  }
  const first = b.topDecisions[0];
  const detail = first ? `いちばん上は「${first.title}」です。` : "";
  return `${head}全体スコアは${b.score}点、本日の判断は${b.decisionCount}件です。${detail}`;
}

/* ------------------------------------------------------------
   AIの返事（JSON）の読み取り
   モデルはときどきコードフェンスや前置きを付ける。落とさずに拾う。
   拾えなかったら null を返し、呼び出し側は生テキストをそのまま喋る
   （黙るくらいなら、整形されていなくても答えを返すほうがまし）。
------------------------------------------------------------ */
export type Decision = {
  intent: "data" | "navigate" | "dev" | "talk" | "act";
  reply?: string;
  question?: string;
  href?: string;
  dev?: { title?: string; app?: string; priority?: string };
  /** #186: 取消枠つきで実行する操作 */
  act?: { type?: string; args?: Record<string, unknown> };
};

const INTENTS = ["data", "navigate", "dev", "talk", "act"];

/* ------------------------------------------------------------
   JARVISが実行してよい操作（#186）

   ここに無い type は実行しない。**AIが思いついた操作名で書き込ませない**ため。
   お客様への送信・課金・契約は入れない（VISION §7・従来どおり承認カード）。
------------------------------------------------------------ */
export const ACT_TYPES = ["booking_create", "booking_cancel", "walkin_add", "staff_directive"] as const;
export type ActType = (typeof ACT_TYPES)[number];

export function isActType(v: unknown): v is ActType {
  return typeof v === "string" && (ACT_TYPES as readonly string[]).includes(v);
}

export function parseDecision(raw: string): Decision | null {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Decision;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    if (!INTENTS.includes(String(o.intent))) return null;
    return o;
  } catch {
    return null;
  }
}

export function normalizePriority(p: unknown): "urgent" | "normal" | "low" {
  return p === "urgent" || p === "low" ? p : "normal";
}

/* ------------------------------------------------------------
   ウェイクワード（#184）

   なぜ入れるか（2026-08-28 ユーザー指摘）:
     「毎回ボタンを押して話す形になっている。ボタンではなく、
       僕がジェネシスと言ったら会話モードに入るほうがいいのでは」
     そのとおりで、押してから話す限り "呼べば答える" にはならない。

   なぜ聞き取り結果に対して純関数で判定するか:
     音声認識は同じ言葉を毎回同じ表記で返さない（ジェネシス / ゼネシス /
     genesis / 読点つき …）。ここが外れると**永久に起動しない**という
     いちばん分かりにくい壊れ方をするので、表記ゆれをテストで固定する。
------------------------------------------------------------ */

/** 「ジェネシス」の聞き取られ方。実際に出た表記を見つけたらここに足す */
export const WAKE_WORDS = [
  "ジェネシス", "じぇねしす", "ゼネシス", "ぜねしす", "ジェニシス", "ジェネシズ", "ジェネスス",
  "genesis", "ジャービス", "ジャーヴィス", "じゃーびす",
];

/** 呼びかけの直後に来がちな区切り記号。用件の頭から削る */
const LEAD_TRIM = /^[\s、,。.！!？?ー・:：]+/;

/**
 * 聞き取ったテキストに呼びかけが含まれるかを見る。
 * 含まれていたら、**最後の**呼びかけより後ろを用件として返す
 * （「ジェネシス、ジェネシス、今月の売上は？」でも用件だけが残る）。
 */
export function detectWake(text: string): { hit: boolean; rest: string } {
  if (!text) return { hit: false, rest: "" };
  const lower = text.toLowerCase();
  let at = -1;
  let len = 0;
  for (const w of WAKE_WORDS) {
    const i = lower.lastIndexOf(w.toLowerCase());
    if (i >= 0 && i >= at) {
      at = i;
      len = w.length;
    }
  }
  if (at < 0) return { hit: false, rest: "" };
  return { hit: true, rest: text.slice(at + len).replace(LEAD_TRIM, "").trim() };
}

/**
 * 話し終わりと見なすまでの無音の長さ（ミリ秒）。
 *
 * ユーザー指摘「喋っている最中にいきなり終了して回答してしまいます」の対策。
 * ブラウザ標準の区切りは日本語の"間"に対して短すぎるので、
 * 自前で無音を測って区切る。速さは人によるので選べるようにする。
 */
export const PAUSE_MS = { fast: 900, normal: 1800, slow: 3000 } as const;
export type PauseSpeed = keyof typeof PAUSE_MS;

export function pauseMs(speed: string | null | undefined): number {
  return PAUSE_MS[(speed as PauseSpeed) in PAUSE_MS ? (speed as PauseSpeed) : "normal"];
}

/* ------------------------------------------------------------
   声で画面を動かす（#244・2026-09-15 ユーザー要望
   「音声AIで画面も操作して僕が見たいものを見せるようにしてください」）

   「会員数を見せて」「フランクの予約を開いて」「やることを出して」のような
   **画面を出す指示**は、LLMに投げずここで判定して即座に開く。
   （数字の質問「今月の売上は？」は従来どおり Ask Data に行く＝ここでは拾わない）

   返すのは GENESIS 内の URL だけ。存在しない画面を開かせない（NAV_MAP と同じ考え方）。
   店舗は別名（frank / gw）で返し、サーバー側（drilldown / stores）が実IDに直す。
------------------------------------------------------------ */
export type ScreenCommand =
  | { kind: "drill"; metric: string; store: string | null; href: string; label: string }
  | { kind: "todo"; href: string; label: string }
  | { kind: "stores"; store: string | null; href: string; label: string }
  | { kind: "nav"; href: string; label: string }
  | { kind: "search"; q: string; label: string };

const SHOW_VERBS = /(見せて|みせて|開いて|ひらいて|出して|だして|表示|見たい|みたい|開け|見せろ|見る|確認したい|チェックしたい)/;

const METRIC_WORDS: { re: RegExp; metric: string; label: string }[] = [
  { re: /(会員数|会員の数|かいいんすう|メンバー数|会員)/, metric: "members", label: "会員数" },
  { re: /(売上|うりあげ|売り上げ|売上げ)/, metric: "monthly_sales", label: "今月の売上" },
  { re: /(入会率|にゅうかいりつ|成約率)/, metric: "conversion_rate", label: "体験からの入会率" },
  { re: /(退会|たいかい|解約)/, metric: "churn_rate", label: "退会" },
  { re: /(体験|たいけん|トライアル)/, metric: "trial_bookings", label: "体験" },
  { re: /(人件費|じんけんひ|シフト数)/, metric: "labor_cost", label: "人件費" },
];

/** 店舗の別名。サーバーが stores.code / name で実IDに直す */
export function detectStoreAlias(text: string): "frank" | "gw" | null {
  const t = text.toLowerCase();
  if (/(フランク|ふらんく|frank|frunk|姫路|ひめじ)/.test(t)) return "frank";
  if (/(ゴルフウィング|ゴルフウイング|golf ?wing|ウィング|宝塚|たからづか)/.test(t)) return "gw";
  return null;
}

export function detectScreenCommand(text: string): ScreenCommand | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const store = detectStoreAlias(t);

  // 「〇〇を探して」「〇〇さんを出して」→ 検索（お客様・画面）
  const search = t.match(/^(.+?)(さん|様)?(を|の)?(探して|さがして|検索|けんさく)/);
  if (search && search[1] && !/(画面|やること|会員数|売上)/.test(search[1])) {
    const q = search[1].replace(/^(ジェネシス|genesis)[、,\s]*/i, "").trim();
    if (q) return { kind: "search", q, label: `「${q}」を探します` };
  }

  // 店舗のシステム（予約・受付・シフト・レジ）
  if (/(予約|受付台帳|受付|シフト|レジ|店舗のシステム|店のシステム)/.test(t) && SHOW_VERBS.test(t)) {
    const href = store ? `/stores?alias=${store}` : "/stores";
    return { kind: "stores", store, href, label: `${store === "frank" ? "FRANK GOLF" : store === "gw" ? "GOLF WING" : "店舗"}のシステムを開きます` };
  }

  // やること・承認
  if (/(やること|やる事|判断|承認待ち|承認)/.test(t) && SHOW_VERBS.test(t)) {
    return { kind: "todo", href: "/?panel=first", label: "今日やることを開きます" };
  }

  // 数字の深掘り（「会員数を見せて」「フランクの売上を出して」）
  if (SHOW_VERBS.test(t) || /(内訳|うちわけ|種別|店舗ごと|店ごと)/.test(t)) {
    for (const m of METRIC_WORDS) {
      if (m.re.test(t)) {
        const p = new URLSearchParams({ drill: m.metric });
        if (store) p.set("alias", store);
        return {
          kind: "drill",
          metric: m.metric,
          store,
          href: `/?${p.toString()}`,
          label: `${store === "frank" ? "FRANK GOLFの" : store === "gw" ? "GOLF WINGの" : ""}${m.label}を開きます`,
        };
      }
    }
  }

  // 画面名（「契約書を開いて」「システム相関図を見せて」）
  if (SHOW_VERBS.test(t)) {
    const noun = t.replace(SHOW_VERBS, "").replace(/(を|の|画面|ページ|ください|くれ|ほしい|欲しい)/g, "").trim();
    const hit = noun ? NAV_MAP.find((n) => noun.includes(n.label) || n.label.includes(noun)) : null;
    if (hit) return { kind: "nav", href: hit.href, label: `${hit.label}を開きます` };
  }
  return null;
}

/* ------------------------------------------------------------
   声の精度を上げる（#245・2026-09-15 ユーザー要望「人間としゃべるレベルまで」）

   遅い・聞き違える・途中で口を挟めない、の3つを別々に潰す:
     1. 聞き取り: ブラウザ任せをやめ、録った音声をサーバー（Gemini）で文字にする。
        ブラウザの認識は「呼びかけ（ジェネシス）の検出」と「保険」に格下げ。
     2. 区切り: 文字ではなく**音量**で「言い終わった」を測る（VAD）。
     3. 返事: 文ごとに音声を作って、最初の1文ができた瞬間から喋り始める。
     4. 割り込み: 喋っている最中に人の声が入ったら黙って聞く。
   ここは純関数（音の数値を受けて判定を返すだけ）。マイクもAPIも触らない。
------------------------------------------------------------ */

/** 読み上げを文ごとに割る。「。」「！」「？」で切り、短すぎる断片は前に足す */
export function splitSentences(text: string, minLen = 6): string[] {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const parts = raw.split(/(?<=[。！？!?])/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && (p.length < minLen || out[out.length - 1].length < minLen)) out[out.length - 1] += p;
    else out.push(p);
  }
  return out;
}

export type VadEvent = "start" | "end" | null;

/**
 * 音量で発話の始まり・終わりを判定する。
 * - 無音の床（noise floor）は最初の数フレームで学習し、その後もゆっくり追従する
 * - 床の何倍か（ratio）で「声」とみなす。絶対値（minRms）も下限に置く（無音室で誤爆しない）
 * - 声が minSpeechMs 続いたら start、その後 silenceMs 静かなら end
 */
export function createVad(opts: { silenceMs: number; minSpeechMs?: number; ratio?: number; minRms?: number; frameMs?: number }) {
  const silenceMs = opts.silenceMs;
  const minSpeechMs = opts.minSpeechMs ?? 200;
  const ratio = opts.ratio ?? 2.5;
  const minRms = opts.minRms ?? 0.01;
  const frameMs = opts.frameMs ?? 50;
  let floor = 0;
  let frames = 0;
  let speaking = false;
  let voiced = 0;
  let quiet = 0;
  return {
    /** 1フレームぶんの RMS（0〜1）を渡す。start / end / null を返す */
    feed(rms: number): VadEvent {
      frames += 1;
      if (frames <= 8) {
        floor = frames === 1 ? rms : floor * 0.7 + rms * 0.3;
        return null;
      }
      const threshold = Math.max(minRms, floor * ratio);
      const isVoice = rms >= threshold;
      if (!isVoice) floor = floor * 0.98 + rms * 0.02; // 静かなときだけ床を追従
      if (!speaking) {
        voiced = isVoice ? voiced + frameMs : 0;
        if (voiced >= minSpeechMs) {
          speaking = true;
          quiet = 0;
          return "start";
        }
        return null;
      }
      quiet = isVoice ? 0 : quiet + frameMs;
      if (quiet >= silenceMs) {
        speaking = false;
        voiced = 0;
        return "end";
      }
      return null;
    },
    get speaking() {
      return speaking;
    },
    reset() {
      speaking = false;
      voiced = 0;
      quiet = 0;
    },
  };
}

/** 文字起こしの後始末。呼びかけを落とし、末尾の言い淀みを削る */
export function cleanTranscript(text: string): string {
  let t = (text ?? "").replace(/\s+/g, " ").trim();
  const w = detectWake(t);
  if (w.hit) t = w.rest;
  t = t.replace(/^(えー|えっと|あの|あのー|うーん)[、,\s]*/g, "").replace(/[、,]+$/g, "").trim();
  return t;
}
