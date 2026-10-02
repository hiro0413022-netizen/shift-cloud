import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { chargeCardOnFile } from "@/lib/frank-square";
import { loadBookingCfg } from "@yozan/core/frank-booking";
import { ticketAmountExTax, ticketBalance, paidQtyForUse } from "@yozan/core/frank-lesson-tickets";
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

export type TicketPrice = {
  unitExTax: number;
  unitTaxIncluded: number;
  minutes: number;
  /** まとめ買い（税抜・税込）。例 4枚 9,000 / 9,900 */
  packs: { qty: number; priceExTax: number; priceTaxIncluded: number }[];
};

/** 枚数に対するお支払い（税込）。まとめ買いを当ててから税を足す（画面とサーバーで同じ計算） */
export function ticketTotalTaxIncluded(price: TicketPrice, qty: number): number {
  return withTax(ticketAmountExTax(qty, price.unitExTax, price.packs.map((p) => ({ qty: p.qty, price: p.priceExTax }))));
}

export async function ticketPrice(): Promise<TicketPrice> {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin);
  const unitExTax = Number(cfg.lesson_option?.price ?? 2500);
  const packs = (cfg.lesson_option?.packs ?? [{ qty: 4, price: 9000 }])
    .map((p) => ({ qty: Number(p.qty), priceExTax: Number(p.price) }))
    .filter((p) => p.qty > 1 && p.priceExTax > 0)
    .map((p) => ({ ...p, priceTaxIncluded: withTax(p.priceExTax) }));
  return {
    unitExTax,
    unitTaxIncluded: withTax(unitExTax),
    minutes: Number(cfg.lesson_option?.minutes ?? 25),
    packs,
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
  const amount = ticketTotalTaxIncluded(price, qty);

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
 * レッスンぶんのチケットを引く（#328・2026-10-01 で枚数対応に作り直し）
 *
 * ★ 1予約につき**1行**のまま、枚数は qty（負数）で持つ
 *   50分なら qty=-2。行を2本insertする作りにすると
 *   「1予約1枚」の一意索引を外すことになり、二重消費の歯止めが消える。
 *
 * ★ 同じ予約でもう一度呼ばれたら、**作り直すのではなく枚数を直す**
 *   これが林さんの報告（2026-10-01）の原因だった。確定済みの予約を保存し直すと
 *   insertが一意索引で弾かれ、呼び出し側がそれを「チケット無し」と読んで
 *   **既に1枚使っているのに当日精算2,500円を復活させていた**。
 *
 * ★ 足りなければ**あるだけ使う**（ユーザー決定 2026-10-01）
 *   残1枚で50分なら1枚使って、残り25分ぶんだけ当日精算。
 *   お客様の手持ちを無駄にせず、金額も時間に見合う。
 *
 * @returns used = 実際に引けた枚数 / paid = そのうち購入ぶん（インセンティブ対象）
 */
export async function useTicket(input: {
  companyId: string;
  memberId: string;
  storeId: string | null;
  bookingId?: string | null;
  staffId?: string | null;
  /** そのレッスンの担当コーチ（インセンティブの支払先） */
  coachStaffId?: string | null;
  note?: string | null;
  /** 必要枚数（既定1枚） */
  qty?: number;
}): Promise<{ ok: boolean; used: number; paid: number; reason?: string }> {
  const admin = createAdmin();
  const need = Math.max(1, Math.floor(Number(input.qty ?? 1)) || 1);

  // 台帳を1回だけ読む（残枚数・購入ぶんの引き当て・この予約の既存行を同じ材料から出す）
  const { data: rows } = await admin
    .from("frunk_lesson_tickets")
    .select("id, kind, qty, created_at, booking_id, paid_qty")
    .eq("member_id", input.memberId)
    .eq("status", "granted")
    .is("deleted_at", null);
  type L = { id: string; kind: string; qty: number; created_at: string; booking_id: string | null; paid_qty: number | null };
  const ledger = ((rows ?? []) as L[]);

  // この予約で既に引いている行（＝保存し直し）
  const mine = input.bookingId ? ledger.find((r) => r.kind === "use" && r.booking_id === input.bookingId) : undefined;
  const mineQty = mine ? Math.abs(Number(mine.qty) || 0) : 0;

  // 自分の行を除いた残枚数＝これから割り当てられる上限
  const balanceWithoutMine = ledger
    .filter((r) => r.id !== mine?.id)
    .reduce((n, r) => n + (Number(r.qty) || 0), 0);
  const used = Math.min(need, balanceWithoutMine);
  if (used < 1) {
    // 1枚も引けない。既に引いていた行があれば戻す（枚数0の行は残さない）
    if (mine) await admin.from("frunk_lesson_tickets").update({ status: "void", booking_id: null, updated_at: new Date().toISOString() }).eq("id", mine.id);
    return { ok: false, used: 0, paid: 0, reason: mineQty > 0 ? "チケットの残りがありません" : "チケットの残りがありません" };
  }

  // 購入ぶんの引き当ては「自分の行を除いた台帳」で数える（自分の行は入れ替えるため）
  const paid = paidQtyForUse(
    ledger.filter((r) => r.id !== mine?.id).map((r) => ({
      kind: r.kind as "grant" | "purchase" | "use" | "refund",
      qty: Number(r.qty) || 0,
      created_at: String(r.created_at),
    })),
    used,
  );

  const patch = {
    qty: -used,
    paid_qty: paid,
    coach_staff_id: input.coachStaffId ?? null,
    note: input.note ?? null,
    updated_at: new Date().toISOString(),
  };

  if (mine) {
    const { error } = await admin.from("frunk_lesson_tickets").update(patch).eq("id", mine.id);
    if (error) return { ok: false, used: 0, paid: 0, reason: "チケットを直せませんでした" };
    return { ok: true, used, paid };
  }

  const { error } = await admin.from("frunk_lesson_tickets").insert({
    company_id: input.companyId,
    store_id: input.storeId,
    member_id: input.memberId,
    kind: "use",
    minutes: 25,
    status: "granted",
    booking_id: input.bookingId ?? null,
    source: "staff",
    created_by: input.staffId ?? null,
    ...patch,
  });
  // 一意索引での衝突＝ほぼ同時に2人が確定を押した。あとから来たほうは何もしない
  if (error) return { ok: false, used: 0, paid: 0, reason: "この予約では既にチケットを使っています" };
  return { ok: true, used, paid };
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
