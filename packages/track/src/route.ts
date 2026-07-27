import { recordView } from "./server";
import type { AdminClient, TrackKind } from "./types";

/**
 * 計測受信ルートの生成。
 *
 * 使い方（各アプリの src/app/api/track/route.ts）:
 *   import { createAdmin } from "@yozan/core/supabase/admin";
 *   import { createTrackHandler } from "@yozan/track/route";
 *   export const POST = createTrackHandler(() => createAdmin());
 *
 * ⚠ middleware の公開プレフィックスに "/api/track" を追加すること
 *   （公開APIの登録漏れは実際に事故になっている — DECISIONS #90）
 */

const KINDS = new Set<TrackKind>(["open", "page", "click", "heartbeat"]);
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export function createTrackHandler(getAdmin: () => AdminClient) {
  return async function POST(request: Request): Promise<Response> {
    // 計測は「壊れないこと」が最優先。何があっても204で返し、配信ページに影響させない
    const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const token = str(body.token, 200);
      const sessionKey = str(body.sessionKey, 64);
      const kind = str(body.kind, 20) as TrackKind | null;
      if (!token || !sessionKey || !kind || !KINDS.has(kind)) return noContent();

      const meta = (body.meta ?? {}) as Record<string, unknown>;
      await recordView(getAdmin(), {
        token,
        sessionKey,
        kind,
        page: str(body.page, 120),
        label: str(body.label, 120),
        seconds: Number(body.seconds ?? 0) || 0,
        internal: Boolean(body.internal),
        meta: {
          referrer: str(meta.referrer, 300),
          ua: str(meta.ua, 300),
          device: str(meta.device, 20),
        },
      });
    } catch {
      // 握る（計測失敗で相手のページを壊さない）
    }
    return noContent();
  };
}
