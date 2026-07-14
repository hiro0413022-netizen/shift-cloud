import { NextResponse } from "next/server";

/**
 * /api/v1 — AIエージェント・n8n用API（API_STANDARD.md準拠）。
 * 認証が必要なエンドポイントは Bearer トークン（sha256ハッシュ照合 #12/#18方式）を実装すること。
 */
export async function GET() {
  return NextResponse.json({ ok: true, app: "demo-sales", time: new Date().toISOString() });
}
