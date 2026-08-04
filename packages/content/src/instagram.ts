/**
 * Instagram Graph API での自前アカウント投稿（公式・完全自動化が許される領域）。
 * SDKは使わずfetchでREST直（#97 Stripe と同方式・依存追加なし）。
 *
 * 前提（ユーザー作業・OPERATIONS.md「Instagram連携」節）:
 *   - Instagramをプロアカウント化しFacebookページに接続
 *   - Meta開発者アプリから長期アクセストークンを取得
 *   - env: IG_ACCESS_TOKEN / IG_BUSINESS_ID（未設定の間は投稿せず「未設定」注記のみ＝エラーにしない）
 *
 * 投稿は2段階: ①メディアコンテナ作成（image_url + caption）→ ②publish。
 * image_url はMeta側から取得できる公開URLが必須（/api/public/ai-sales/card/[id] を渡す）。
 */

export type IgConfig = { accessToken: string; businessId: string };

const GRAPH = "https://graph.facebook.com/v21.0";

/** envから設定を読む。未設定なら null（呼び出し側でスキップ判断） */
export function igConfigFromEnv(): IgConfig | null {
  const accessToken = process.env.IG_ACCESS_TOKEN;
  const businessId = process.env.IG_BUSINESS_ID;
  if (!accessToken || !businessId) return null;
  return { accessToken, businessId };
}

/**
 * 商品→Instagramアカウントの解決（アカウント2つ運用・2026-08-04）。
 *   pganote / swing-cortex → @swingcortex_jp（IG_ACCESS_TOKEN / IG_BUSINESS_ID）
 *   webdesign             → @yozan_web_jp（IG_ACCESS_TOKEN_WEB / IG_BUSINESS_ID_WEB）
 */
export function igConfigForProduct(product: string): IgConfig | null {
  if (product === "webdesign") {
    const accessToken = process.env.IG_ACCESS_TOKEN_WEB;
    const businessId = process.env.IG_BUSINESS_ID_WEB;
    if (!accessToken || !businessId) return null;
    return { accessToken, businessId };
  }
  return igConfigFromEnv();
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

async function graphPost(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(30000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & GraphError;
  if (!res.ok) {
    throw new Error(`Instagram API HTTP ${res.status}: ${json.error?.message ?? "unknown"}`);
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 画像1枚のフィード投稿。成功で mediaId を返す。
 * コンテナ処理中（Media ID is not available）は数秒待って再試行する。
 */
export async function publishImagePost(
  cfg: IgConfig,
  input: { imageUrl: string; caption: string }
): Promise<{ mediaId: string }> {
  const container = await graphPost(`${GRAPH}/${cfg.businessId}/media`, {
    image_url: input.imageUrl,
    caption: input.caption.slice(0, 2200), // IGのキャプション上限
    access_token: cfg.accessToken,
  });
  const creationId = String(container.id ?? "");
  if (!creationId) throw new Error("Instagram: メディアコンテナの作成に失敗（idなし）");

  // publishはコンテナの処理完了を待つ必要がある場合がある → 最大4回・計約20秒リトライ
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(5000);
    try {
      const published = await graphPost(`${GRAPH}/${cfg.businessId}/media_publish`, {
        creation_id: creationId,
        access_token: cfg.accessToken,
      });
      const mediaId = String(published.id ?? "");
      if (mediaId) return { mediaId };
      lastError = "publishの応答にidがありません";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // 処理中エラー以外（権限・トークン失効等）は待っても直らないので即時中断
      if (!/not available|not ready|processing|9007/i.test(lastError)) throw new Error(lastError);
    }
  }
  throw new Error(`Instagram publish リトライ上限: ${lastError}`);
}
