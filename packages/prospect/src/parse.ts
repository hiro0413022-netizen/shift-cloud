// 名簿ページの解析（純粋関数）。
//
// fetch を持つモジュールから切り離してあるのは、テストでネットワークに触らないため。
// 抽出の当たり外れは営業リストの品質に直結するので、実ページのHTMLを固定して回帰させる。

import type { ProspectCandidate } from "./types";

/** 一覧ページから詳細ページのURLを絶対URLで拾う（純粋関数） */
export function extractLinks(html: string, baseUrl: string, pattern?: string | null): string[] {
  const base = new URL(baseUrl);
  const re = pattern ? new RegExp(pattern) : null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    let abs: string;
    try {
      abs = new URL(raw, base).toString();
    } catch {
      continue;
    }
    if (re) {
      if (!re.test(abs)) continue;
    } else if (new URL(abs).host !== base.host) {
      continue; // パターン未指定なら同一ホスト内だけ
    }
    const key = abs.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

const NOT_SITE = /(facebook|instagram|twitter|x\.com|line\.me|youtube|google\.|yahoo\.|jimdo\.com\/?$|wixsite\.com\/?$|goo\.gl|maps\.app)/i;

/** 詳細ページから屋号・電話・住所・自院サイトURLを拾う（純粋関数） */
export function extractContact(html: string, pageUrl: string): Omit<ProspectCandidate, "industry" | "refKey"> & { name: string } {
  const page = new URL(pageUrl);
  const textOf = (s: string) =>
    s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

  // 屋号: h1 → 最初のh2 → <title>（サイト名の付属部分は区切りで落とす）
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawName = [h1, h2, title].map((s) => (s ? textOf(s) : "")).find((s) => s && s.length >= 2 && s.length <= 60) ?? "";
  const name = rawName.split(/[|｜/／–—-]\s/)[0].trim();

  const body = textOf(html);
  const phone = body.match(/0\d{1,4}[-(–－ ]\d{1,4}[-)–－ ]\d{3,4}/)?.[0]?.replace(/[()–－ ]/g, "-") ?? null;
  const address =
    body.match(/〒?\s*\d{3}[-‐−]\d{4}\s*[^\s]{2,40}/)?.[0]?.trim() ??
    body.match(/(北海道|東京都|(?:京都|大阪)府|.{2,3}県)[^\s]{2,40}/)?.[0]?.trim() ??
    null;
  const city = cityFromAddress(address);

  // 自院サイト: 名簿ドメイン以外の外部リンクのうち、SNS・検索サービスを除いた最初のもの
  let websiteUrl: string | null = null;
  for (const m of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)) {
    const u = m[1];
    try {
      const h = new URL(u).host;
      if (h === page.host || h.endsWith("." + page.host)) continue;
      if (NOT_SITE.test(u)) continue;
      websiteUrl = u;
      break;
    } catch {
      /* 壊れたURLは無視 */
    }
  }

  return { name, phone, address, city, websiteUrl, sourceUrl: pageUrl };
}

/**
 * 住所文字列から市区町村を切り出す（純粋関数）。
 * 都道府県を先に落とすのが要点。落とさないと「兵庫県伊丹市」が丸ごと市名になり、
 * 同名判定（[[dedupe]] の city 比較）が別物として扱われて重複が生まれる。
 */
export function cityFromAddress(address?: string | null): string | null {
  if (!address) return null;
  const body = address.replace(/^.*?(北海道|東京都|(?:京都|大阪)府|.{2,3}県)/, "");
  return body.match(/^[\s]*([^\s,、]{1,6}?[市区町村])/)?.[1] ?? address.match(/([^\s,、]{1,6}?[市区町村])/)?.[1] ?? null;
}

/**
 * ページの文言から業種キーを推測する（純粋関数）。
 *
 * 医師会の名簿は「内科・整形外科・皮膚科…」が1つの一覧に混ざっているので、
 * 巡回元に設定した業種をそのまま全件に付けると、内科のテンプレートで
 * 整形外科のデモを作ることになる。診療科名を拾って寄せる。
 * 判断がつかないときは巡回元の設定（fallback）に戻す＝勝手に other にしない。
 */
