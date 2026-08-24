"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";
import { FRANK_STORE_ID, toMin, toTime } from "@/lib/frank-reservation";
import { requireStoreAccess } from "@/lib/store-scope";
import { loadBookingCfg, businessHours } from "@yozan/core/frank-booking";
import { syncTrialWalkin, removeTrialWalkin } from "@yozan/core/frank-walkin";
import { sendFrankMail, buildBookingRescheduleMail } from "@/lib/frank-mail";

/**
 * FRANK GOLF 予約管理（スタッフ操作）— 台帳は frunk_bookings 一本（#93 / 0084）
 *
 * 旧 res_bookings は廃止した。お客様の予約は frankgolf.jp のサイトで完結し、
 * ここはスタッフが「電話・店頭で受けた予約の登録」「来店確認」「入金」を行う画面。
 */

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: FormDataEntryValue | null): number | null {
  const s = str(v).replace(/[^\d-]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function back(date: string) {
  revalidatePath("/reservations");
  if (date) revalidatePath(`/reservations?date=${date}`);
  revalidatePath("/trials");
  revalidatePath("/dashboard");
  revalidatePath("/"); // 受付台帳（体験は予約と同時に台帳へ載る）
}

/** 電話・店頭で受けた予約を作る（会員 / 都度利用） */
export async function createBooking(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // FRANK姫路の予約はFRANKに配属された人だけ（#134）
  const admin = createAdmin();

  const date = str(formData.get("booking_date"));
  const start = str(formData.get("start_time"));
  const bayId = str(formData.get("bay_id"));
  const kind = str(formData.get("customer_kind")) || "dropin";
  const minutes = num(formData.get("minutes")) ?? 60;
  const memberNo = str(formData.get("member_no"));
  const guestName = str(formData.get("guest_name"));

  if (!date || !start || !bayId) return;

  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(date, cfg);
  if (!hours) return back(date);

  const s = toMin(start);
  const e = s + minutes;
  if (s < toMin(hours.open) || e > toMin(hours.close)) return back(date);

  // 会員指定なら会員を引く（見つからなければ名前だけの都度予約として登録）
  let memberId: string | null = null;
  if (kind === "member" && memberNo) {
    const { data: m } = await admin
      .from("frunk_members")
      .select("id")
      .eq("company_id", actor.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .eq("member_no", memberNo)
      .is("deleted_at", null)
      .maybeSingle();
    memberId = m?.id ? String(m.id) : null;
  }
  if (!memberId && !guestName) return back(date); // 持ち主が分からない予約は作らない

  // 区間の重なりを確認（DBのunique indexは開始時刻だけを見るため）
  const { data: same } = await admin
    .from("frunk_bookings")
    .select("start_time, end_time")
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .eq("bay_id", bayId)
    .eq("booked_date", date)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  for (const b of same ?? []) {
    if (s < toMin(String(b.end_time)) && e > toMin(String(b.start_time))) return back(date);
  }

  const { error } = await admin.from("frunk_bookings").insert({
    company_id: actor.companyId,
    store_id: FRANK_STORE_ID,
    member_id: memberId,
    customer_kind: memberId ? "member" : "dropin",
    guest_name: memberId ? null : guestName,
    guest_phone: str(formData.get("guest_phone")) || null,
    party_size: num(formData.get("party_size")) ?? 1,
    bay_id: bayId,
    booked_date: date,
    start_time: start,
    end_time: toTime(e),
    status: "confirmed",
    source: "staff",
    amount: num(formData.get("amount")),
    note: str(formData.get("note")) || null,
  });
  if (!error) await logAudit(actor, "frank.booking.create", "frunk_bookings", null, null, { date, start, bayId });
  back(date);
}

/**
 * 予約の内容を変更する（日時・打席・人数・氏名・電話・備考）— #151
 *
 * これまで member-os には **予約を直す手段が一切なかった**（作る・状態を変える・消すだけ）。
 * 日時を間違えた／お客様から変更の電話が来た、というときは「消してもう一度作る」しかなく、
 * 体験予約だと申込・受付台帳まで道連れに消えていた。ここで1本にまとめる。
 *
 * 気をつけている点:
 *  - 重なりチェックは **自分自身を除いて** やる（除かないと必ず自分と衝突して保存できない）
 *  - レッスン枠（frunk_lesson_slots）とも重なりを見る。作成時は見ていなかったが、
 *    移動先がレッスン枠と被ると打席がダブルブッキングになる
 *  - 体験予約は 申込(mbr_trial_requests) と 受付台帳(mbr_walkin_visits) の3点を必ず揃える。
 *    片方だけ直すと「予約は9/8なのに台帳は9/5」のような食い違いが残る
 *  - お客様へのメールは **チェックしたときだけ**。電話で合意した直後に自動で飛ぶと二度手間になる
 */
export async function updateBooking(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const admin = createAdmin();

  const id = str(formData.get("id"));
  const fromDate = str(formData.get("date")); // 変更前の表示日（画面を戻すため）
  if (!id) return;

  const { data: bkRow } = await admin
    .from("frunk_bookings")
    .select(
      "id, booked_date, start_time, end_time, bay_id, party_size, guest_name, guest_phone, note, status, trial_request_id, member_id"
    )
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bkRow) return back(fromDate);
  const bk = bkRow as {
    id: string;
    booked_date: string;
    start_time: string;
    end_time: string;
    bay_id: string | null;
    party_size: number | null;
    guest_name: string | null;
    guest_phone: string | null;
    note: string | null;
    status: string;
    trial_request_id: string | null;
    member_id: string | null;
  };

  // 未入力の欄は「変えない」。全部を必須にすると、名前だけ直したいときに日時まで入力させることになる
  const date = str(formData.get("booking_date")) || bk.booked_date;
  const start = str(formData.get("start_time")) || bk.start_time.slice(0, 5);
  const bayId = str(formData.get("bay_id")) || bk.bay_id || "";
  const minutes = num(formData.get("minutes")) ?? Math.max(15, toMin(bk.end_time) - toMin(bk.start_time));
  if (!date || !start || !bayId) return back(fromDate);

  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(date, cfg);
  if (!hours) return back(fromDate); // 定休日・営業時間外の日には動かせない

  const s = toMin(start);
  const e = s + minutes;
  if (s < toMin(hours.open) || e > toMin(hours.close)) return back(fromDate);

  // ── 重なり確認（自分は除く）
  const { data: sameBay } = await admin
    .from("frunk_bookings")
    .select("id, start_time, end_time")
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .eq("bay_id", bayId)
    .eq("booked_date", date)
    .neq("status", "cancelled")
    .neq("id", id)
    .is("deleted_at", null);
  for (const b of sameBay ?? []) {
    if (s < toMin(String(b.end_time)) && e > toMin(String(b.start_time))) return back(fromDate);
  }

  // ── レッスン枠とも重なりを見る（打席は共有なので）
  const { data: lessons } = await admin
    .from("frunk_lesson_slots")
    .select("start_time, end_time")
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .eq("bay_id", bayId)
    .eq("slot_date", date)
    .neq("status", "closed")
    .is("deleted_at", null);
  for (const l of lessons ?? []) {
    if (s < toMin(String(l.end_time)) && e > toMin(String(l.start_time))) return back(fromDate);
  }

  const endTime = toTime(e);
  const patch: Record<string, unknown> = {
    booked_date: date,
    start_time: start,
    end_time: endTime,
    bay_id: bayId,
    updated_at: new Date().toISOString(),
  };
  // 会員予約の氏名・電話は会員マスタが正なので、都度予約のときだけ上書きする
  if (!bk.member_id) {
    const gn = str(formData.get("guest_name"));
    const gp = str(formData.get("guest_phone"));
    if (formData.has("guest_name") && gn) patch.guest_name = gn;
    if (formData.has("guest_phone")) patch.guest_phone = gp || null;
  }
  if (formData.has("party_size")) patch.party_size = num(formData.get("party_size")) ?? 1;
  if (formData.has("note")) patch.note = str(formData.get("note")) || null;

  const { error } = await admin.from("frunk_bookings").update(patch).eq("id", id);
  if (error) return back(fromDate);

  // ── 体験予約は申込・受付台帳まで揃える
  if (bk.trial_request_id) {
    await admin
      .from("mbr_trial_requests")
      .update({
        booked_date: date,
        start_time: start,
        end_time: endTime,
        bay_id: bayId,
        // /trials の一覧は今も pref1 を表示している。ここを直さないと一覧が嘘をつく
        pref1: `${date} ${start}`,
        reviewed_by: actor.staffId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bk.trial_request_id);
    await syncTrialWalkin(admin, String(bk.trial_request_id), { receptionStaffId: actor.staffId });
  }

  // ── お客様へのお知らせ（チェックしたときだけ）
  if (str(formData.get("notify")) === "1") {
    const bayName = await bayLabel(admin, bayId);
    const beforeBay = bk.bay_id ? await bayLabel(admin, bk.bay_id) : "";
    const to = await bookingEmail(admin, bk.trial_request_id, bk.member_id);
    const name = bk.guest_name ?? (await bookingName(admin, bk.trial_request_id, bk.member_id)) ?? "お客様";
    if (to) {
      const { data: tr } = bk.trial_request_id
        ? await admin.from("mbr_trial_requests").select("cancel_token").eq("id", bk.trial_request_id).maybeSingle()
        : { data: null };
      const mail = buildBookingRescheduleMail({
        name,
        before: `${bk.booked_date} ${bk.start_time.slice(0, 5)}〜${bk.end_time.slice(0, 5)}${beforeBay ? ` ${beforeBay}` : ""}`,
        after: `${date} ${start}〜${endTime.slice(0, 5)}${bayName ? ` ${bayName}` : ""}`,
        cancelToken: (tr as { cancel_token?: string | null } | null)?.cancel_token ?? null,
        kind: bk.trial_request_id ? "trial" : "booking",
      });
      await sendFrankMail({ to, subject: mail.subject, text: mail.text });
    }
  }

  await logAudit(
    actor,
    "frank.booking.update",
    "frunk_bookings",
    id,
    { booked_date: bk.booked_date, start_time: bk.start_time, end_time: bk.end_time, bay_id: bk.bay_id },
    { booked_date: date, start_time: start, end_time: endTime, bay_id: bayId }
  );

  // 変更前の日と変更後の日、どちらのカレンダーも作り直す
  back(bk.booked_date);
  back(date);
}

async function bayLabel(admin: ReturnType<typeof createAdmin>, bayId: string): Promise<string> {
  const { data } = await admin.from("frunk_bays").select("name").eq("id", bayId).maybeSingle();
  return String((data as { name?: string } | null)?.name ?? "");
}

/** 変更のお知らせを送る先。体験は申込のメール、会員は会員マスタのメール */
async function bookingEmail(
  admin: ReturnType<typeof createAdmin>,
  trialId: string | null,
  memberId: string | null
): Promise<string | null> {
  if (trialId) {
    const { data } = await admin.from("mbr_trial_requests").select("email").eq("id", trialId).maybeSingle();
    const em = String((data as { email?: string | null } | null)?.email ?? "");
    if (em) return em;
  }
  if (memberId) {
    const { data } = await admin.from("frunk_members").select("email").eq("id", memberId).maybeSingle();
    const em = String((data as { email?: string | null } | null)?.email ?? "");
    if (em) return em;
  }
  return null;
}

async function bookingName(
  admin: ReturnType<typeof createAdmin>,
  trialId: string | null,
  memberId: string | null
): Promise<string | null> {
  if (trialId) {
    const { data } = await admin.from("mbr_trial_requests").select("name").eq("id", trialId).maybeSingle();
    const n = String((data as { name?: string | null } | null)?.name ?? "");
    if (n) return n;
  }
  if (memberId) {
    const { data } = await admin.from("frunk_members").select("name").eq("id", memberId).maybeSingle();
    const n = String((data as { name?: string | null } | null)?.name ?? "");
    if (n) return n;
  }
  return null;
}

/** 来店 / 無断欠 / 取消 */
export async function setBookingStatus(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  const date = str(formData.get("date"));
  if (!id || !["confirmed", "visited", "no_show", "cancelled"].includes(status)) return;

  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, trial_request_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .maybeSingle();
  if (!bk) return;

  await admin.from("frunk_bookings").update({ status, updated_at: new Date().toISOString() }).eq("id", id);

  // 体験は申込側のステータスも合わせる（2画面で食い違わないように）
  if (bk.trial_request_id) {
    const trialStatus = status === "cancelled" ? "canceled" : status === "visited" ? "done" : "confirmed";
    await admin
      .from("mbr_trial_requests")
      .update({ status: trialStatus, reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
      .eq("id", bk.trial_request_id);
    // 受付台帳も追随（キャンセルは台帳から下げる・戻したら復活させる）
    await syncTrialWalkin(admin, String(bk.trial_request_id), { receptionStaffId: actor.staffId });
  }

  await logAudit(actor, "frank.booking.status", "frunk_bookings", id, null, { status });
  back(date);
}

/** 予約を消す（誤入力の取り消し） */
export async function deleteBooking(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const date = str(formData.get("date"));
  if (!id) return;

  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, trial_request_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .maybeSingle();
  if (!bk) return;

  const now = new Date().toISOString();
  await admin.from("frunk_bookings").update({ deleted_at: now }).eq("id", id);
  if (bk.trial_request_id) {
    await admin.from("mbr_trial_requests").update({ deleted_at: now }).eq("id", bk.trial_request_id);
    await removeTrialWalkin(admin, String(bk.trial_request_id)); // 受付台帳からも下げる
  }
  await logAudit(actor, "frank.booking.delete", "frunk_bookings", id, null, null);
  back(date);
}

/** 入金の記録（記録 / 全額入金 / 免除） */
export async function recordPayment(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const mode = str(formData.get("mode"));
  const date = str(formData.get("date"));
  if (!id) return;

  const amount = num(formData.get("amount"));
  const method = str(formData.get("payment_method")) || null;
  const now = new Date().toISOString();

  let patch: Record<string, unknown>;
  if (mode === "waive") {
    patch = { payment_status: "waived", payment_method: method, paid_at: now };
  } else if (mode === "full") {
    patch = { amount, paid_amount: amount ?? 0, payment_status: "paid", payment_method: method, paid_at: now };
  } else {
    const paid = num(formData.get("paid_amount")) ?? 0;
    const status = amount == null ? "unpaid" : paid <= 0 ? "unpaid" : paid >= amount ? "paid" : "partial";
    patch = { amount, paid_amount: paid, payment_status: status, payment_method: method, paid_at: paid > 0 ? now : null };
  }

  await admin.from("frunk_bookings").update({ ...patch, updated_at: now })
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID);
  await logAudit(actor, "frank.booking.payment", "frunk_bookings", id, null, patch);
  back(date);
}

/* 店頭カレンダーのトークンURL発行は廃止した。
 * 店頭では店舗アカウントでログインして `/board` を開く（ログイン必須）。
 * お客様Web予約のトークンURLも廃止済み（#93・予約はサイトに集約）。 */
