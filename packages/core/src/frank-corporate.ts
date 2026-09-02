/**
 * FRANK GOLF 法人プランと「予約は消化してから次を取る」の判定（#195・2026-09-01 ユーザー確定）
 *
 * ★ 法人プラン
 *   法人ライト   月39,800円（税抜）・利用者 最大2名・先の予約は合計4コマまで・同伴なし
 *   法人プレミアム 月59,800円（税抜）・利用者 最大4名・先の予約は合計8コマまで・同伴ビジター無料
 *
 *   契約は1本（会社）。月会費のカード決済も1本だけ（契約者＝ご担当者の行が持つ）。
 *   利用者は申込のときに全員ぶん登録していただく。ひとりずつ会員番号が出るので、
 *   誰が来たのかが記録に残り、レッスンカルテも分けられる。
 *
 * ★ 予約の数え方（全会員共通）
 *   「まだ消化していない予約」として同時に持てるコマ数に上限がある。
 *   消化する（その時間が過ぎる／来店になる）まで、次は取れない。
 *   1コマ = 1時間。2時間の予約は2コマ。
 *   法人は **登録者全員の合計** で数える（誰が使ってもよいので、会社ぶんの枠を分け合う）。
 *
 *   例) 法人プレミアム（8コマ）で、明日 4名が2時間ずつ = 8コマ を押さえたら、
 *       明後日以降の予約は取れない。明日が終われば、また8コマ取れる。
 *
 * ★ ここを純関数に置く理由
 *   数え方がお客様の画面とサーバーでズレると「○を押したのに予約できません」か、
 *   逆に上限を超えて取れてしまう。どちらも店頭で必ず揉める。判定は1か所に置く。
 */

/** 1コマ = 60分 */
export const SLOT_MINUTES = 60;

/** 予約の分数 → コマ数（端数は切り上げ。25分のパーソナルでも1コマは押さえている） */
export function slotsOfMinutes(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / SLOT_MINUTES));
}

export type OpenBooking = {
  date: string;        // "YYYY-MM-DD"
  endTime: string;     // "HH:MM" または "HH:MM:SS"
  minutes: number;     // 利用時間（分）
  status?: string | null;
};

/** 消化済みとみなす予約の状態（もう枠を占有していない） */
const SETTLED = new Set(["cancelled", "visited", "no_show"]);

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/**
 * まだ消化していない予約か。
 * - キャンセル・来店済み・無断欠は消化済み
 * - 今日より前の日付は消化済み
 * - 今日の予約は、終了時刻を過ぎていれば消化済み
 */
export function isOpenBooking(b: OpenBooking, todayYmd: string, nowHm: string): boolean {
  if (b.status && SETTLED.has(String(b.status))) return false;
  if (b.date < todayYmd) return false;
  if (b.date > todayYmd) return true;
  return toMin(b.endTime) > toMin(nowHm);
}

/** まだ消化していない予約の合計コマ数 */
export function openSlots(bookings: OpenBooking[], todayYmd: string, nowHm: string): number {
  return bookings
    .filter((b) => isOpenBooking(b, todayYmd, nowHm))
    .reduce((s, b) => s + slotsOfMinutes(b.minutes), 0);
}

export type SlotCheck = { ok: boolean; used: number; limit: number; adding: number; remaining: number; error?: string };

/**
 * 新しい予約を受けてよいか。
 * limit は プランの max_open_slots（法人は登録者全員の合計に対する上限）。
 */
export function checkOpenSlots(input: {
  bookings: OpenBooking[];
  addMinutes: number;
  limit: number;
  todayYmd: string;
  nowHm: string;
  corporate?: boolean;
}): SlotCheck {
  const used = openSlots(input.bookings, input.todayYmd, input.nowHm);
  const adding = slotsOfMinutes(input.addMinutes);
  const limit = Math.max(1, input.limit);
  const remaining = Math.max(0, limit - used);
  if (used + adding <= limit) return { ok: true, used, limit, adding, remaining };
  return {
    ok: false,
    used,
    limit,
    adding,
    remaining,
    error:
      remaining === 0
        ? `${input.corporate ? "御社で" : ""}お取りいただける${limit}コマ（1コマ=1時間）が埋まっています。ご予約を消化されると、また次のご予約をお取りいただけます。`
        : `残り${remaining}コマ（1コマ=1時間）です。${adding}コマのご予約はお取りいただけません。`,
  };
}

/* ============================ 法人の利用者 ============================ */

export type CorporateUser = {
  name: string;
  nameKana?: string | null;
  birthDate?: string | null;
  phone: string;
  email?: string | null;
};

/** 申込の利用者欄の検証。空行は捨て、上限を超えたら弾く */
export function normalizeCorporateUsers(
  rows: Array<Partial<CorporateUser>>,
  maxUsers: number,
): { users: CorporateUser[]; error?: string } {
  const filled = rows
    .map((r) => ({
      name: String(r.name ?? "").trim(),
      nameKana: String(r.nameKana ?? "").trim() || null,
      birthDate: String(r.birthDate ?? "").trim() || null,
      phone: String(r.phone ?? "").trim(),
      email: String(r.email ?? "").trim() || null,
    }))
    .filter((r) => r.name !== "" || r.phone !== "");

  if (filled.length === 0) return { users: [], error: "ご利用者を1名以上ご登録ください" };
  if (filled.length > maxUsers) return { users: [], error: `このプランでご登録いただけるのは${maxUsers}名までです` };

  for (const [i, r] of filled.entries()) {
    if (!r.name) return { users: [], error: `ご利用者${i + 1}のお名前をご入力ください` };
    // 会員ページのログインに電話番号の下4桁を使うので、利用者ごとに必ずいただく
    if (!/\d{4}/.test(r.phone.replace(/\D/g, ""))) {
      return { users: [], error: `ご利用者${i + 1}の電話番号をご入力ください（会員ページのログインに下4桁を使います）` };
    }
  }
  // 同じ電話番号の重複はログインが取り違えるので弾く
  const digits = filled.map((r) => r.phone.replace(/\D/g, ""));
  if (new Set(digits).size !== digits.length) {
    return { users: [], error: "ご利用者の電話番号が重複しています。おひとりずつ異なる番号をご入力ください" };
  }
  return { users: filled };
}

/** プラン行から法人の設定を読む（列が無い/未設定でも壊れない） */
export type PlanLike = {
  is_corporate?: boolean | null;
  max_users?: number | null;
  max_open_slots?: number | null;
  max_bookings_per_day?: number | null;
  companion_free?: boolean | null;
};

export function corporateSpec(plan: PlanLike | null | undefined) {
  const isCorporate = !!plan?.is_corporate;
  return {
    isCorporate,
    maxUsers: Number(plan?.max_users ?? (isCorporate ? 2 : 1)),
    maxOpenSlots: Number(plan?.max_open_slots ?? plan?.max_bookings_per_day ?? 1),
    companionFree: !!plan?.companion_free,
  };
}
