// Web現況スコア — 取得済みHTMLだけを見て評価する純粋関数。
//
// なぜ純粋関数か: 「拾ってきた店のサイトが古いかどうか」の判定は営業の当たり外れを直接決めるので、
// ネットワーク無しで固定できないと直すたびに壊れる。fetch は http.ts に隔離してある。
//
// 評価は 1-5（5が良い）＝ demo-sales の ANALYSIS_ITEMS と同じ形にして、そのまま
// dms_prospects.analysis.items に入る。人が画面で上書きできる（機械の評価は「初期値」）。

import type { AuditItem, PageSnapshot, WebAudit } from "./types";

const clamp = (n: number, lo = 1, hi = 5) => Math.max(lo, Math.min(hi, n));

/** タグを落として本文だけにする（文字量・キーワード判定用） */
export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ページ内で最も新しい西暦（コピーライト・お知らせの日付）。見つからなければ null */
export function latestYear(text: string, now = new Date()): number | null {
  const thisYear = now.getFullYear();
  const years = [...text.matchAll(/(20\d{2})\s*[年./-]?/g)]
    .map((m) => Number(m[1]))
    // 未来の年（予約フォームの選択肢など）は無視する。翌年までは許容
    .filter((y) => y >= 2000 && y <= thisYear + 1);
  if (!years.length) return null;
  return Math.max(...years);
}

/** 「営業お断り」表示の検出。②outreach の送信除外に使う（特定電子メール法の運用） */
export function detectNoSolicit(text: string): boolean {
  return /営業.{0,4}(メール|電話|目的).{0,6}(お断り|ご遠慮|禁止)|セールス.{0,6}(お断り|ご遠慮)|勧誘.{0,4}(お断り|ご遠慮)/.test(text);
}

const has = (html: string, re: RegExp) => re.test(html);

/**
 * 取得済みページを評価する。
 * @param snap 取得結果
 * @param opts psiScore = PageSpeed Insights のパフォーマンススコア(0-100)。無ければ応答時間で代用
 */
