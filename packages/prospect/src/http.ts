// 外部ページの取得。ネットワークに触るのはこのファイルだけ（audit.ts を純粋に保つため）。
//
// 巡回する以上、相手のサーバーに迷惑をかけない作りが前提:
//   - User-Agent に会社名と連絡先を書く（誰が来ているか分かるようにする）
//   - タイムアウト・サイズ上限を必ず付ける
//   - 同一ホストへの連続アクセスは delay を空ける（呼び出し側で await sleep）

import type { PageSnapshot } from "./types";

// ⚠ HTTPヘッダは ByteString（Latin-1）しか受け付けない。**日本語を1文字でも入れると fetch が例外を投げ、
// 巡回も採点も全滅する**（2026-08-07の実障害: 「株式会社YOZAN」を入れていて全リクエストが TypeError）。
// ここは必ずASCIIだけで書くこと。tests/prospect.test.ts が文字種を固定している。
export const UA =
  "YozanProspectBot/0.1 (+https://yozan-inc.jp/; YOZAN Inc. - website research for web design proposals; contact: info@yozan-group.jp)";

const MAX_BYTES = 2_000_000; // 2MB。これを超えるHTMLは評価しても意味がない

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchPage(url: string, timeoutMs = 12_000): Promise<PageSnapshot> {
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "ja,en;q=0.8" },
    });
    const buf = await res.arrayBuffer();
    const sliced = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
    const html = decodeHtml(sliced, res.headers.get("content-type"));
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return {
      url,
      finalUrl: res.url || url,
      status: res.status,
      headers,
      html,
      elapsedMs: Date.now() - started,
      bytes: buf.byteLength,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 文字コードを解いてHTMLにする。
 * 古いサイトほど Shift_JIS / EUC-JP が残っている（＝まさに営業対象）。UTF-8決め打ちだと
 * 本文が文字化けして「情報量が少ない・更新が古い」と誤判定するので、必ず charset を見る。
 */
export function decodeHtml(buf: ArrayBuffer, contentType: string | null): string {
  const head = new TextDecoder("ascii").decode(buf.slice(0, 4096));
  const fromHeader = (contentType ?? "").match(/charset=["']?([\w-]+)/i)?.[1];
  const fromMeta =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];
  const enc = (fromMeta ?? fromHeader ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(enc === "shift-jis" ? "shift_jis" : enc).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/** PageSpeed Insights。キー未設定・失敗時は null（計測できないことで巡回を止めない） */
export async function pageSpeedScore(url: string, apiKey?: string): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", url);
    api.searchParams.set("strategy", "mobile");
    api.searchParams.set("category", "performance");
    api.searchParams.set("key", apiKey);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    const res = await fetch(api, { signal: ac.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const j = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
    const s = j.lighthouseResult?.categories?.performance?.score;
    return typeof s === "number" ? Math.round(s * 100) : null;
  } catch {
    return null;
  }
}
