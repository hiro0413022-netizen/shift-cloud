import { NextRequest, NextResponse } from "next/server";
import {
  RARA_CHANNEL_ID,
  parseYoutubeFeed,
  youtubeFeedUrl,
  type YoutubeVideo,
} from "@yozan/core/youtube-feed";

export const dynamic = "force-dynamic";

/**
 * 公式サイトの「最新のレッスン動画」（#335・2026-10-03）
 * GET /api/public/site/frank-golf/videos → { videos: [{ id, title, published, views, short }] }
 *
 * 小川うららプロの YouTube「RaRa LESSON」の新着（最大15本・新しい順）。チャンネルの公開フィードを
 * サーバー側で読む（ブラウザからは CORS で読めない・Data API のキーは要らない）。
 * frankgolf.jp の assets/site.js が、動画の枠があるページでだけ読みに来る。
 * YouTube に新しい動画が上がれば、最長1時間ほどで公式サイトの一覧が入れ替わる＝デプロイ不要。
 * 読めなかったときは [] を返し、サイトはビルド時に焼き込んだ一覧をそのまま見せる。
 */
const ALLOWED_SITES = new Set(["frank-golf"]);
const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; list: YoutubeVideo[] } | null = null;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ site: string }> }) {
  const { site } = await ctx.params;
  if (!ALLOWED_SITES.has(site)) {
    return NextResponse.json({ error: "unknown site" }, { status: 404 });
  }
  const videos = await loadVideos();
  return NextResponse.json(
    { videos },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        // CDN で10分。裏で取り直す間は古い一覧を最大1時間返す
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
      },
    },
  );
}

/** サーバーの中で1時間覚えておく。失敗したら前回の値（10分延命）、それも無ければ [] */
async function loadVideos(): Promise<YoutubeVideo[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.list;
  try {
    const res = await fetch(youtubeFeedUrl(RARA_CHANNEL_ID), {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`youtube feed ${res.status}`);
    const list = parseYoutubeFeed(await res.text());
    if (list.length === 0) throw new Error("youtube feed empty");
    cache = { at: now, list };
    return list;
  } catch (e) {
    console.warn("[site/videos] youtube feed:", e instanceof Error ? e.message : e);
    if (cache) {
      cache = { at: now - TTL_MS + 10 * 60 * 1000, list: cache.list };
      return cache.list;
    }
    return [];
  }
}
