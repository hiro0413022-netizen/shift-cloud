import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@yozan/core/jst";
import { FRANK_STORE_CODE } from "@yozan/core/frank-booking";
import {
  newCheckinToken,
  normalizeCheckinScan,
  greetingLines,
  orderNo as fmtOrderNo,
  buildOrderLines,
  orderNote,
  type MenuItem,
  type PriceKind,
  type OrderLineInput,
  hhmmToMin,
  visitClosed,
} from "@yozan/core/frank-portal";
import { chargeOrderOnFile } from "@/lib/frank-square";
import { memberDisplayName } from "@yozan/core/frank-corporate";

/**
 * FRANK 会員ポータルのサーバー側処理（#154）
 *
 * 設計の正典: docs/modules/frank/MEMBER_PORTAL_構想.md
 *
 * ★ ここが「トークンの受け口を1本にする」の実体。
 *   受付PCのバーコードリーダーは今は USB HIDキーボード（入力欄に文字が打たれる）だが、
 *   将来 仮想COM（Web Serial）に切り替えても、入口の checkInByToken() に同じ文字列を
 *   渡すだけでよい。画面・DB・業務ロジックは一切変えない。
 */

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const n = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

/** JSTの現在時刻 "HH:MM"（サーバーはUTCなので必ずここを通す） */
function nowHHMM(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
/** timestamptz を JST の "HH:MM" に直す。壊れていれば null（判定に使わない）。 */
function jstHHMM(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 9 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export const CHECKIN_MEMBER_STATUS_OK = ["active", "approved", "suspended"] as const;

// ---------------------------------------------------------------
// 会員証トークン
// ---------------------------------------------------------------
/**
 * 会員のチェックイン用トークンを返す（無ければ発行する）。
 * 入会時ではなくポータルを開いた時に作る＝既存会員も何もしなくても使えるようになる。
 */
export async function ensureCheckinToken(memberId: string): Promise<string | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_members").select("id, checkin_token")
    .eq("id", memberId).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const cur = s((data as Row).checkin_token);
  if (cur) return cur;

  // unique 索引があるので、万一衝突しても数回で必ず取れる
  for (let i = 0; i < 5; i++) {
    const token = newCheckinToken();
    const { error } = await admin
      .from("frunk_members")
      .update({ checkin_token: token, checkin_token_issued_at: new Date().toISOString() })
      .eq("id", memberId).is("checkin_token", null);
    if (!error) {
      const { data: after } = await admin
        .from("frunk_members").select("checkin_token").eq("id", memberId).maybeSingle();
      const t = s((after as Row | null)?.checkin_token);
      if (t) return t;
    }
  }
  return null;
}

/** 会員証QRを再発行する（スクショが流出したとき用）。古いQRはその瞬間に使えなくなる。 */
export async function reissueCheckinToken(memberId: string): Promise<string | null> {
  const admin = createAdmin();
  for (let i = 0; i < 5; i++) {
    const token = newCheckinToken();
    const { error } = await admin
      .from("frunk_members")
      .update({ checkin_token: token, checkin_token_issued_at: new Date().toISOString() })
      .eq("id", memberId).is("deleted_at", null);
    if (!error) return token;
  }
  return null;
}

// ---------------------------------------------------------------
// チェックイン
// ---------------------------------------------------------------
export type CheckinOk = {
  ok: true;
  checkinId: string;
  memberId: string;
  memberNo: string;
  name: string;
  planName: string | null;
  bayId: string | null;
  bayName: string | null;
  startTime: string | null;
  endTime: string | null;
  greeting: string[];
  /** 同じ日の2回目以降（受付では「すでにチェックイン済み」と出す） */
  repeat: boolean;
};
export type CheckinNg = { ok: false; reason: "invalid" | "unknown" | "inactive"; message: string };
export type CheckinResult = CheckinOk | CheckinNg;

/**
 * リーダーが読んだ文字列でチェックインする（受付画面の唯一の入口）。
 *
 * 卓上リーダーは目の前のものを何でも読むので、まず normalizeCheckinScan で
 * 「自社トークンの形かどうか」を見て、違えば黙って捨てる（invalid）。
 * ここを通さないと、商品バーコードのたびにDBを引きに行くことになる。
 */
export async function checkInByToken(rawScan: string, source: "qr" | "bay" = "qr"): Promise<CheckinResult> {
  const token = normalizeCheckinScan(rawScan);
  if (!token) return { ok: false, reason: "invalid", message: "会員証のQRコードではありません" };

  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_members").select("id, status")
    .eq("checkin_token", token).is("deleted_at", null).maybeSingle();
  if (!data) return { ok: false, reason: "unknown", message: "この会員証は登録されていません" };

  const status = s((data as Row).status);
  if (!(CHECKIN_MEMBER_STATUS_OK as readonly string[]).includes(status)) {
    return { ok: false, reason: "inactive", message: "ご利用いただけない状態です。スタッフにお声がけください" };
  }
  return checkInMember(s((data as Row).id), source);
}

/**
 * 会員IDでチェックインする。QR・手動チェックイン・打席QRのすべてがここに合流する。
 *
 * 同じ日に何度かざしても frunk_checkins は1行のまま（uq_frunk_checkin_member_day）。
 * ここが増えると来店回数と声かけカードが狂う。
 */
export async function checkInMember(memberId: string, source: "qr" | "manual" | "bay"): Promise<CheckinResult> {
  const admin = createAdmin();
  const today = jstYmd();

  const { data: m } = await admin
    .from("frunk_members")
    .select("id, company_id, store_id, member_no, name, company_name, birth_date, note, status, frunk_plans(name)")
    .eq("id", memberId).is("deleted_at", null).maybeSingle();
  if (!m) return { ok: false, reason: "unknown", message: "会員が見つかりません" };
  const mem = m as Row;
  const companyId = s(mem.company_id);

  // 今日の打席予約（キャンセル以外）。複数あれば早い時間を採る。
  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, bay_id, start_time, end_time, status, frunk_bays(name)")
    .eq("member_id", memberId).eq("booked_date", today)
    .neq("status", "cancelled").is("deleted_at", null)
    .order("start_time", { ascending: true }).limit(1).maybeSingle();
  const booking = (bk ?? null) as Row | null;

  // 既存のチェックイン（同日）
  const { data: existing } = await admin
    .from("frunk_checkins").select("id, bay_id, booking_id")
    .eq("member_id", memberId).eq("visited_on", today).is("deleted_at", null).maybeSingle();

  const bayId = s(booking?.bay_id) || s((existing as Row | null)?.bay_id) || null;
  let checkinId = s((existing as Row | null)?.id);

  if (checkinId) {
    // 2回目以降は打席と予約の紐付けだけ更新（checked_in_at は最初の時刻のまま）
    await admin.from("frunk_checkins")
      .update({ bay_id: bayId, booking_id: s(booking?.id) || null })
      .eq("id", checkinId);
  } else {
    const storeId = s(mem.store_id) || (await frankStore())?.storeId || "";
    if (!storeId) return { ok: false, reason: "unknown", message: "店舗の設定が見つかりません" };
    const { data: ins } = await admin.from("frunk_checkins").insert({
      company_id: companyId,
      store_id: storeId,
      member_id: memberId,
      booking_id: s(booking?.id) || null,
      bay_id: bayId,
      visited_on: today,
      source,
    }).select("id").maybeSingle();
    checkinId = s((ins as Row | null)?.id);
    // 冪等索引で弾かれた場合（同時に2回かざした）は既存を引き直す
    if (!checkinId) {
      const { data: again } = await admin
        .from("frunk_checkins").select("id")
        .eq("member_id", memberId).eq("visited_on", today).is("deleted_at", null).maybeSingle();
      checkinId = s((again as Row | null)?.id);
    }
  }

  // 予約を「来店」に上げる（今までスタッフが手で押していた操作）
  if (booking && s(booking.status) === "confirmed") {
    await admin.from("frunk_bookings")
      .update({ status: "visited", updated_at: new Date().toISOString() })
      .eq("id", s(booking.id));
  }

  const greeting = await buildGreeting({ memberId, companyId, today, mem });
  if (s(mem.status) === "suspended") greeting.unshift("⚠ 休会中の会員です");

  const plan = (mem.frunk_plans as { name?: string } | null) ?? null;
  return {
    ok: true,
    checkinId,
    memberId,
    memberNo: s(mem.member_no),
    // 法人の方は「会社名＋お名前」で受付に出す（#206）
    name: memberDisplayName(mem as never) || s(mem.name),
    planName: plan?.name ?? null,
    bayId,
    bayName: (booking?.frunk_bays as { name?: string } | null)?.name ?? (bayId ? await bayName(bayId) : null),
    startTime: booking ? s(booking.start_time).slice(0, 5) : null,
    endTime: booking ? s(booking.end_time).slice(0, 5) : null,
    greeting: greeting.slice(0, 3),
    repeat: Boolean(existing),
  };
}

/** フリー来店で打席が決まっていない会員に、スタッフが打席を割り当てる */
export async function assignBay(checkinId: string, bayId: string): Promise<void> {
  const admin = createAdmin();
  await admin.from("frunk_checkins").update({ bay_id: bayId }).eq("id", checkinId).is("deleted_at", null);
}

async function bayName(bayId: string): Promise<string | null> {
  const admin = createAdmin();
  const { data } = await admin.from("frunk_bays").select("name").eq("id", bayId).maybeSingle();
  return s((data as Row | null)?.name) || null;
}

/**
 * FRANK姫路の会社/店舗を引く。
 * frunk_members.store_id は古い行で null のことがあるので、必ずここを通して補う。
 * （store_id に company_id を入れてしまうと frunk_checkins / frunk_orders が別店舗の行として残る）
 */
export async function frankStore(): Promise<{ companyId: string; storeId: string } | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("stores").select("id, company_id").eq("code", FRANK_STORE_CODE).maybeSingle();
  const r = (data ?? null) as Row | null;
  return r ? { companyId: s(r.company_id), storeId: s(r.id) } : null;
}

