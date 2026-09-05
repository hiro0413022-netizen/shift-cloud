import { NextRequest, NextResponse } from "next/server";
import { buildReceiptPdf, type ReceiptItem } from "@/lib/frank-receipt-pdf";
import { verifyAdminPayload } from "@yozan/core/admin-sign";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 領収書PDFの生成だけを行う（#222）。member-os の会員カードからサーバー間で呼ぶ。
 *
 * ★ ここは「渡された内容を紙にする」だけで、金額をDBから探しに行かない。
 *   誰にいくら入金があったかは member-os 側がスタッフ権限で確かめている（mon_sales）。
 * ★ 署名（HMAC・5分）が無ければ何も作らない＝URLを知っただけでは領収書を作れない。
 *   PDFのフォントが Genesis にしか無いのでここに置いているだけで、入口は member-os。
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const payload = String(body.payload ?? "");
  const exp = Number(body.exp ?? 0);
  const sig = String(body.sig ?? "");
  if (!verifyAdminPayload(payload, exp, sig)) {
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let input: {
    toName?: string;
    note?: string;
    items?: ReceiptItem[];
    issuedOn?: string;
    memberNo?: string | null;
    receiptNo?: string;
    payMethod?: string | null;
  };
  try {
    input = JSON.parse(payload) as typeof input;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }

  const items = (input.items ?? []).filter((i) => Number(i?.amount) > 0);
  if (items.length === 0) return NextResponse.json({ ok: false, error: "no_items" }, { status: 400 });

  const pdf = await buildReceiptPdf({
    toName: String(input.toName ?? "").slice(0, 80) || "上様",
    note: String(input.note ?? "月会費として").slice(0, 80),
    items: items.slice(0, 20),
    issuedOn: String(input.issuedOn ?? new Date().toISOString().slice(0, 10)),
    memberNo: input.memberNo ?? null,
    receiptNo: String(input.receiptNo ?? "").slice(0, 32) || "—",
    payMethod: input.payMethod ?? null,
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
    },
  });
}
