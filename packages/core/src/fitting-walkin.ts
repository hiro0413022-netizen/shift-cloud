/**
 * フィッティング予約（Reserve OS / res_requests）→ 受付台帳（mbr_walkin_visits）への反映
 *
 * ★ なぜ必要か（2026-08-29・ユーザー指摘）
 *   フィッティングの申込は Reserve OS に入るだけで、受付台帳には1行も入っていなかった。
 *   お客様は予約フォームで氏名・電話・使用クラブ・悩みまで書いているのに、来店すると
 *   店頭タブレットで同じことをもう一度書かされていた（実例: R-0004 中清様は 8/25 に予約、
 *   8/29 14:03 に台帳をゼロから手入力。予約側は pending のまま）。
 *
 * ★ 反映のタイミング（ユーザー決定 2026-08-29）
 *   「スタッフが日程を確定した瞬間」に台帳へ書く。来店を待たない。
 *   見送り・キャンセルは台帳から自動で下げる（フィッティング件数・購入率が実態より多く出るため）。
 *   実際に来たかどうかは mbr_walkin_visits.arrived_at（店舗ダッシュボードの「来店」）で分かる。
 *
 * ★ 冪等キー
 *   mbr_walkin_visits.source_reservation_no に `RES-<res_requests.id>` を入れる（0070の複合ユニーク）。
 *   何度呼んでも行は増えない。FRANKの体験は `FRANK-TRIAL-` なので衝突しない。
 *
 * ★ スタッフの追記は絶対に上書きしない
 *   料金・割引・成約・担当・アンケートは台帳側でスタッフとお客様が書く。再同期で直すのは
 *   日付・お客様の紐付け・自動生成のままのメモだけ。
 */

/** Supabase admin クライアント。SupabaseClient の型は巨大で構造照合すると TS2589 で落ちるため、
 *  受け取るときは検査せず、使う直前に必要な形へキャストする（frank-walkin.ts と同じ方針）。 */
type SupabaseAdminLike = object;

type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;

type Row = Record<string, unknown>;

type Chain = {
  eq(col: string, val: unknown): Chain;
  is(col: string, val: null): Chain;
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
  rpc(fn: string, args: Row): Res<unknown>;
};

export const FITTING_LEDGER_PREFIX = "RES-";

/** 受付台帳の冪等キー */
export function fittingReservationNo(requestId: string): string {
  return `${FITTING_LEDGER_PREFIX}${requestId}`;
}

/** timestamptz(ISO) → JSTの YYYY-MM-DD（台帳の visited_on は日付列） */
export function jstDateOf(iso: unknown): string | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** timestamptz(ISO) → JSTの HH:MM */
export function jstTimeOf(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
}

/** 台帳の備考。予約内容が一目で分かる1行にする（スタッフの追記は上書きしない） */
export function fittingLedgerNote(r: Row): string {
  const time = jstTimeOf(r.confirmed_at);
  const club = [r.club_maker, r.club_model, r.club_shaft, r.club_flex]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return [
    ["フィッティング予約", time, String(r.service_name ?? "").trim()].filter(Boolean).join(" "),
    r.bring_clubs ? `持込: ${String(r.bring_clubs)}` : "",
    club ? `使用中: ${club}` : "",
    r.head_speed ? `HS ${String(r.head_speed)}` : "",
    r.concern ? `お悩み: ${oneLine(r.concern)}` : "",
  ]
    .filter(Boolean)
    .join("／");
}