/** 受付画面にスタッフ向けで出す1〜3行を組み立てる（材料集めだけ。判断は core の純関数） */
async function buildGreeting(a: { memberId: string; companyId: string; today: string; mem: Row }): Promise<string[]> {
  const admin = createAdmin();

  const { count: pastVisits } = await admin
    .from("frunk_checkins").select("id", { count: "exact", head: true })
    .eq("member_id", a.memberId).lt("visited_on", a.today).is("deleted_at", null);

  const { data: last } = await admin
    .from("frunk_checkins").select("visited_on")
    .eq("member_id", a.memberId).lt("visited_on", a.today).is("deleted_at", null)
    .order("visited_on", { ascending: false }).limit(1).maybeSingle();

  // 今日のレッスン枠（あれば「本日レッスン 14:00〜 安東コーチ」）
  const { data: lesson } = await admin
    .from("frunk_lesson_bookings")
    .select("id, status, frunk_lesson_slots!inner(slot_date, start_time, staff:coach_staff_id(name))")
    .eq("member_id", a.memberId).eq("frunk_lesson_slots.slot_date", a.today)
    .neq("status", "cancelled").is("deleted_at", null).limit(1).maybeSingle();
  const slot = (lesson as Row | null)?.frunk_lesson_slots as
    | { start_time?: string; staff?: { name?: string } | null }
    | undefined;

  // 未収＝退店時会計のまま残っている伝票（当日以前）
  const { data: unpaid } = await admin
    .from("frunk_orders").select("amount")
    .eq("member_id", a.memberId).eq("payment_status", "unpaid")
    .neq("status", "cancelled").is("deleted_at", null);
  const unpaidAmount = ((unpaid ?? []) as Row[]).reduce((t, r) => t + n(r.amount), 0);

  return greetingLines({
    pastVisits: pastVisits ?? 0,
    lastVisitedOn: s((last as Row | null)?.visited_on) || null,
    today: a.today,
    birthDate: s(a.mem.birth_date) || null,
    lessonToday: slot?.start_time
      ? { startTime: s(slot.start_time).slice(0, 5), coach: slot.staff?.name ?? null }
      : null,
    unpaidAmount,
    importantNote: s(a.mem.note) || null,
  });
}

