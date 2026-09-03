/**
 * FRANK GOLF 法人プランと「予約は消化してから次を取る」の判定
 * （#195・2026-09-01 ／ #206・2026-09-03 で「無記名」に変更）
 *
 * ★ 法人プラン
 *   法人ライト   月39,800円（税抜）・ご利用者 2名まで   ・先の予約は御社合計4コマまで・同伴なし
 *   法人プレミアム 月59,800円（税抜）・ご利用者 人数制限なし・先の予約は御社合計8コマまで・同伴ビジター無料
 *
 *   契約は1本（会社）。月会費のカード決済も1本だけ（ご契約者＝ご担当者の行が持つ）。
 *
 * ★ 入会は「無記名」。使うときだけ「記名」（#206・2026-09-03 ユーザー確定）
 *   お申し込みの時点では、まだ誰が使うか決まっていない会社が多い。
 *   そこで入会は 会社名・ご担当者・請求先 だけで成立させ、
 *   ご利用者は **会員ページからご契約者が追加・削除する**。
 *
 *   ただし「打席を使う人」は必ずご登録いただく（無記名のまま来店はできない）。
 *   誰が来たかが残らないとレッスンカルテを分けられず、会員証QRも出せないため。
 *   ご担当者ご自身が使う場合も同じで、corporate_self_use を立てていただく。
 *
 * ★ 予約の数え方（全会員共通）
 *   「まだ消化していない予約」として同時に持てるコマ数に上限がある。
 *   消化する（その時間が過ぎる／来店になる）まで、次は取れない。
 *   1コマ = 1時間。2時間の予約は2コマ。
 *   法人は **ご登録者全員の合計** で数える（誰が使ってもよいので、会社ぶんの枠を分け合う）。
 *
 *   例) 法人プレミアム（8コマ）で、明日 4名が2時間ずつ = 8コマ を押さえたら、
 *       明後日以降の予約は取れない。明日が終われば、また8コマ取れる。
 *
 *   ⚠ 人数が無制限でも、同時に押さえられるのは8コマのまま。
 *     1人が押さえ切ると他の方が取れなくなるので、
 *     **画面には必ず「御社のご予約 n/8コマ」を出す**（押してから断られる、を作らない）。
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

/**
 * ご利用者の入力欄の検証。空行は捨てる。
 *
 * @param maxUsers 人数の上限。null は無制限（法人プレミアム）
 * @param minUsers 最低人数。**入会フォームは 0**（無記名で申し込める・#206）、
 *                 会員ページからの追加は 1。
 */
export function normalizeCorporateUsers(
  rows: Array<Partial<CorporateUser>>,
  maxUsers: number | null,
  minUsers = 0,
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

  if (filled.length < minUsers) return { users: [], error: "ご利用者を1名以上ご登録ください" };
  if (maxUsers !== null && filled.length > maxUsers) {
    return { users: [], error: `このプランでご登録いただけるのは${maxUsers}名までです` };
  }

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

/**
 * あと何名ご登録いただけるか。上限に達していれば理由つきで false。
 *
 * ご担当者ご自身（corporate_self_use）も1名として数える。
 * 「2名まで」と言いながらご担当者を数えていないと、実際は3名使えてしまう。
 *
 * @param registered ご利用者としてぶら下がっている人数（契約者を含まない）
 * @param selfUse    ご担当者ご自身もご利用者として登録済みか
 */
export function corporateSeats(input: {
  maxUsers: number | null;
  registered: number;
  selfUse?: boolean;
}): { used: number; limit: number | null; remaining: number | null; canAdd: boolean; full: boolean } {
  const used = input.registered + (input.selfUse ? 1 : 0);
  if (input.maxUsers === null) return { used, limit: null, remaining: null, canAdd: true, full: false };
  const limit = Math.max(0, input.maxUsers);
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, canAdd: remaining > 0, full: remaining === 0 };
}

