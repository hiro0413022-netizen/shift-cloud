/**
 * FRANK GOLF 体験予約 → 受付台帳（一時利用者名簿）への反映
 *
 * ★ なぜ必要か（2026-08-18・ユーザー指摘）
 *   体験予約は frankgolf.jp のセルフ予約で mbr_trial_requests ＋ frunk_bookings に入るが、
 *   受付台帳（mbr_walkin_visits）には1行も入っていなかった。
 *   その結果「体験予約は入っているのに受付台帳が空」「体験数KPIが0のまま」になっていた。
 *   （体験数の正典は mbr_walkin_visits.visit_type='trial' ＝ trial-count-source）
 *
 * ★ 反映のタイミング（ユーザー決定 2026-08-18）
 *   「予約が入った瞬間に台帳へ書く」。来店を待たない。
 *   ただしキャンセルされた予約は台帳から自動で下げる（deleted_at）。
 *   残したままだと体験数・体験→入会率が実態より多く出てしまうため。
 *
 * ★ 冪等キー
 *   mbr_walkin_visits.source_reservation_no（0070で追加・company_id との複合ユニーク）に
 *   `FRANK-TRIAL-<mbr_trial_requests.id>` を入れる。何度呼んでも行は増えない。
 *
 * ★ スタッフの追記は絶対に上書きしない
 *   料金・成約・アンケート・メモは受付台帳側でスタッフが書く。再同期では日付と客情報の
 *   紐付けだけを直し、それ以外の列には触らない。
 */

/** Supabase admin クライアント。SupabaseClient の型は巨大で構造照合すると TS2589 で落ちるため、
 *  受け取るときは検査せず、使う直前に必要な形へキャストする（frank-booking.ts と同じ方針）。 */
type SupabaseAdminLike = object;

type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;

type Row = Record<string, unknown>;

type Chain = {
  eq(col: string, val: unknown): Chain;
  neq(col: string, val: unknown): Chain;
  is(col: string, val: null): Chain;
  order(col: string, opts?: { ascending?: boolean }): Chain;
  limit(n: number): Chain;
  maybeSingle(): Res<Row | null>;
} & Res<Row[]>;

type Inserted = { select(cols: string): { maybeSingle(): Res<Row | null> } };

type Table = {
  select(cols: string): Chain;
  insert(row: Row): Inserted & Res<null>;
  update(patch: Row): Chain;
};

type Db = {
  from(table: string): Table;
  /** 名寄せはDB関数で行う（#190。アプリ側で数百件だけ読むと既存客が新規として増える） */
  rpc(fn: string, args: Row): Res<unknown>;
};

export const TRIAL_LEDGER_PREFIX = "FRANK-TRIAL-";

/** 受付台帳の冪等キー */
export function trialReservationNo(trialRequestId: string): string {
  return `${TRIAL_LEDGER_PREFIX}${trialRequestId}`;
}

const hhmm = (t: unknown): string => String(t ?? "").slice(0, 5);

/** source（web-self / web-self:<広告タグ>）→ 受付台帳の流入元 */
export function ledgerReferral(source: unknown): { referral_source: string; referral_source_other: string | null } {
  const s = String(source ?? "");
  const tag = s.startsWith("web-self:") ? s.slice("web-self:".length) : "";
  return {
    referral_source: "ホームページ",
    referral_source_other: tag ? `Web体験予約（${tag}）` : "Web体験予約",
  };
}

/** 台帳の備考。予約内容が一目で分かる1行にする（スタッフの追記は別列） */
export function ledgerNote(r: {
  start_time?: unknown;
  end_time?: unknown;
  lefty?: unknown;
  experience?: unknown;
  message?: unknown;
}): string {
  const time = r.start_time ? `${hhmm(r.start_time)}〜${hhmm(r.end_time)}` : "";
  return [
    ["体験予約", time].filter(Boolean).join(" "),
    r.lefty ? "レフティ" : "",
    r.experience ? `ゴルフ歴: ${String(r.experience)}` : "",
    r.message ? `ご要望: ${String(r.message)}` : "",
  ]
    .filter(Boolean)
    .join("／");
}