// ---------------------------------------------------------------
// 来店中の状態（会員のスマホが数秒おきに見る）
// ---------------------------------------------------------------
export type VisitState = {
  checkedIn: boolean;
  checkinId: string | null;
  bayId: string | null;
  bayCode: string | null;
  bayName: string | null;
  endTime: string | null;
};

/** 会員が今この瞬間「来店中」かどうか。チェックイン→スマホの自動切替はこれを見て判定する。 */
export async function currentVisit(memberId: string): Promise<VisitState> {
  const admin = createAdmin();
  const today = jstYmd();
  const { data } = await admin
    .from("frunk_checkins")
    .select("id, bay_id, checked_in_at, checked_out_at, frunk_bays(code, name), frunk_bookings(end_time)")
    .eq("member_id", memberId).eq("visited_on", today).is("deleted_at", null).maybeSingle();
  const c = (data ?? null) as Row | null;
  if (!c || s(c.checked_out_at)) {
    return { checkedIn: false, checkinId: null, bayId: null, bayCode: null, bayName: null, endTime: null };
  }
  const bay = (c.frunk_bays as { code?: string; name?: string } | null) ?? null;
  const bk = (c.frunk_bookings as { end_time?: string } | null) ?? null;

  // 来店中を終える判定。DBに書かずに判定だけで閉じるのは、
  // 閉じるためのcronを増やしたくないから（スタッフが伝票から「退店」を押せば checked_out_at が入る）。
  //   予約あり → 終了+30分
  //   予約なし（ビジター・飛び込み） → チェックイン+2時間（#163。これが無いと日付が変わるまで閉じなかった）
  const end = bk?.end_time ? s(bk.end_time).slice(0, 5) : null;
  const closed = visitClosed({
    nowMin: hhmmToMin(nowHHMM()) ?? 0,
    endMin: hhmmToMin(end),
    checkedInMin: hhmmToMin(jstHHMM(s(c.checked_in_at))),
  });
  if (closed) {
    return { checkedIn: false, checkinId: s(c.id), bayId: null, bayCode: null, bayName: null, endTime: end };
  }

  return {
    checkedIn: true,
    checkinId: s(c.id),
    bayId: s(c.bay_id) || null,
    bayCode: bay?.code ?? null,
    bayName: bay?.name ?? null,
    endTime: bk?.end_time ? s(bk.end_time).slice(0, 5) : null,
  };
}