/** 上限に達しているときの、そのまま画面に出せる文 */
export function corporateSeatFullMessage(limit: number): string {
  return `ご登録いただけるのは${limit}名様までです。入れ替える場合は、先に外れる方の【登録を外す】を押してください。`;
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
  // max_users は **null = 無制限**（法人プレミアム・#206）。
  // 「未設定だから2名」と読み替えると、無制限のはずのプランが2名で止まる。
  const raw = plan?.max_users;
  const maxUsers = !isCorporate ? 1 : raw === null || raw === undefined || Number(raw) <= 0 ? null : Number(raw);
  return {
    isCorporate,
    /** null = 人数無制限 */
    maxUsers,
    usersUnlimited: isCorporate && maxUsers === null,
    maxOpenSlots: Number(plan?.max_open_slots ?? plan?.max_bookings_per_day ?? 1),
    companionFree: !!plan?.companion_free,
  };
}

/* ============================ 会員のお名前の出し方 ============================ */

export type NameLike = {
  name?: string | null;
  company_name?: string | null;
  corporate_parent_id?: string | null;
};

/**
 * 画面に出す会員名。法人の方は **会社名＋お名前**（#206・2026-09-03 ユーザー確定）。
 *
 * 「山田太郎」だけだと、受付でも台帳でも どの会社の方か分からない。
 * 法人は御社ぶんの枠を分け合うので、会社が見えないと残り枠の話が通じない。
 *
 *   例) 株式会社ヨザン 山田 太郎
 *
 * 会社名が未登録なら、お名前だけを返す（「 山田太郎」と頭が空くのを防ぐ）。
 * 個人の会員は今までどおりお名前だけ。
 */
export function memberDisplayName(m: NameLike | null | undefined): string {
  const name = String(m?.name ?? "").trim();
  const company = String(m?.company_name ?? "").trim();
  if (!company) return name;
  if (!name) return company;
  return `${company} ${name}`;
}

/* ============================ 打席を使えるのは誰か ============================ */

export type BookerLike = {
  corporate_parent_id?: string | null;
  corporate_self_use?: boolean | null;
};

/**
 * この会員行で打席の予約を受けてよいか（#206）。
 *
 * 法人は「使う人はご利用者としてご登録いただく」ことにした。
 * ご契約者の行は月会費のお支払いを持つだけで、そのままでは予約できない。
 * ご担当者ご自身が使う場合は、会員ページで【ご自身も利用する】を入れていただく
 * （= corporate_self_use。人数にも1名として数える）。
 *
 * こうしないと「誰が来たか」が会社名しか残らず、レッスンカルテを分けられない。
 */
export function canBookAsCorporate(
  spec: { isCorporate: boolean },
  member: BookerLike | null | undefined,
): { ok: boolean; error?: string } {
  if (!spec.isCorporate) return { ok: true };
  const isUser = !!member?.corporate_parent_id;
  if (isUser) return { ok: true };
  if (member?.corporate_self_use) return { ok: true };
  return {
    ok: false,
    error:
      "ご予約は、ご利用者としてご登録された方のみお取りいただけます。会員ページの【ご利用者の管理】から、ご利用になる方をご登録ください（ご担当者様ご自身が使われる場合も、同じ画面でご登録いただけます）。",
  };
}

/* ============================ 予約枠の見せ方 ============================ */

/**
 * 「いまいくつ押さえているか」を画面に出すための1行（#206）。
 *
 * 法人は御社ぶんの枠を分け合うので、残りが見えないと
 * 「うちの誰かが押さえていた」を押してから知ることになる。
 * ここで文言を1つにして、会員ホームと予約画面で同じ言い方をする。
 */
export function slotUsageLabel(input: { used: number; limit: number; corporate?: boolean }): {
  headline: string;
  detail: string;
  full: boolean;
} {
  const used = Math.max(0, input.used);
  const limit = Math.max(1, input.limit);
  const remaining = Math.max(0, limit - used);
  const who = input.corporate ? "御社のご予約" : "お取り中のご予約";
  return {
    headline: `${who} ${used}／${limit}コマ`,
    detail:
      remaining === 0
        ? `${input.corporate ? "御社の" : ""}枠が埋まっています。ご予約を消化されると、また次のご予約をお取りいただけます。`
        : `あと${remaining}コマ（1コマ=1時間）お取りいただけます。`,
    full: remaining === 0,
  };
}
