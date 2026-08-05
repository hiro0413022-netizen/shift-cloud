/**
 * X（旧Twitter）への自前アカウント投稿（DECISIONS #103 / migration 0093）。
 * SDKは使わず fetch + Web Crypto で OAuth 1.0a を自前署名（依存追加なし・#97 Stripe / instagram.ts と同方式）。
 *
 * なぜ OAuth 1.0a か:
 *   自分のアカウントに投稿するだけなら、ポータルで発行した4つの固定値で完結する（リフレッシュ不要）。
 *   OAuth 2.0 は user context の refresh token 運用が必要になり、失効の運用コストが増える。
 *
 * 前提（ユーザー作業・OPERATIONS.md §10）:
 *   - X開発者ポータル（console.x.com）でアプリを作成し、アプリ権限を「読み取りと書き込み」に
 *   - env: X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET
 *     （未設定の間は投稿せず注記のみ＝エラーにしない。設定した瞬間に次の投稿から流れる）
 *   - 従量課金（2026年2月〜）: 投稿$0.015/件・リンク付き$0.20/件。残高切れは 403 で返る
 *
 * Instagramとの役割分担:
 *   IG … 商品別アカウント・画像必須・本文のリンクは踏めない → カード画像＋bio誘導
 *   X  … 会社公式1アカウント @YOZAN_inc・本文にLPリンクを直接置ける → リンク直貼りで計測
 */

export type XConfig = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
};

const TWEETS_ENDPOINT = "https://api.x.com/2/tweets";

/** X投稿の上限（重み付き）。全角=2・半角=1、URLは実長に関わらず23で固定 */
export const X_WEIGHTED_LIMIT = 280;
const URL_WEIGHT = 23;

/**
 * envから設定を読む。4つ揃っていなければ null（呼び出し側でスキップ判断）。
 * Xは商品を分けず会社公式1アカウント（@YOZAN_inc）に集約する＝アカウント別envは無い。
 */
export function xConfigFromEnv(): XConfig | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

