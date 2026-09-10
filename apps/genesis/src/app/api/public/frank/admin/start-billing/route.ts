import { NextRequest, NextResponse } from "next/server";
import { startSubscriptionOnFile } from "@/lib/frank-square-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 保存カードから月会費の自動課金を立てる（#233）
 * POST {member_id, start_date?}
 *
 * 認可は member_id（推測不能なUUID）＝ join-checkout / join-payment と同じ考え方。
 * できることは「カードが保存済みで、まだサブスクを持っていない会員に、
 * 前取り分が終わったあとの日付でサブスクを1本作る」だけ。
 * カードが無い・すでにサブスクがある・0円プラン・過去日 は何も起きない。
 * Square env は yozan-genesis にしか無いため、実行はこちら側で行い member-os から呼ぶ（#188と同じ）。
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
  const startDate = typeof body.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)
    ? body.start_date
    : null;

  const r = await startSubscriptionOnFile(memberId, startDate);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
