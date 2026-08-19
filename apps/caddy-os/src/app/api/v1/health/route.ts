import { NextResponse } from "next/server";

/**
 * /api/v1 — AIエージェント・n8n・外部システム用API（API_STANDARD.md準拠 / DECISIONS #140）
 *
 * 提供している口:
 *   GET  /api/v1/partners      キャディマスタ
 *   POST /api/v1/partners      キャディ登録
 *   GET  /api/v1/clients       ゴルフ場マスタ
 *   GET  /api/v1/availability  シフト希望（?month=YYYY-MM）
 *   POST /api/v1/availability  シフト希望の登録・更新（LINE Bot等から）
 *   GET  /api/v1/dispatches    派遣シフト（?month= &status= &client_id= &partner_id=）
 *   POST /api/v1/dispatches    派遣シフトの作成（仮/確定）
 *   PATCH /api/v1/dispatches   ステータス変更（確定・取消）
 *   GET  /api/v1/exports       ゴルフ場別の派遣一覧（?month= &client_id= &format=）
 *
 * health だけは認証不要（監視用）。他は Authorization: Bearer <CADDY_API_TOKEN>。
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "caddy-os",
    api: "v1",
    time: new Date().toISOString(),
    endpoints: ["/api/v1/partners", "/api/v1/clients", "/api/v1/availability", "/api/v1/dispatches", "/api/v1/exports"],
  });
}