function oneLine(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/**
 * 予約フォームでいただいた内容を台帳の survey に置く。
 * 既存のアンケート項目（fitting_reasons 等）とは別のキー `reserve` に入れる。
 * ここを混ぜるとExcel出力（現行フォーマット）が崩れるため、必ず分ける。
 */
export function fittingReserveIntake(r: Row): Row {
  const pick = (k: string) => {
    const v = r[k];
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
    return s === "" ? null : s;
  };
  return {
    request_seq: r.request_seq ?? null,
    service_name: pick("service_name"),
    confirmed_at: r.confirmed_at ?? null,
    handedness: pick("handedness"),
    age: r.age ?? null,
    avg_score: pick("avg_score"),
    golf_experience: pick("golf_experience"),
    head_speed: pick("head_speed"),
    club_maker: pick("club_maker"),
    club_model: pick("club_model"),
    club_shaft: pick("club_shaft"),
    club_flex: pick("club_flex"),
    target_distance: pick("target_distance"),
    bring_clubs: pick("bring_clubs"),
    concern: pick("concern"),
    improvement: pick("improvement"),
    other_notes: pick("other_notes"),
  };
}

/** source（web / line / staff）→ 台帳の流入元。スタッフが選び直せるよう「その他」欄に経路を残す */
export function fittingReferral(source: unknown): { referral_source: string; referral_source_other: string } {
  const s = String(source ?? "");
  const label = s === "line" ? "公式LINE" : s === "staff" ? "スタッフ入力" : "Web予約";
  return {
    referral_source: s === "line" ? "公式LINE" : "ホームページ",
    referral_source_other: `フィッティングWeb予約（${label}）`,
  };
}

export type FittingLedgerResult =
  | { ok: true; action: "created" | "updated" | "removed" | "skipped"; visitId: string | null }
  | { ok: false; error: string };

/**
 * 申込1件を受付台帳に反映する（確定時の作成・日時変更時の更新・見送り/キャンセル時の取り下げ）。
 * 予約の保存が成功した後に呼ぶ。ここで失敗しても予約そのものは成立させること
 * （台帳が書けなかったせいでお客様の予約が消える方が事故が大きい）。
 */
export async function syncFittingWalkin(
  adminLike: SupabaseAdminLike,
  requestId: string,
  opts: { receptionStaffId?: string | null } = {},
): Promise<FittingLedgerResult> {
  const admin = adminLike as Db;
  if (!requestId) return { ok: false, error: "requestId が空です" };

  const reqRes = await admin
    .from("res_requests")
    .select(
      "id, company_id, store_id, request_seq, service_name, service_category, name, name_kana, phone, email, " +
        "handedness, age, avg_score, golf_experience, head_speed, club_maker, club_model, club_shaft, club_flex, " +
        "target_distance, bring_clubs, concern, improvement, other_notes, status, source, confirmed_at, deleted_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  const req = reqRes.data;
  if (!req) return { ok: false, error: "予約申込が見つかりません" };

  const companyId = String(req.company_id ?? "");
  const storeId = req.store_id == null ? null : String(req.store_id);
  const resNo = fittingReservationNo(requestId);

  // いまの台帳行（生きているもの）
  const existingRes = await admin
    .from("mbr_walkin_visits")
    .select("id, guest_id, visited_on, note, arrived_at")
    .eq("company_id", companyId)
    .eq("source_reservation_no", resNo)
    .is("deleted_at", null)
    .maybeSingle();
  const existing = existingRes.data;

  const status = String(req.status ?? "");
  // 見送り・キャンセル・削除済みは台帳から下げる。
  // ただし来店打刻があれば残す（実際に来た人を件数から消してはいけない）。
  const dropped = status === "canceled" || status === "declined" || req.deleted_at != null;
  if (dropped) {
    if (!existing || existing.arrived_at != null) return { ok: true, action: "skipped", visitId: existing ? String(existing.id) : null };
    const del = await admin
      .from("mbr_walkin_visits")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", String(existing.id));
    if (del.error) return { ok: false, error: del.error.message };
    return { ok: true, action: "removed", visitId: String(existing.id) };
  }

  // 未確定（pending）は台帳に載せない。載せる日が決まっていないため。
  const visitedOn = jstDateOf(req.confirmed_at);
  if (!visitedOn) return { ok: true, action: "skipped", visitId: existing ? String(existing.id) : null };

  if (existing) {
    const patch: Row = {};
    if (String(existing.visited_on ?? "") !== visitedOn) patch.visited_on = visitedOn;
    const curNote = String(existing.note ?? "");
    const nextNote = fittingLedgerNote(req);
    // 自動生成のままのメモだけ作り直す（日時変更で古い時刻が残るのを防ぐ）。スタッフが書き換えたメモは触らない
    if (curNote.startsWith("フィッティング予約") && curNote !== nextNote) patch.note = nextNote;
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
  const ref = fittingReferral(req.source);

  const ins = await admin
    .from("mbr_walkin_visits")
    .insert({
      company_id: companyId,
      store_id: storeId,
      guest_id: guestId,
      visited_on: visitedOn,
      visit_type: "fitting",
      // 料金はコマ数・購入有無で変わる。スタッフが台帳で入れる（既定は空のまま）
      result: "none",
      referral_source: ref.referral_source,
      referral_source_other: ref.referral_source_other,
      note: fittingLedgerNote(req),
      survey: { reserve: fittingReserveIntake(req) },
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

/**
 * 台帳に載せるお客様（mbr_guests）を探す。無ければ作る。
 *
 * 名寄せの鍵は「間違って別人をくっつけない」ことを優先（0110 search_visitors と同じ方針）:
 *   ① 電話番号の下10桁  ② メールアドレス
 * 氏名だけでは絶対にくっつけない（同姓同名が普通にいる）。
 *
 * 照合はDB関数 find_guest_by_contact（0135）で行う。GOLF WINGの mbr_guests は
 * すでに6,000人を超えており、アプリ側で数百件だけ読んで突き合わせると既存客が新規として増える。
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

  if (phone || email) {
    const hit = await admin.rpc("find_guest_by_contact", {
      p_company_id: companyId,
      p_phone: phone || null,
      p_email: email || null,
    });
    if (!hit.error && hit.data) return String(hit.data);
  }

  const ins = await admin
    .from("mbr_guests")
    .insert({
      company_id: companyId,
      store_id: storeId,
      name,
      name_kana: req.name_kana == null || String(req.name_kana).trim() === "" ? null : String(req.name_kana).trim(),
      phone: phone || null,
      email: email || null,
    })
    .select("id")
    .maybeSingle();
  if (ins.error) return null;
  return ins.data?.id ? String(ins.data.id) : null;
}