export type TrialLedgerResult =
  | { ok: true; action: "created" | "updated" | "removed" | "skipped"; visitId: string | null }
  | { ok: false; error: string };

/**
 * 体験申込1件を受付台帳に反映する（作成・更新・キャンセル時の取り下げを兼ねる）。
 * 予約の保存が成功した後に呼ぶ。ここで失敗しても予約そのものは成立させること
 * （台帳が書けなかったせいでお客様の予約が消える方が事故が大きい）。
 */
export async function syncTrialWalkin(
  adminLike: SupabaseAdminLike,
  trialRequestId: string,
  opts: { receptionStaffId?: string | null } = {},
): Promise<TrialLedgerResult> {
  const admin = adminLike as Db;
  if (!trialRequestId) return { ok: false, error: "trialRequestId が空です" };

  const reqRes = await admin
    .from("mbr_trial_requests")
    .select(
      "id, company_id, store_id, name, name_kana, birth_date, phone, email, booked_date, start_time, end_time, status, source, lefty, experience, message, deleted_at",
    )
    .eq("id", trialRequestId)
    .maybeSingle();
  const req = reqRes.data;
  if (!req) return { ok: false, error: "体験申込が見つかりません" };

  const companyId = String(req.company_id ?? "");
  const storeId = req.store_id == null ? null : String(req.store_id);
  const resNo = trialReservationNo(trialRequestId);

  // いまの台帳行（生きているもの）
  const existingRes = await admin
    .from("mbr_walkin_visits")
    .select("id, guest_id, visited_on, note")
    .eq("company_id", companyId)
    .eq("source_reservation_no", resNo)
    .is("deleted_at", null)
    .maybeSingle();
  const existing = existingRes.data;

  // キャンセル・削除済みは台帳から下げる（体験数が実態より多く出るのを防ぐ）
  const cancelled = String(req.status ?? "") === "canceled" || req.deleted_at != null;
  if (cancelled) {
    if (!existing) return { ok: true, action: "skipped", visitId: null };
    const del = await admin
      .from("mbr_walkin_visits")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(existing.id));
    if (del.error) return { ok: false, error: del.error.message };
    return { ok: true, action: "removed", visitId: String(existing.id) };
  }

  const visitedOn = req.booked_date == null ? null : String(req.booked_date);
  if (!visitedOn) return { ok: false, error: "予約日が未設定のため台帳に載せられません" };

  // すでに行があるなら、日付のズレを直す（料金・成約には触らない）。
  // メモは **自動生成のまま（「体験予約 …」で始まる）ときだけ** 作り直す。
  // 日時を変更したのに台帳のメモが古い時刻のまま残る、を防ぐ（#151）。
  // スタッフが書き換えたメモは尊重して触らない。
  if (existing) {
    const patch: Row = {};
    if (String(existing.visited_on ?? "") !== visitedOn) patch.visited_on = visitedOn;
    const curNote = String(existing.note ?? "");
    const nextNote = ledgerNote(req);
    if (curNote.startsWith("体験予約") && curNote !== nextNote) patch.note = nextNote;
    if (existing.guest_id == null) {
      const gid = await resolveGuestId(admin, companyId, storeId, req);
      if (gid) patch.guest_id = gid;
    }
    if (Object.keys(patch).length === 0) return { ok: true, action: "skipped", visitId: String(existing.id) };
    patch.updated_at = new Date().toISOString();
    const upd = await admin.from("mbr_walkin_visits").update(patch).eq("id", String(existing.id));
    if (upd.error) return { ok: false, error: upd.error.message };
    return { ok: true, action: "updated", visitId: String(existing.id) };
  }

  const guestId = await resolveGuestId(admin, companyId, storeId, req);
  const ref = ledgerReferral(req.source);

  const ins = await admin
    .from("mbr_walkin_visits")
    .insert({
      company_id: companyId,
      store_id: storeId,
      guest_id: guestId,
      visited_on: visitedOn,
      visit_type: "trial",
      // 体験は無料55分。金額はスタッフが変えられるが、既定は0円で入れておく
      fee: 0,
      payment_method: "free_campaign",
      result: "none",
      referral_source: ref.referral_source,
      referral_source_other: ref.referral_source_other,
      note: ledgerNote(req),
      reception_staff_id: opts.receptionStaffId ?? null,
      source_reservation_no: resNo,
    })
    .select("id")
    .maybeSingle();
  if (ins.error) {
    // 並行して同じ申込を同期した場合（ユニーク違反）は成功扱い。台帳は1行あればよい
    if (/duplicate key|uq_mbr_walkin_visits_reservation_no/i.test(ins.error.message)) {
      return { ok: true, action: "skipped", visitId: null };
    }
    return { ok: false, error: ins.error.message };
  }
  return { ok: true, action: "created", visitId: ins.data?.id ? String(ins.data.id) : null };
}