// ---------------------------------------------------------------
// メニューと注文
// ---------------------------------------------------------------
export async function loadMenu(companyId: string): Promise<MenuItem[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_menu_items")
    .select("id, name, category, price_general, price_member, sold_out")
    .eq("company_id", companyId).eq("active", true).is("deleted_at", null)
    .order("sort", { ascending: true });
  return ((data ?? []) as Row[]).map((r) => ({
    id: s(r.id), name: s(r.name), category: s(r.category),
    price_general: n(r.price_general), price_member: n(r.price_member),
    sold_out: Boolean(r.sold_out),
  }));
}

export type PlaceOrderInput = {
  companyId: string;
  storeId: string;
  bayId: string | null;
  /** 会員として注文しているとき。null＝ビジター（打席QRから未ログイン） */
  member: { id: string; memberNo: string; squareCustomerId: string | null } | null;
  checkinId: string | null;
  guestLabel: string | null;
  lines: OrderLineInput[];
  source: "portal" | "bay" | "staff";
};
export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNo: string; total: number; paid: boolean; message: string }
  | { ok: false; message: string };

/**
 * 注文を確定する。
 *
 * 会計の方針（構想 §2）:
 *   会員でカードが保存されていれば **注文した瞬間に課金**（スタッフの操作ゼロ・未収ゼロ）。
 *   カード未保存・決済失敗のときも **注文自体は止めない**。未決済として伝票に出し、退店時にレジで会計する。
 *   お客様の前で失敗させないことを優先している。
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const admin = createAdmin();
  const today = jstYmd();
  const kind: PriceKind = input.member ? "member" : "general";

  // 明細は税抜、請求は税込（#166）。total を Square に渡すこと。
  const { lines, subtotal, tax, taxRate, total } = buildOrderLines(input.lines, kind);
  if (lines.length === 0) return { ok: false, message: "商品が選ばれていません" };

  // 当日連番（衝突したら採り直す）
  let orderId = "";
  let no = "";
  for (let i = 0; i < 6; i++) {
    const { count } = await admin
      .from("frunk_orders").select("id", { count: "exact", head: true })
      .eq("company_id", input.companyId).eq("ordered_on", today).is("deleted_at", null);
    no = fmtOrderNo(today, (count ?? 0) + 1 + i);
    const { data, error } = await admin.from("frunk_orders").insert({
      company_id: input.companyId,
      store_id: input.storeId,
      order_no: no,
      bay_id: input.bayId,
      member_id: input.member?.id ?? null,
      checkin_id: input.checkinId,
      guest_label: input.guestLabel,
      ordered_on: today,
      subtotal,
      tax_rate: taxRate,
      tax_amount: tax,
      amount: total,
      source: input.source,
    }).select("id").maybeSingle();
    if (!error && data) { orderId = s((data as Row).id); break; }
  }
  if (!orderId) return { ok: false, message: "注文の登録に失敗しました。スタッフにお声がけください" };

  await admin.from("frunk_order_items").insert(
    lines.map((l) => ({ order_id: orderId, menu_item_id: l.menu_item_id, name: l.name, price_kind: l.price_kind, unit_price: l.unit_price, qty: l.qty, amount: l.amount })),
  );

  // 会員＋保存カードがあれば即時決済
  if (input.member?.squareCustomerId) {
    const r = await chargeOrderOnFile({
      customerId: input.member.squareCustomerId,
      amountTaxIncluded: total,
      note: orderNote(no),
      idempotencyKey: orderId, // 二重課金よけ（同じ注文は何度呼んでも1回）
    });
    if (r.ok) {
      await admin.from("frunk_orders")
        .update({ payment_status: "paid", square_payment_id: r.paymentId ?? null })
        .eq("id", orderId);
      return { ok: true, orderId, orderNo: no, total, paid: true, message: `ご注文を承りました（¥${total.toLocaleString("ja-JP")} 決済済み）` };
    }
    await admin.from("frunk_orders").update({ payment_status: "failed", payment_error: r.error ?? null }).eq("id", orderId);
    return { ok: true, orderId, orderNo: no, total, paid: false, message: "ご注文を承りました。お会計は退店時にお願いします" };
  }

  return { ok: true, orderId, orderNo: no, total, paid: false, message: "ご注文を承りました。お会計は退店時にお願いします" };
}

/** 打席コードから打席を引く（打席QRの入口） */
export async function bayByCode(code: string): Promise<{ id: string; code: string; name: string; companyId: string } | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_bays").select("id, code, name, company_id")
    .eq("code", code).eq("active", true).is("deleted_at", null).maybeSingle();
  const b = (data ?? null) as Row | null;
  return b ? { id: s(b.id), code: s(b.code), name: s(b.name), companyId: s(b.company_id) } : null;
}

