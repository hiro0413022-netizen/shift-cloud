import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { chargeCardOnFile } from "@/lib/frank-square";
import { loadBookingCfg } from "@yozan/core/frank-booking";
import { ticketBalance } from "@yozan/core/frank-lesson-tickets";
import { withTax } from "@yozan/core/frank-tax";

/**
 * パーソナルレッスン(25分)チケットの売買と消費（#199・2026-09-03）
 *
 * ★ お支払いの考え方（ユーザー選択「カード→無ければ店頭」）
 *   登録カードがあればその場で決済し、すぐ使える。無い／失敗したら
 *   **お申し込みは残して status='pending_payment'**（残枚数には入らない）。
 *   スタッフが店頭でいただいたら受領を押して有効になる。
 *   ＝お客様の前で申し込みを失敗させない（モバイルオーダーと同じ方針・#154）。
 *
 * ★ 金額は BookingCfg.lesson_option.price（税抜）が正典
 *   料金を変えるときは gn_site_content の1か所（デプロイ不要）。
 *   **お客様に見せるのは必ず税込**（総額表示義務・frank-tax.ts）。
 */

export type TicketPrice = { unitExTax: number; unitTaxIncluded: number; minutes: number };

export async function ticketPrice(): Promise<TicketPrice> {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin);
  const unitExTax = Number(cfg.lesson_option?.price ?? 2500);
  return {
    unitExTax,
    unitTaxIncluded: withTax(unitExTax),
    minutes: Number(cfg.lesson_option?.minutes ?? 25),
  };
}

export type PurchaseResult = { ok: true; paid: boolean; qty: number; amount: number; message: string } | { ok: false; message: string };

/** 会員ポータルからのチケット購入（1枚単位・上限は事故防止のため10枚） */
export async function purchaseTickets(input: {
  companyId: string;
  memberId: string;
  memberNo: string;
  storeId: string | null;
  squareCustomerId: string | null;
  qty: number;
}): Promise<PurchaseResult> {
  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, message: "枚数を選んでください" };
  if (qty > 10) return { ok: false, message: "一度にご購入いただけるのは10枚までです" };

  const admin = createAdmin();
  const price = await ticketPrice();
  const amount = price.unitTaxIncluded * qty;

  // ① まずカードで試す。ここで通れば、すぐ使える
  let paid = false;
  let paymentId: string | null = null;
  if (input.squareCustomerId) {
    const r = await chargeCardOnFile({
      customerId: input.squareCustomerId,
      amountTaxIncluded: amount,
      note: `レッスンチケット${qty}枚（${input.memberNo}）`,
    });
    paid = r.ok;
    paymentId = (r as { paymentId?: string }).paymentId ?? null;
  }

  // ② 決済できなくても申し込みは残す（店頭でお支払い）
  const { error } = await admin.from("frunk_lesson_tickets").insert({
    company_id: input.companyId,
    store_id: input.storeId,
    member_id: input.memberId,
    kind: "purchase",
    qty,
    minutes: price.minutes,
    status: paid ? "granted" : "pending_payment",
    unit_price: price.unitExTax,
    amount,
    payment_method: paid ? "card" : "store",
    paid_at: paid ? new Date().toISOString() : null,
    square_payment_id: paymentId,
    source: "portal",
  });
  if (error) return { ok: false, message: "お申し込みを保存できませんでした。少し時間をおいてお試しください" };

  return {
    ok: true,
    paid,
    qty,
    amount,
    message: paid
      ? `チケット${qty}枚をご購入いただきました（${amount.toLocaleString("ja-JP")}円・カード決済）。`
      : `チケット${qty}枚をお申し込みいただきました。次回ご来店時に受付で${amount.toLocaleString("ja-JP")}円をお支払いください（お支払い後にご利用いただけます）。`,
  };
}

/** 店頭でお支払いをいただいた（スタッフ操作）。ここで初めて残枚数に入る。 */
export async function receiveTicketPayment(ticketId: string, staffId: string | null): Promise<boolean> {
  const admin = createAdmin();
  const { error } = await admin
    .from("frunk_lesson_tickets")
    .update({
      status: "granted",
      paid_at: new Date().toISOString(),
      payment_method: "store",
      created_by: staffId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId)
    .eq("status", "pending_payment") // 二重受領を止める
    .is("deleted_at", null);
  return !error;
}

/**
 * レッスン1回ぶんを引く。
 *
 * bookingId を渡すと「その予約につき1枚」の一意索引が二重消費を止める。
 * 残枚数が足りなければ何もしない（マイナス残高を作らない）。
 */
export async function useTicket(input: {
  companyId: string;
  memberId: string;
  storeId: string | null;
  bookingId?: string | null;
  staffId?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdmin();
  const balance = await ticketBalance(admin, input.memberId);
  if (balance < 1) return { ok: false, reason: "チケットの残りがありません" };

  const { error } = await admin.from("frunk_lesson_tickets").insert({
    company_id: input.companyId,
    store_id: input.storeId,
    member_id: input.memberId,
    kind: "use",
    qty: -1,
    status: "granted",
    booking_id: input.bookingId ?? null,
    note: input.note ?? null,
    source: "staff",
    created_by: input.staffId ?? null,
  });
  // 一意索引での衝突＝この予約では既に1枚引いている
  if (error) return { ok: false, reason: "この予約では既にチケットを使っています" };
  return { ok: true };
}

/**
 * 引いたチケットを戻す（レッスンが流れた・入力間違い）。
 *
 * ★ 戻しの行を足すのではなく、**使った行を取り消し(void)にする**。
 *   +1 の行を足すと「使った」と「戻した」が両方残り、残高は合うが履歴が読みにくい。
 *   void は残高に入らず、履歴には「ご利用（取り消し）」として残る。
 *   booking_id も外して、同じ予約でもう一度引けるようにする（一意索引を空ける）。
 */
export async function refundTicket(bookingId: string): Promise<boolean> {
  const admin = createAdmin();
  const { error } = await admin
    .from("frunk_lesson_tickets")
    .update({ status: "void", booking_id: null, updated_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .eq("kind", "use")
    .eq("status", "granted")
    .is("deleted_at", null);
  return !error;
}