/** RFC3986のパーセントエンコード（encodeURIComponent が残す !*'() も潰す＝署名が壊れる元） */
function pct(v: string): string {
  return encodeURIComponent(v).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function nonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA1（Web Crypto。Node/Edgeどちらでも動く＝ランタイム前提を持たない） */
async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * OAuth 1.0a の Authorization ヘッダを組み立てる。
 * JSONボディのPOSTでは、署名対象はoauthパラメータ（＋クエリ）だけ。ボディは含めない。
 */
export async function buildOAuthHeader(
  cfg: XConfig,
  method: "POST" | "GET",
  url: string,
  extraParams: Record<string, string> = {}
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: cfg.apiKey,
    oauth_nonce: nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: cfg.accessToken,
    oauth_version: "1.0",
    ...extraParams,
  };
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${pct(k)}=${pct(oauth[k])}`)
    .join("&");
  const base = [method, pct(url), pct(paramString)].join("&");
  const signingKey = `${pct(cfg.apiSecret)}&${pct(cfg.accessSecret)}`;
  const signature = await hmacSha1Base64(signingKey, base);

  // 明示的に Record<string, string>（型を書かないと spread 後に index signature が消えて TS7053 になる）
  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(header)
      .sort()
      .map((k) => `${pct(k)}="${pct(header[k])}"`)
      .join(", ")
  );
}

/** X（Twitter）の文字数カウント。CJK・全角は2、それ以外は1。URLは一律23 */
export function weightedLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    // Twitter text weighting: 以下の範囲外は重み2（CJK・かな・全角記号・絵文字など）
    const light =
      (cp >= 0x0000 && cp <= 0x10ff) ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    n += light ? 1 : 2;
  }
  return n;
}

/**
 * 重み付き上限に収まるよう末尾を落とす。
 * 文の途中でぶつ切りにすると読めない投稿になるので（初回投稿で「✓ 予約・問い合…」と切れた実例）、
 * 上限内の最後の文末（。！？\n）で切る。文末が早すぎる位置にしか無い場合だけ字数で切って…を付ける。
 */
function truncateWeighted(text: string, limit: number): string {
  if (weightedLength(text) <= limit) return text;
  const ellipsisWeight = weightedLength("…"); // 全角扱い＝2

  // まず上限（…の分を引く）まで文字を積む
  let head = "";
  let n = 0;
  for (const ch of text) {
    const w = weightedLength(ch);
    if (n + w > limit - ellipsisWeight) break;
    head += ch;
    n += w;
  }

  // 拾えた部分が短すぎる（上限の6割未満）と本文が痩せるので、その場合は素直に字数で切る
  const minKeep = (limit - ellipsisWeight) * 0.6;

  // ① 文末（。！？）で切る＝一番きれいに終わる
  const sentenceEnd = Math.max(head.lastIndexOf("。"), head.lastIndexOf("！"), head.lastIndexOf("？"));
  if (sentenceEnd > 0) {
    const candidate = head.slice(0, sentenceEnd + 1).trimEnd();
    if (weightedLength(candidate) >= minKeep) return candidate;
  }

  // ② 文末が無ければ改行で切る。ただし「よくある落とし穴は：」のような前振りだけの行は捨てる
  const newline = head.lastIndexOf("\n");
  if (newline > 0) {
    const candidate = head.slice(0, newline).replace(/\n[^\n]*[：:]\s*$/, "").trimEnd();
    if (weightedLength(candidate) >= minKeep) return candidate;
  }

  return `${head.trimEnd()}…`;
}

/**
 * Instagram前提のCTA表現をX向けに言い換える。
 * IGは本文リンクが踏めないので「プロフィールのリンク」と書くが、Xは本文にリンクが載る＝そのままだと案内が食い違う。
 */
function adaptCtaForX(body: string): string {
  return body
    .replace(/プロフィールのリンク/g, "下のリンク")
    .replace(/プロフィール(?:の)?URL/g, "下のリンク")
    .replace(/プロフィール欄のリンク/g, "下のリンク");
}

/**
 * X用の本文を組み立てる。
 * Instagramのキャプション（全角400字想定・bio誘導）はそのままでは長すぎるので、
 * 「本文（縮める）＋ 空行 ＋ LPリンク ＋ ハッシュタグ2つ」に再構成する。
 *
 * リンクはt.co短縮で一律23文字扱いなので、URLの長さは気にしなくてよい。
 */
export function buildTweetText(input: {
  body: string;
  hashtags?: string[];
  url?: string | null;
  limit?: number;
}): string {
  const limit = input.limit ?? X_WEIGHTED_LIMIT;
  // ハッシュタグはXでは付けすぎると読みにくいので先頭2つまで
  const tags = (input.hashtags ?? []).slice(0, 2).join(" ");
  const tagsBlock = tags ? `\n${tags}` : "";
  const urlBlock = input.url ? `\n\n${input.url}` : "";
  // URLはt.co短縮で一律23文字扱い（実長は無関係）。改行ぶんも予約する
  const reserve = (input.url ? URL_WEIGHT + 2 : 0) + weightedLength(tagsBlock);

  const source = input.url ? adaptCtaForX(input.body) : input.body;
  const body = truncateWeighted(source.trim(), Math.max(20, limit - reserve));
  return `${body}${urlBlock}${tagsBlock}`.trim();
}

type XErrorBody = {
  title?: string;
  detail?: string;
  errors?: Array<{ message?: string }>;
  status?: number;
};

const MEDIA_UPLOAD_ENDPOINT = "https://upload.twitter.com/1.1/media/upload.json";

/**
 * 画像を1枚アップロードして media_id を得る（#104）。
 *
 * OAuth 1.0a では **v1.1 の upload.twitter.com が正規ルート**（v2の /2/media/upload は OAuth 2.0 前提で、
 * 1.0aだと403になる報告が多い）。multipartのボディは署名対象に含めない＝oauthパラメータだけで署名する。
 *
 * 画像はカード画像エンドポイント（/api/public/ai-sales/card/[id]）から取得する。
 * 失敗しても投稿自体は落とさない設計（呼び出し側でテキストのみに切り替える）。
 */
export async function uploadMedia(cfg: XConfig, imageUrl: string): Promise<{ mediaId: string }> {
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error(`カード画像の取得に失敗: HTTP ${imgRes.status}`);
  const blob = await imgRes.blob();
  if (blob.size > 5 * 1024 * 1024) throw new Error(`画像が大きすぎます（${Math.round(blob.size / 1024)}KB・上限5MB）`);

  const form = new FormData();
  form.append("media", blob, "card.png");

  const authorization = await buildOAuthHeader(cfg, "POST", MEDIA_UPLOAD_ENDPOINT);
  const res = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { authorization }, // content-type は FormData に任せる（boundaryを壊さない）
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const json = (await res.json().catch(() => ({}))) as { media_id_string?: string } & XErrorBody;
  if (!res.ok) {
    const detail = json.detail ?? json.errors?.[0]?.message ?? json.title ?? "unknown";
    throw new Error(`X media upload HTTP ${res.status}: ${detail}`);
  }
  const mediaId = String(json.media_id_string ?? "");
  if (!mediaId) throw new Error("X media upload: media_id が返りませんでした");
  return { mediaId };
}

/**
 * 投稿（POST /2/tweets）。成功で tweetId を返す。
 * 失敗はメッセージを整えて throw（呼び出し側が cnt_posts.x_error に残す）。
 */
export async function publishTweet(cfg: XConfig, text: string, mediaIds?: string[]): Promise<{ tweetId: string }> {
  const authorization = await buildOAuthHeader(cfg, "POST", TWEETS_ENDPOINT);
  const payload: Record<string, unknown> = { text };
  if (mediaIds && mediaIds.length > 0) payload.media = { media_ids: mediaIds.slice(0, 4) };
  const res = await fetch(TWEETS_ENDPOINT, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { id?: string } } & XErrorBody;
  if (!res.ok) {
    const detail = json.detail ?? json.errors?.[0]?.message ?? json.title ?? "unknown";
    // よくある詰まりを日本語で言い添える（/ai-sales の失敗カードにそのまま出る）
    const hint =
      res.status === 401
        ? "（キー4つのどれかが違う／再生成後にenv未更新の可能性）"
        : res.status === 403
          ? "（アプリ権限が『読み取りのみ』のまま、またはクレジット残高切れの可能性）"
          : res.status === 429
            ? "（レート制限。次のtickで再試行してください）"
            : "";
    throw new Error(`X API HTTP ${res.status}: ${detail}${hint}`);
  }
  const id = String(json.data?.id ?? "");
  if (!id) throw new Error("X: 応答にツイートIDがありません");
  return { tweetId: id };
}