const INDUSTRY_HINTS: [string, RegExp][] = [
  ["vet", /動物病院|獣医|犬猫/],
  ["judo", /接骨院|整骨院|鍼灸|柔道整復/],
  ["dental", /歯科|矯正歯科|小児歯科/],
  ["ortho", /整形外科/],
  ["pediatrics", /小児科/],
  ["derma", /皮膚科/],
  ["eye", /眼科/],
  ["ent", /耳鼻(咽喉)?科/],
  ["beauty", /美容(皮膚|外)科|美容クリニック|医療脱毛/],
  ["salon", /美容室|ヘアサロン|理容(室|店)|ヘアメイク/],
  ["esthe", /エステ|ネイル|リラクゼーション|まつげ|まつ毛/],
  ["restaurant", /レストラン|居酒屋|食堂|カフェ|ラーメン|寿司|焼肉/],
  ["naika", /内科/],
];

export function guessIndustry(text: string, fallback: string): string {
  for (const [key, re] of INDUSTRY_HINTS) if (re.test(text)) return key;
  return fallback;
}

/**
 * 一覧ページの「行」から営業先を拾う（純粋関数）。
 *
 * なぜ詳細ページではなく一覧から取るのか（2026-08-07の実障害）:
 * 当初は詳細ページの h1/h2/title から屋号を取っていたが、CGI型の名簿（伊丹市医師会など）は
 * **詳細ページに見出しが無く title が全ページ共通**（「ITAMI med Database [データ詳細]」）。
 * その結果、拾った10件すべてが同じ屋号になり、重複判定で1件しか残らなかった。
 * 名簿は「一覧の表に 屋号・住所・電話・診療科 が揃っている」形が大半なので、
 * **リンクの文字＝屋号**、同じ行のセル＝住所・電話 として読む方が確実で、外部への往復も減る。
 */
export interface DirectoryRow {
  refKey: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  /** 行に書かれていた診療科・業種の手がかり（業種推測に使う） */
  hint: string;
}

const TEL_RE = /0\d{1,4}[-(–－\s]\d{1,4}[-)–－\s]\d{3,4}/;

export function extractRows(html: string, baseUrl: string, pattern?: string | null): DirectoryRow[] {
  const base = new URL(baseUrl);
  const re = pattern ? new RegExp(pattern) : null;
  const out: DirectoryRow[] = [];
  const seen = new Set<string>();

  // <tr>…</tr> 単位で走査する。テーブルでない名簿のために、後段で <li> も見る
  const blocks = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), ...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];

  for (const block of blocks) {
    const inner = block[1];
    const link = inner.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;

    let abs: string;
    try {
      abs = new URL(link[1], base).toString().split("#")[0];
    } catch {
      continue;
    }
    if (re ? !re.test(abs) : new URL(abs).host !== base.host) continue;
    if (seen.has(abs)) continue;

    // リンクの文字がその行の主役＝屋号
    const name = text(link[2]);
    if (!name || name.length < 2 || name.length > 60) continue;

    // 同じ行の残りのセルから住所・電話を拾う
    const cells = [...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => text(m[1]));
    const rest = cells.filter((c) => c && c !== name);
    const flat = rest.join(" ") || text(inner).replace(name, "");

    const phone = flat.match(TEL_RE)?.[0]?.replace(/[()–－\s]/g, "-") ?? null;
    const address = rest.find((c) => /[都道府県市区町村]/.test(c) && !TEL_RE.test(c)) ?? null;

    seen.add(abs);
    out.push({ refKey: abs, name, address, city: cityFromAddress(address), phone, hint: flat });
  }
  return out;
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 抽出が壊れていないかの自己点検。
 * 同じ屋号ばかり並ぶのは「見出しではなくページ共通の文字列を拾っている」典型なので、
 * **静かに1件だけ登録して終わる前に**気づけるようにする。
 */
export function looksBroken(rows: { name: string }[]): string | null {
  if (rows.length < 3) return null;
  const uniq = new Set(rows.map((r) => r.name));
  if (uniq.size === 1) return `屋号が全件同じ（「${rows[0].name}」）＝抽出に失敗しています。一覧ページの構造を確認してください`;
  if (uniq.size <= rows.length / 3) return `屋号の種類が少なすぎます（${rows.length}件中${uniq.size}種）＝抽出が正しくない可能性`;
  return null;
}
