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
import { readName } from "@/lib/name";
import { birthDateError } from "@yozan/core/birth-date";
import { jstYmd } from "@/lib/jst";

/** Genesis（frankgolf.jp の裏側）。体験予約の規則はあちらが正典なので、ここでは作り直さない */
const GENESIS_URL = process.env.GENESIS_URL || "https://yozan-genesis.vercel.app";

/** 画面に返す結果（#192）。以前は失敗しても黙って戻るだけで、
 *  「登録を押したのに増えない」がスタッフ側から見て原因不明だった */
export type BookingFormState = { ok?: boolean; error?: string; message?: string };

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

/**
 * 電話・店頭で受けた予約を作る（会員 / 都度利用）
 *
 * #192: カレンダーの空きマスをタップして開く入力パネルから呼ばれる。
 *  - 結果を必ず文字で返す（黙って何も起きない、を無くす）
 *  - レッスン枠との重なりも見る（作成時は見ておらず、打席がダブルブッキングになり得た）
 */
export async function createBooking(_prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // FRANK姫路の予約はFRANKに配属された人だけ（#134）
  const admin = createAdmin();

  const date = str(formData.get("booking_date"));
  const start = str(formData.get("start_time"));
  const bayId = str(formData.get("bay_id"));
  const minutes = num(formData.get("minutes")) ?? 60;
  // #189: 会員はお名前でも探せるようにしたので、画面からは会員IDが来る。
  // 会員番号だけを受ける旧フォーム（ブックマーク・外部からのPOST）も壊さない。
  const pickedId = str(formData.get("member_id"));
  const memberNo = str(formData.get("member_no"));
  const guestName = str(formData.get("guest_name"));

  if (!date || !start || !bayId) return { error: "日付・開始時刻・打席をご確認ください" };

  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(date, cfg);
  if (!hours) return { error: "この日は定休日です" };

  const s = toMin(start);
  const e = s + minutes;
  if (s < toMin(hours.open) || e > toMin(hours.close)) {
    return { error: `営業時間（${hours.open}〜${hours.close}）に収まりません` };
  }

  // 会員指定なら会員を引く（見つからなければ名前だけの都度予約として登録）。
  // 画面から来たIDでも、必ず会社・店舗で引き直す＝クライアントの値をそのまま信じない（#134）
  let memberId: string | null = null;
  if (pickedId || memberNo) {
    const q = admin
      .from("frunk_members")
      .select("id")
      .eq("company_id", actor.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .is("deleted_at", null);
    const { data: m } = await (pickedId ? q.eq("id", pickedId) : q.eq("member_no", memberNo)).maybeSingle();
    memberId = m?.id ? String(m.id) : null;
  }
  if (!memberId && !guestName) return { error: "会員を選ぶか、お名前をご入力ください" };

  // 区間の重なりを確認（DBのunique indexは開始時刻だけを見るため）。レッスン枠も同じ打席を使う。
  const [{ data: same }, { data: lessons }] = await Promise.all([
    admin
      .from("frunk_bookings")
      .select("start_time, end_time")
      .eq("company_id", actor.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .eq("bay_id", bayId)
      .eq("booked_date", date)
      .neq("status", "cancelled")
      .is("deleted_at", null),
    admin
      .from("frunk_lesson_slots")
      .select("start_time, end_time")
      .eq("company_id", actor.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .eq("bay_id", bayId)
      .eq("slot_date", date)
      .eq("status", "open")
      .is("deleted_at", null),
  ]);
  for (const b of [...(same ?? []), ...(lessons ?? [])]) {
    if (s < toMin(String(b.end_time)) && e > toMin(String(b.start_time))) {
      return { error: "その打席・その時間はすでにふさがっています" };
    }
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
  if (error) return { error: `登録できませんでした: ${error.message}` };
  await logAudit(actor, "frank.booking.create", "frunk_bookings", null, null, { date, start, bayId });
  back(date);
  return { ok: true, message: `${start.slice(0, 5)} の予約を登録しました` };
}

/**
 * 電話・店頭で受けた「体験」を、カレンダーのマスから直接確定する（#192）
 *
 * ★ 規則を member-os 側で作り直さない
 *   体験は「毎時00分・60分押さえ・打席はA→B→Cの優先順で自動割当・レフティは左右打席のみ・
 *   生年月日必須・受付台帳へ自動連携・確定メール」という決まりがあり、その正典は
 *   Genesis の /api/public/frank/trial（apps/genesis/src/lib/frank-trial.ts）。
 *   ここで同じ処理を書くと、規則が変わったときに片方だけ古くなる。
 *   だからスタッフ画面からも同じAPIを呼ぶ（member-os → Genesis はサーバー間の通信）。
 *
 * ★ これまでは、電話で体験を受けたスタッフは公式サイトの体験予約ページを自分で開いて
 *   お客様のふりをして入力するしかなかった（2026-09-01 ユーザー指摘）。
 */
export async function createTrialByStaff(_prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const { name, nameKana } = readName(formData);
  if (!name) return { error: "お名前（姓・名）をご入力ください" };

  const phone = str(formData.get("guest_phone"));
  const email = str(formData.get("email"));
  if (!phone && !email) return { error: "お電話番号かメールアドレスのどちらかをご入力ください" };

  const birthDate = str(formData.get("birth_date"));
  const birthErr = birthDateError(birthDate, jstYmd());
  if (birthErr) return { error: birthErr };

  if (str(formData.get("consent_privacy")) !== "1") {
    return { error: "個人情報の取扱いについてお客様の同意（口頭で可）を確認し、チェックを入れてください" };
  }

  const date = str(formData.get("booking_date"));
  const start = str(formData.get("start_time")).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) {
    return { error: "日付・開始時刻をご確認ください" };
  }

  let res: Response;
  try {
    res = await fetch(`${GENESIS_URL}/api/public/frank/trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action: "book",
        name,
        name_kana: nameKana ?? undefined,
        birth_date: birthDate,
        phone: phone || undefined,
        email: email || undefined,
        date,
        start,
        lefty: str(formData.get("lefty")) === "1",
        experience: str(formData.get("experience")) || undefined,
        message: str(formData.get("message")) || undefined,
        consent: true,
        src: "staff", // 流入元は「Web体験予約（staff）」として台帳に残る＝Web申込と区別できる
      }),
    });
  } catch {
    return { error: "体験予約システムに接続できませんでした。時間をおいて、もう一度お試しください" };
  }

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; bayName?: string; end?: string };
  if (!res.ok || !body.ok) return { error: body.error || "体験のご予約を登録できませんでした" };

  await logAudit(actor, "frank.trial.create_by_staff", "mbr_trial_requests", null, null, { date, start, name });
  back(date);
  return {
    ok: true,
    message: `${date} ${start}〜${(body.end ?? "").slice(0, 5)} ${body.bayName ?? ""} で体験を確定しました`,
  };
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

/**
 * 打席予約に付いた「パーソナルレッスン25分」の希望を確定する（0136 / 2026-09-01）
 *
 * お客様側では担当プロも時間も選ばせない（当日のシフト次第のため）。
 * ここで「誰が・打席時間内の何時から」を入れて確定＝requested → confirmed にする。
 * お受けできないときは declined にして、お客様には店舗からご連絡する。
 */
export async function setLessonOption(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID);
  const admin = createAdmin();

  const id = str(formData.get("id"));
  const date = str(formData.get("date"));
  const mode = str(formData.get("mode")); // confirm | decline | clear
  if (!id || !mode) return;

  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, start_time, end_time, lesson_option_minutes")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bk) return;

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;

  if (mode === "decline") {
    patch = { lesson_option_status: "declined", lesson_option_staff_id: null, lesson_option_start: null };
  } else if (mode === "clear") {
    patch = { lesson_option_status: null, lesson_option_staff_id: null, lesson_option_start: null };
  } else {
    const staffId = str(formData.get("staff_id"));
    const start = str(formData.get("lesson_start"));
    const minutes = num(formData.get("lesson_minutes")) ?? bk.lesson_option_minutes ?? 25;
    if (!staffId || !/^\d{2}:\d{2}$/.test(start)) return back(date); // 担当と開始時刻がそろうまで確定しない
    // レッスンは打席のお時間の中で行う（はみ出す指定は受け付けない）
    const s = toMin(start);
    if (s < toMin(String(bk.start_time)) || s + minutes > toMin(String(bk.end_time))) return back(date);
    patch = {
      lesson_option_status: "confirmed",
      lesson_option_staff_id: staffId,
      lesson_option_start: `${toTime(s)}:00`,
      lesson_option_minutes: minutes,
    };
  }

  await admin
    .from("frunk_bookings")
    .update({ ...patch, updated_at: now })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID);
  await logAudit(actor, "frank.booking.lesson_option", "frunk_bookings", id, null, patch);
  back(date);
}

/* 店頭カレンダーのトークンURL発行は廃止した。
 * 店頭では店舗アカウントでログインして `/board` を開く（ログイン必須）。
 * お客様Web予約のトークンURLも廃止済み（#93・予約はサイトに集約）。 */
