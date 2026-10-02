/**
 * YouTube チャンネルの新着動画（#335・2026-10-03）
 *
 * 公式サイト（frankgolf.jp）に「小川うららプロの最新レッスン動画」を出すための部品。
 * YouTube Data API（キーと上限の管理が要る）は使わず、チャンネルの公開フィード
 *   https://www.youtube.com/feeds/videos.xml?channel_id=...
 * を読む。キー不要・最新15本が新しい順に並ぶ。ブラウザからは CORS で読めないので、
 * Genesis の公開API（/api/public/site/frank-golf）がサーバー側で読み、videos として返す。
 *
 * ★ ここで返す id は、サイト側で URL と HTML 属性にそのまま入る。
 *   YouTube の動画IDの形（英数と - _ の11文字）以外は**必ず捨てる**。
 * ★ タイトルはプレーンテキストで返す。HTML に入れる側（site.js）が必ずエスケープする。
 */

/** 小川うららプロのチャンネル「RaRa LESSON」 */
export const RARA_CHANNEL_ID = "UC4QTQjrDLsx4WF3fdYuLHZQ";

export type YoutubeVideo = {
  /** 動画ID（11文字） */
  id: string;
  title: string;
  /** 公開日時（ISO 8601。フィードの値そのまま） */
  published: string;
  /** 再生回数（フィードに無ければ null） */
  views: number | null;
  /** ショート動画か（リンクが /shorts/ のもの） */
  short: boolean;
};

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isYoutubeId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

/** XML の実体参照を戻す（フィードのタイトルは &amp; &quot; &#39; などで来る） */
export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
}

function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`);
  const m = re.exec(block);
  return m ? m[1] : null;
}

function attr(block: string, name: string, attrName: string): string | null {
  const re = new RegExp(`<${name}\\s[^>]*\\b${attrName}="([^"]*)"`);
  const m = re.exec(block);
  return m ? m[1] : null;
}

/**
 * フィード（Atom）から動画を取り出す。壊れた entry・IDの形が違う entry は黙って捨てる。
 * 並びはフィードのまま（新しい順）。
 */
export function parseYoutubeFeed(xml: string | null | undefined): YoutubeVideo[] {
  const src = String(xml ?? "");
  const out: YoutubeVideo[] = [];
  const seen = new Set<string>();
  const entries = src.match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
  for (const block of entries) {
    const id = (tag(block, "yt:videoId") ?? "").trim();
    if (!isYoutubeId(id) || seen.has(id)) continue;
    const title = decodeXmlEntities((tag(block, "title") ?? "").trim()).replace(/\s+/g, " ").trim();
    if (!title) continue;
    const published = (tag(block, "published") ?? "").trim();
    const href = attr(block, "link", "href") ?? "";
    const viewsRaw = attr(block, "media:statistics", "views");
    const views = viewsRaw != null && /^\d+$/.test(viewsRaw) ? Number(viewsRaw) : null;
    seen.add(id);
    out.push({ id, title, published, views, short: /\/shorts\//.test(href) });
  }
  return out;
}

/**
 * サイトに並べる分を選ぶ。
 * - exclude の動画（大きく固定で出している「おすすめ」など）は一覧から外す
 * - ショートは既定で外す（横長の枠に縦長が入って見にくいため）。ただし足りなければ補う
 */
export function pickVideos(
  list: readonly YoutubeVideo[],
  opts: { limit: number; exclude?: readonly string[]; includeShorts?: boolean },
): YoutubeVideo[] {
  const limit = Math.max(0, Math.floor(opts.limit));
  if (limit === 0) return [];
  const ex = new Set(opts.exclude ?? []);
  const pool = list.filter((v) => isYoutubeId(v.id) && !ex.has(v.id));
  const main = opts.includeShorts ? pool : pool.filter((v) => !v.short);
  if (main.length >= limit || opts.includeShorts) return main.slice(0, limit);
  const fill = pool.filter((v) => v.short);
  return [...main, ...fill].slice(0, limit);
}

/** サムネイル（maxres は無い動画があるので、一覧は hq を使う） */
export function youtubeThumb(id: string, size: "hq" | "maxres" = "hq"): string {
  if (!isYoutubeId(id)) return "";
  return `https://i.ytimg.com/vi/${id}/${size === "maxres" ? "maxresdefault" : "hqdefault"}.jpg`;
}