/** 体験申込を台帳から下げる（お客様キャンセル・スタッフ削除） */
export async function removeTrialWalkin(
  adminLike: SupabaseAdminLike,
  trialRequestId: string,
): Promise<TrialLedgerResult> {
  const admin = adminLike as Db;
  if (!trialRequestId) return { ok: false, error: "trialRequestId が空です" };
  const res = await admin
    .from("mbr_walkin_visits")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_reservation_no", trialReservationNo(trialRequestId))
    .is("deleted_at", null);
  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, action: "removed", visitId: null };
}

/**
 * 台帳に載せるお客様（mbr_guests）を探す。無ければ作る。
 *
 * 名寄せの鍵は「間違って別人をくっつけない」ことを優先（来店検索と同じ方針・visitor-search-pure）:
 *   ① 電話番号の下10桁  ② メールアドレス
 * 氏名だけでは絶対にくっつけない（同姓同名が普通にいるため）。
 */
async function resolveGuestId(
  admin: Db,
  companyId: string,
  storeId: string | null,
  req: Row,
): Promise<string | null> {
  const name = String(req.name ?? "").trim();
  if (!name) return null;
  const phone = String(req.phone ?? "").trim();
  const email = String(req.email ?? "").trim();

  const birth = req.birth_date == null || String(req.birth_date).trim() === "" ? null : String(req.birth_date).trim();

  if (phone || email) {
    // ⚠ 以前はここで mbr_guests を **500件だけ** 読んで突き合わせていた（#190で修正）。
    //   FRANK と GOLF WING は同じ会社で、mbr_guests は既に6,000人を超えている。
    //   500件しか見ないと既存のお客様が毎回「新規」として増え、来店検索でも二重に出ていた。
    //   照合はDB関数 find_guest_by_contact（0135）に寄せる＝フィッティング側と同じ1本の規則。
    const hit = await admin.rpc("find_guest_by_contact", {
      p_company_id: companyId,
      p_phone: phone || null,
      p_email: email || null,
    });
    if (!hit.error && hit.data) {
      const gid = String(hit.data);
      // 既存のお客様に生年月日が無ければ、予約でいただいた分で埋める（あるものは上書きしない）
      if (birth) {
        const cur = await admin.from("mbr_guests").select("id, birth_date").eq("id", gid).maybeSingle();
        if (cur.data && (cur.data.birth_date == null || String(cur.data.birth_date).trim() === "")) {
          await admin.from("mbr_guests").update({ birth_date: birth, updated_at: new Date().toISOString() }).eq("id", gid);
        }
      }
      return gid;
    }
  }

  const ins = await admin
    .from("mbr_guests")
    .insert({
      company_id: companyId,
      store_id: storeId,
      name,
      name_kana: req.name_kana == null || String(req.name_kana).trim() === "" ? null : String(req.name_kana).trim(),
      birth_date: birth,
      phone: phone || null,
      email: email || null,
    })
    .select("id")
    .maybeSingle();
  if (ins.error) return null;
  return ins.data?.id ? String(ins.data.id) : null;
}