export function auditPage(snap: PageSnapshot, opts: { psiScore?: number | null; now?: Date } = {}): WebAudit {
  const now = opts.now ?? new Date();
  const html = snap.html ?? "";
  const lower = html.toLowerCase();
  const text = stripTags(html);
  const items: Record<string, AuditItem> = {};
  const good: string[] = [];
  const improve: string[] = [];

  // --- SSL: httpsで最終着地しているか -------------------------------------
  const https = snap.finalUrl.startsWith("https://");
  items.ssl = https
    ? { score: 5, note: "https で配信されています" }
    : { score: 1, note: "http のまま。ブラウザに「保護されていません」と表示されます" };
  (https ? good : improve).push(https ? "SSL対応済み" : "SSL未対応（http）");

  // --- スマートフォン対応: viewport の有無が事実上の分かれ目 ---------------
  const viewport = has(lower, /<meta[^>]+name=["']?viewport["']?/);
  const mediaQuery = /@media[^{]*\((max|min)-width/i.test(html);
  const legacyLayout = /<table[^>]*(width=["']?\d{3,}|role=["']?presentation)/i.test(html) || /<frameset/i.test(html);
  items.mobile = viewport
    ? { score: mediaQuery ? 5 : 4, note: mediaQuery ? "viewport指定＋メディアクエリあり" : "viewport指定あり" }
    : { score: legacyLayout ? 1 : 2, note: "viewport指定なし。スマートフォンでPC版が縮小表示されます" };
  (viewport ? good : improve).push(viewport ? "スマートフォン対応" : "スマートフォン未対応");

  // --- 更新状況: ページ内の最新年 -----------------------------------------
  const y = latestYear(text, now);
  const staleYears = y == null ? null : now.getFullYear() - y;
  items.updated =
    staleYears == null
      ? { score: 2, note: "更新日らしき表記が見つかりません" }
      : staleYears <= 0
        ? { score: 5, note: `今年（${y}年）の表記があります` }
        : staleYears === 1
          ? { score: 4, note: `最新の表記は${y}年` }
          : staleYears <= 3
            ? { score: 2, note: `最新の表記が${y}年。${staleYears}年ほど更新が止まっている可能性` }
            : { score: 1, note: `最新の表記が${y}年。長期間更新されていません` };
  if (staleYears != null && staleYears >= 2) improve.push(`最終更新が${y}年ごろ`);

  // --- 予約・電話導線 ------------------------------------------------------
  const telLink = has(lower, /href=["']tel:/);
  const reserveWord = /(ご予約|web予約|ネット予約|オンライン予約|予約する|順番受付)/.test(text);
  const formTag = has(lower, /<form[\s>]/);
  const ctaScore = clamp((telLink ? 2 : 0) + (reserveWord ? 2 : 0) + (formTag ? 1 : 0));
  items.cta = {
    score: ctaScore,
    note: [telLink ? "電話タップ導線あり" : "電話番号がタップできません", reserveWord ? "予約の案内あり" : "予約導線が見当たりません", formTag ? "問い合わせフォームあり" : "フォームなし"].join(" / "),
  };
  if (!telLink) improve.push("スマホで電話番号をタップできない");
  if (!reserveWord) improve.push("予約導線がない");

  // --- 表示速度 ------------------------------------------------------------
  const psi = opts.psiScore;
  if (typeof psi === "number") {
    items.speed = { score: clamp(Math.round(psi / 20)), note: `PageSpeed パフォーマンス ${psi}点` };
    if (psi < 50) improve.push(`表示速度が遅い（PageSpeed ${psi}点）`);
  } else {
    // PageSpeedが無いときの代用。HTMLの取得時間と重さしか見ていないので甘めに刻む
    const slow = snap.elapsedMs > 3000 || snap.bytes > 800_000;
    items.speed = slow
      ? { score: 2, note: `HTML取得 ${Math.round(snap.elapsedMs)}ms / ${Math.round(snap.bytes / 1024)}KB（PageSpeed未計測）` }
      : { score: 4, note: `HTML取得 ${Math.round(snap.elapsedMs)}ms（PageSpeed未計測）` };
  }

  // --- 情報の充実度（文字量・内部リンク） ----------------------------------
  const internalLinks = new Set([...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]).filter((h) => !/^(https?:|tel:|mailto:)/i.test(h))).size;
  items.volume =
    text.length > 3000 && internalLinks >= 8
      ? { score: 5, note: `本文${text.length}字・内部リンク${internalLinks}本` }
      : text.length > 1200 || internalLinks >= 4
        ? { score: 3, note: `本文${text.length}字・内部リンク${internalLinks}本` }
        : { score: 1, note: `本文${text.length}字・内部リンク${internalLinks}本。情報量が少ない` };
  if (text.length <= 1200) improve.push("掲載情報が少ない");

  // --- 写真 ----------------------------------------------------------------
  const imgs = (html.match(/<img[\s>]/gi) ?? []).length;
  items.photos = imgs >= 8 ? { score: 4, note: `画像${imgs}枚` } : imgs >= 3 ? { score: 3, note: `画像${imgs}枚` } : { score: 1, note: `画像${imgs}枚。写真がほとんどありません` };

  // --- 内容の有無（キーワードで拾える範囲だけ・断定しない） ----------------
  const kw = (re: RegExp, hit: string, miss: string): AuditItem => (re.test(text) ? { score: 4, note: hit } : { score: 2, note: miss });
  items.hours = kw(/(診療時間|営業時間|受付時間|定休日|休診)/, "時間の記載あり", "営業・診療時間の記載が見当たりません");
  items.access = kw(/(アクセス|所在地|駐車場|最寄|徒歩\s*\d)/, "アクセス情報あり", "アクセス・駐車場の記載が見当たりません");
  items.first_visit = kw(/(初めての方|初診|ご利用の流れ|はじめての)/, "初めての方向けの案内あり", "初めての方向けの案内が見当たりません");
  items.staff = kw(/(院長|スタッフ紹介|代表|オーナー|プロフィール)/, "紹介ページあり", "スタッフ・代表の紹介が見当たりません");
  items.recruit = kw(/(採用|求人|スタッフ募集)/, "採用情報あり", "採用情報なし");

  // --- デザインの新しさ（間接指標。決めつけない） --------------------------
  const modern = /(flex|grid-template|:root\s*{|--[a-z-]+\s*:)/i.test(html);
  const outdated = legacyLayout || /<font[\s>]|bgcolor=|<marquee/i.test(html);
  items.design = outdated
    ? { score: 1, note: "table/font タグ主体の古い作り" }
    : modern && viewport
      ? { score: 4, note: "近年のCSSで組まれています" }
      : { score: 3, note: "判断材料が少なめ" };
  if (outdated) improve.push("HTMLの作りが古い（table/fontレイアウト）");

  // --- 総合の安心感 = 上記の平均 -------------------------------------------
  const keys = Object.keys(items);
  const avg = keys.reduce((s, k) => s + items[k].score, 0) / keys.length;
  items.trust = { score: clamp(Math.round(avg)), note: `評価項目${keys.length}件の平均 ${avg.toFixed(1)}` };

  if (good.length === 0) good.push("現在もサイトが公開されている");

  return {
    ok: true,
    items,
    score: salesScore(items, snap),
    goodPoints: good,
    improvePoints: improve,
    noSolicit: detectNoSolicit(text),
    raw: {
      finalUrl: snap.finalUrl,
      status: snap.status,
      https,
      viewport,
      mediaQuery,
      telLink,
      reserveWord,
      formTag,
      imgs,
      internalLinks,
      textLength: text.length,
      latestYear: y,
      elapsedMs: snap.elapsedMs,
      bytes: snap.bytes,
      psiScore: psi ?? null,
      generator: (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) ?? [])[1] ?? null,
      // ②outreach で使う。先方サイトに「公表されている」ことが送信の根拠なので、拾えた場合だけ持つ（推測はしない）
      emails: extractEmails(html, snap.finalUrl),
    },
  };
}

/**
 * 営業有望度 0-100。
 * 「サイトの改善余地が大きいほど高い」＝ 直したときの効果が大きい先を上に出す。
 * ただし致命的に古い項目（スマホ未対応・SSL無し）は重く見る。ここが営業の当たりに直結するため。
 */
export function salesScore(items: Record<string, AuditItem>, snap: PageSnapshot): number {
  const W: Record<string, number> = {
    mobile: 26, // スマホで見られない＝いちばん強い提案材料
    ssl: 14,
    updated: 14,
    cta: 14,
    design: 10,
    speed: 8,
    volume: 8,
    photos: 3,
    hours: 3,
  };
  let got = 0;
  let max = 0;
  for (const [k, w] of Object.entries(W)) {
    const s = items[k]?.score;
    if (s == null) continue;
    max += w;
    got += ((5 - s) / 4) * w; // 5点=改善余地0 / 1点=改善余地満点
  }
  if (max === 0) return 0;
  let score = Math.round((got / max) * 100);
  // サーバーが不安定な先は営業しても話が進まないので少し下げる
  if (snap.status >= 400) score = Math.max(0, score - 20);
  return Math.max(0, Math.min(100, score));
}

/** サイトが取得できなかったときの結果。0点にはせず「要確認」として中位に置く */
export function unreachableAudit(reason: string): WebAudit {
  return {
    ok: false,
    reason,
    items: {},
    score: 40,
    goodPoints: [],
    improvePoints: [`サイトを取得できませんでした（${reason}）`],
    noSolicit: false,
    raw: { reason },
  };
}

/**
 * ページから「先方が公表しているメールアドレス」を拾う（純粋関数）。
 *
 * これは②outreach の**法的根拠そのもの**。特定電子メール法3条1項3号は
 * 「自己の電子メールアドレスを公表している営業者」への送信を同意なしで認めるので、
 * 「先方のサイト上に載っていた」という事実が取れないアドレスは使ってはいけない。
 * 推測（info@ドメイン を組み立てる等）は絶対にしない。
 *
 * 優先順位: 同一ドメインのアドレス > その他。フォーム画像やダミーは除外する。
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_NG =
  /(example\.(com|org|net)|test\.|sentry\.io|wixpress|jimdo|\.png$|\.jpe?g$|\.gif$|\.svg$|\.webp$|@2x|no-?reply|do-?not-?reply)/i;

export function extractEmails(html: string, pageUrl: string): string[] {
  const host = (() => {
    try {
      return new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  })();

  const found = new Map<string, number>(); // email → 優先度（小さいほど先）
  const add = (raw: string, base: number) => {
    const e = raw.trim().toLowerCase().replace(/[.,;:)】」]+$/, "");
    if (!e.includes("@") || EMAIL_NG.test(e)) return;
    const dom = e.split("@")[1] ?? "";
    // 同一ドメイン（またはそのサブドメイン）を最優先。無関係なドメインは後ろへ
    const sameDomain = host && (dom === host || dom.endsWith("." + host) || host.endsWith("." + dom));
    const score = base + (sameDomain ? 0 : 10);
    if (!found.has(e) || found.get(e)! > score) found.set(e, score);
  };

  // mailto: は「連絡してよい」という明示なので最優先
  for (const m of html.matchAll(/href=["']mailto:([^"'?]+)/gi)) add(decodeURIComponent(m[1]), 0);
  // 本文中の表記
  const text = stripTags(html);
  for (const m of text.matchAll(EMAIL_RE)) add(m[0], 5);

  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([e]) => e);
}

/**
 * ホームページが見つからない先の評価。
 *
 * **HP制作営業では、これが最良の見込み客**（作るものが無いのではなく、まだ何も無い）。
 * 「サイトが取得できなかった（unreachableAudit・40点）」とは意味がまったく違うので分けている。
 * 前者は「作れば全部が改善」＝最優先、後者は「調べ直しが要る」＝保留。
 */
export function noWebsiteAudit(): WebAudit {
  return {
    ok: true,
    reason: "no_website",
    items: {
      mobile: { score: 1, note: "ホームページが見当たりません" },
      ssl: { score: 1, note: "ホームページが見当たりません" },
      updated: { score: 1, note: "ホームページが見当たりません" },
      cta: { score: 1, note: "Web上に予約・問い合わせの導線がありません" },
      design: { score: 1, note: "ホームページが見当たりません" },
      volume: { score: 1, note: "Web上の情報がありません" },
      trust: { score: 1, note: "検索しても情報にたどり着けません" },
    },
    // 改善余地が最大。ただし取得失敗（40点）と区別できるよう、満点ではなく95に置く
    score: 95,
    goodPoints: [],
    improvePoints: [
      "ホームページが見当たりません（検索しても情報にたどり着けない状態）",
      "スマートフォンで診療時間・予約・アクセスを確認できません",
    ],
    noSolicit: false,
    raw: { noWebsite: true },
  };
}
