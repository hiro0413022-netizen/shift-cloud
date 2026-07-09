import "server-only";
import { headers } from "next/headers";

/** 公開回答サイトの絶対オリジンを解決（env優先→リクエストヘッダ） */
export async function publicOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SURVEY_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3003";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