/** スタッフが伝票から「退店」を押したとき（来店中モードを閉じ、滞在時間を確定する） */
export async function checkOut(checkinId: string): Promise<void> {
  const admin = createAdmin();
  await admin.from("frunk_checkins")
    .update({ checked_out_at: new Date().toISOString() })
    .eq("id", checkinId).is("checked_out_at", null).is("deleted_at", null);
}

// ---------------------------------------------------------------
// レッスンカルテ（Lesson OS）
// ---------------------------------------------------------------
const LESSON_OS_URL = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";

/** 会員番号 → Lesson OS の共有ページURL（無ければ null） */
export async function karteShareUrl(companyId: string, memberNo: string): Promise<string | null> {
  const admin = createAdmin();
  const { data: student } = await admin
    .from("lsn_students").select("id")
    .eq("company_id", companyId).eq("member_code", memberNo)
    .is("deleted_at", null).limit(1).maybeSingle();
  if (!student) return null;
  const { data: tok } = await admin
    .from("lsn_share_tokens").select("token")
    .eq("student_id", s((student as Row).id)).is("revoked_at", null).limit(1).maybeSingle();
  const t = s((tok as Row | null)?.token);
  return t ? `${LESSON_OS_URL}/s/${t}` : null;
}

/**
 * カルテに新着があるか（#155）。
 *
 * Lesson OS が稼働しなかった一番の理由は「書いても生徒に届かない」こと。
 * 動画かコメントが karte_seen_at より後に増えていれば、ポータルのホームで知らせる。
 * 会員が開いた時点で karte_seen_at を進める（/member/karte）。
 */
export async function karteHasNew(companyId: string, memberNo: string, seenAt: string | null): Promise<boolean> {
  const admin = createAdmin();
  const { data: student } = await admin
    .from("lsn_students").select("id")
    .eq("company_id", companyId).eq("member_code", memberNo)
    .is("deleted_at", null).limit(1).maybeSingle();
  if (!student) return false;
  const studentId = s((student as Row).id);

  const { data: vids } = await admin
    .from("lsn_videos").select("id, created_at")
    .eq("student_id", studentId).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(50);
  const videos = (vids ?? []) as Row[];
  if (videos.length === 0) return false;

  // 一度も開いていない人は、動画が1本でもあれば新着扱い（最初の1回を必ず届ける）
  if (!seenAt) return true;
  const seen = new Date(seenAt).getTime();
  if (videos.some((v) => new Date(s(v.created_at)).getTime() > seen)) return true;

  const { data: cmts } = await admin
    .from("lsn_comments").select("created_at")
    .in("video_id", videos.map((v) => s(v.id)))
    .is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(1);
  const latest = s(((cmts ?? []) as Row[])[0]?.created_at);
  return latest ? new Date(latest).getTime() > seen : false;
}
