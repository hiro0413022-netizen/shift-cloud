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
