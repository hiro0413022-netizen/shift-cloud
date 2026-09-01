import { NextRequest, NextResponse } from "next/server";
import { lookupJoinPayment, confirmJoinByPayment } from "@/lib/frank-join-payment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 入会申込の決済確認（#188）
 * POST {member_id}                  … Squareの入金を照会するだけ
 * POST {member_id, confirm:true}    … 入金が確認できたら Web入会と同じ手順で確定する
 *
 * 認可は member_id（申込時に発行される推測不能なUUID）＝ join-checkout と同じ考え方。
 * できることは「その申込の入金を見る／入金が確認できたときだけ確定する」だけで、
 * **入金が無ければ何も起きない**（未入金の会員を作る経路にはならない）。
 * Square env は yozan-genesis にしか無いため、照会はこちら側で行い member-os から呼ぶ。
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const memberId = String(body.member_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
    return NextResponse.json({ ok: false, error: "bad_member_id" }, { status: 400 });
  }

  if (body.confirm === true) {
    const r = await confirmJoinByPayment(memberId);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  const r = await lookupJoinPayment(memberId);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
