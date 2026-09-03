import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import {
  FRANK_STORE_ID,
  DEFAULT_BOOKING_CFG,
  loadBookingCfg as loadCfg,
  businessHours as hoursOf,
  bookableRange,
  memberStartStep,
  memberMinutesOptions,
  lessonOption,
  grainOf,
  coveredCells,
  type BookingCfg,
} from "@yozan/core/frank-booking";
import { handoffSecret, verifyHandoff } from "@yozan/core/frank-handoff";
import { checkOpenSlots, corporateSpec, canBookAsCorporate } from "@yozan/core/frank-corporate";

/**
 * FRANK GOLF 打席予約（#86 §3-3・台帳一本化 #93）
 * - お客様は **毎時00分スタート・1時間 or 2時間**（2026-09-01 ユーザー確定）。
 *   刻みは cfg.member_start_step / cfg.member_minutes_options。台帳とスタッフ画面は
 *   従来どおり30分刻み（slot_minutes）なので、電話予約の 14:30〜 もそのまま入れられる。
 * - 営業時間・定休日は @yozan/core/frank-booking（gn_site_content で上書き可）
 * - 会員認証: 会員番号＋電話番号下4桁（Web完結・パスワードレス）
 * - プラン上限: レギュラー=1日60分／マスター=1日120分／ライト=1日60分+月4回まで（#136b・ユーザー確定）
 * ★ 設定と営業時間の判定はスタッフ画面(member-os)と共通。ここで独自定義しないこと。
 */

// 既存の import 先を壊さないための再export（member-os も同じ定義を使う）
export { DEFAULT_BOOKING_CFG };
export type { BookingCfg };

type Admin = ReturnType<typeof createAdmin>;

const FRANK_STORE = FRANK_STORE_ID;

export async function loadBookingCfg(admin: Admin): Promise<BookingCfg> {
  return loadCfg(admin);
}

/** 営業時間（定休日・臨時休業なら null）。判定ロジックは @yozan/core に集約 */
export function businessHours(dateStr: string, cfg: BookingCfg = DEFAULT_BOOKING_CFG) {
  return hoursOf(dateStr, cfg);
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 打席指定のレッスン枠（open）を打席ブロックとして返す（#88 §3-4） */
async function lessonBaySlots(admin: Admin, dateStr: string): Promise<{ bay_id: string; start_time: string; end_time: string }[]> {
  const { data } = await admin
    .from("frunk_lesson_slots")
    .select("bay_id, start_time, end_time")
    .eq("slot_date", dateStr)
    .eq("status", "open")
    .not("bay_id", "is", null)
    .is("deleted_at", null);
  return (data ?? []).map((s) => ({ bay_id: String(s.bay_id), start_time: String(s.start_time), end_time: String(s.end_time) }));
}

const AUTH_LOCK_WINDOW_MIN = 15;
const AUTH_LOCK_MAX_FAILS = 10;

/** 直近15分の失敗回数がしきい値を超えていたらロック（総当たり対策 #136） */
async function authLocked(admin: Admin, memberNo: string): Promise<boolean> {
  const since = new Date(Date.now() - AUTH_LOCK_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from("frunk_auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("member_no", memberNo)
    .eq("success", false)
    .gte("attempted_at", since);
  // テーブル未作成（migration 0113 未適用）等は従来どおり通す（機能を壊さない）
  if (error) return false;
  return (count ?? 0) >= AUTH_LOCK_MAX_FAILS;
}

async function recordAuthAttempt(admin: Admin, memberNo: string, success: boolean): Promise<void> {
  await admin
    .from("frunk_auth_attempts")
    .insert({ member_no: memberNo, success })
    .then(() => undefined, () => undefined); // 記録失敗で本処理は止めない
}

export async function verifyMember(admin: Admin, memberNo: string, phoneLast4: string) {
  const no = memberNo.trim();
  const last4 = phoneLast4.trim();
  // 形式チェック（公開APIから直接呼ばれるためサーバー側でも必ず行う）
  if (!/^[A-Za-z0-9-]{2,16}$/.test(no) || !/^\d{4}$/.test(last4)) return null;
  if (await authLocked(admin, no)) return null;

  const { data } = await admin
    .from("frunk_members")
    .select("id, company_id, name, member_no, phone, status, plan_id, corporate_parent_id, corporate_self_use, frunk_plans(name, max_bookings_per_day, max_open_slots, is_corporate, max_users, companion_free)")
    .eq("member_no", no)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) {
    await recordAuthAttempt(admin, no, false);
    return null;
  }
  const digits = String(data.phone ?? "").replace(/\D/g, "");
  if (digits.slice(-4) !== last4) {
    await recordAuthAttempt(admin, no, false);
    return null;
  }
  if (!["active", "approved"].includes(String(data.status))) return null;
  return data;
}

/**
 * 会員ポータル（member-os）からの引き渡しトークンで会員を特定する（#152）
 *
 * ログイン済みのお客様に、移動先の予約ページで会員番号＋電話下4桁を **もう一度**
 * 入力させていたのをやめるための経路。署名の検証だけで済ませる（@yozan/core/frank-handoff）。
 * 電話番号の照合は member-os のログイン時に済んでいるので、ここでは行わない。
 */
export async function verifyMemberByHandoff(admin: Admin, token: string) {
  const secret = handoffSecret();
  if (!secret) return null; // 鍵未設定＝引き渡しだけ無効。入力フォームでの予約は従来どおり動く
  const no = verifyHandoff(token, secret);
  if (!no) return null;
  const { data } = await admin
    .from("frunk_members")
    .select("id, company_id, name, member_no, phone, status, plan_id, corporate_parent_id, corporate_self_use, frunk_plans(name, max_bookings_per_day, max_open_slots, is_corporate, max_users, companion_free)")
    .eq("member_no", no)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  if (!["active", "approved"].includes(String(data.status))) return null;
  return data;
}

/** 予約APIの認証入力。トークンがあればそれを優先し、無ければ従来の会員番号＋下4桁 */
export type MemberAuth = { memberNo?: string; phoneLast4?: string; token?: string };

export async function authMember(admin: Admin, a: MemberAuth) {
  if (a.token) return verifyMemberByHandoff(admin, a.token);
  return verifyMember(admin, a.memberNo ?? "", a.phoneLast4 ?? "");
}

/** 日別の空き状況 */
export async function getSlots(dateStr: string) {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(dateStr, cfg);
  const { data: bays } = await admin
    .from("frunk_bays")
    .select("id, code, name, floor, equipment")
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort");
  const range = bookableRange(cfg);
  if (!hours) {
    const reason =
      cfg.open_date && dateStr < cfg.open_date
        ? `ご予約は ${cfg.open_date.replace(/-/g, "/")} ${cfg.open_time}〜 のオープン以降の日付で承ります`
        : "この日は休業日です";
    return { date: dateStr, closed: true, reason, open_date: cfg.open_date, min_date: range.min, max_date: range.max, bays: bays ?? [], slots: [], taken: {} };
  }
  // お客様に見せる開始時刻は「毎時00分」。空き判定はもっと細かいマス（grain）で行う
  const STEP = memberStartStep(cfg);
  const GRAIN = grainOf(cfg);
  const minutesOptions = memberMinutesOptions(cfg);
  const lesson = lessonOption(cfg);

  const slots: string[] = [];
  for (let m = toMin(hours.open); m + Math.min(...minutesOptions) <= toMin(hours.close); m += STEP) slots.push(toTime(m));

  const { data: bookings } = await admin
    .from("frunk_bookings")
    .select("bay_id, start_time, end_time")
    .eq("booked_date", dateStr)
    // 来店済み・無断欠も枠は使われている。空くのは cancelled だけ（0084）
    .neq("status", "cancelled")
    .is("deleted_at", null);

  // レッスン枠（#88 §3-4）: プロが打席指定で公開した枠は打席予約から除外
  const lessonSlots = await lessonBaySlots(admin, dateStr);

  // 埋まっているマス。14:30〜のスタッフ予約や25分のレッスンも、マスの頭に丸めて必ず塗る
  // （60分刻みの列だけを塗ると 14:30〜の予約が「空き」に見えてしまうため）
  const taken: Record<string, string[]> = {};
  for (const b of [...(bookings ?? []), ...lessonSlots]) {
    const list = taken[String(b.bay_id)] ?? (taken[String(b.bay_id)] = []);
    for (const c of coveredCells(String(b.start_time), String(b.end_time), GRAIN)) list.push(c);
  }
  return {
    date: dateStr,
    closed: false,
    hours,
    open_date: cfg.open_date,
    min_date: range.min,
    max_date: range.max,
    bays: bays ?? [],
    slots,
    taken,
    // 画面が「利用時間ぶん空いているか」を自分で判定できるようにする
    grain: GRAIN,
    step: STEP,
    minutes_options: minutesOptions,
    lesson_option: lesson.enabled ? { minutes: lesson.minutes, price: lesson.price } : null,
  };
}

/** プラン上限チェック → OKなら予約作成 */
export async function createBooking(input: {
  auth: MemberAuth;
  date: string;
  bayCode: string;
  start: string; // "HH:MM"（毎時00分）
  minutes: number; // 60 | 120
  /** パーソナルレッスン（25分）の希望。担当プロと時間は店舗が確定する */
  lesson?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdmin();
  const member = await authMember(admin, input.auth);
  if (!member) return { ok: false, error: "会員番号または電話番号下4桁が一致しません（入会承認前の場合はご利用いただけません）" };

  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(input.date, cfg);
  if (!hours) return { ok: false, error: "この日は休業日です" };
  const startMin = toMin(input.start);
  const endMin = startMin + input.minutes;
  if (startMin < toMin(hours.open) || endMin > toMin(hours.close)) return { ok: false, error: "営業時間外です" };
  const minutesOptions = memberMinutesOptions(cfg);
  if (!minutesOptions.includes(input.minutes)) return { ok: false, error: "利用時間が不正です" };
  // 開始は毎時00分のみ（画面の作りに関係なく、APIを直接叩かれても守る）
  const step = memberStartStep(cfg);
  if ((startMin - toMin(hours.open)) % step !== 0) {
    return { ok: false, error: `ご予約の開始は${step === 60 ? "毎時00分" : `${step}分刻み`}のみです` };
  }
  const range = bookableRange(cfg);
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (input.date < todayJst) return { ok: false, error: "過去の日付は予約できません" };
  if (input.date < range.min) return { ok: false, error: `ご予約は ${range.min.replace(/-/g, "/")} 以降で承ります` };
  if (input.date > range.max) return { ok: false, error: `ご予約は ${range.max.replace(/-/g, "/")} までの日付で承ります` };

  // プラン上限
  const plan = (member as unknown as {
    frunk_plans: {
      name: string;
      max_bookings_per_day: number | null;
      max_open_slots?: number | null;
      is_corporate?: boolean | null;
      max_users?: number | null;
      companion_free?: boolean | null;
    } | null;
  }).frunk_plans;
  const dailyMax = (plan?.max_bookings_per_day ?? 1) * 60; // 時間→分
  const { data: sameDay } = await admin
    .from("frunk_bookings")
    .select("start_time, end_time")
    .eq("member_id", member.id)
    .eq("booked_date", input.date)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  const usedMin = (sameDay ?? []).reduce((s, b) => s + (toMin(String(b.end_time)) - toMin(String(b.start_time))), 0);
  if (usedMin + input.minutes > dailyMax) {
    return { ok: false, error: `このプランの1日の上限（${dailyMax / 60}時間）を超えます（本日あと${Math.max(0, dailyMax - usedMin)}分）` };
  }
  if (plan?.name === "ライト会員") {
    const monthStart = `${input.date.slice(0, 7)}-01`;
    // 翌月1日を正しく計算する（"-31" 固定は 2月等で不正な日付になり、
    // クエリがエラー→空配列扱い→上限チェックが素通りしていた）
    const y = Number(input.date.slice(0, 4));
    const mo = Number(input.date.slice(5, 7));
    const nextMonthStart = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, "0")}-01`;
    const { data: monthRows, error: monthErr } = await admin
      .from("frunk_bookings")
      .select("booked_date")
      .eq("member_id", member.id)
      .gte("booked_date", monthStart)
      .lt("booked_date", nextMonthStart)
      .neq("status", "cancelled")
      .is("deleted_at", null);
    if (monthErr) {
      // 取得に失敗したら安全側（予約を通さない）。黙って上限を無効化しない
      console.error("[frank-booking] month cap query failed:", monthErr);
      return { ok: false, error: "予約状況の確認に失敗しました。時間をおいてお試しください" };
    }
    const days = new Set((monthRows ?? []).map((r) => String(r.booked_date)));
    // 正の仕様は「月4回」（2026-08-13 ユーザー確定 #136b。旧実装の8日はHP表記とも食い違っていた）
    if (!days.has(input.date) && days.size >= 4) return { ok: false, error: "ライト会員は月4回までのご利用です（同じ日の追加予約は回数に含みません）" };
  }

  // 「予約は消化してから次を取る」（#195・2026-09-01 ユーザー確定・全会員共通）
  //
  //   まだ消化していない予約として同時に持てるコマ数に上限がある（1コマ=1時間）。
  //   法人は **登録者全員の合計** で数える（会社ぶんの枠を分け合う。誰が来てもよい代わりに、
  //   1人が押さえ切ると他の方が取れなくなるので、画面のメッセージで残り数を必ず伝える）。
  //
  //   数え方は @yozan/core/frank-corporate。ここで書き直さないこと
  //   （お客様の画面とサーバーでズレると「○を押したのに予約できません」になる）。
  const spec = corporateSpec(plan);

  // 法人は「使う人はご利用者としてご登録いただく」（#204・2026-09-03 ユーザー確定）。
  // ご契約者の行は月会費のお支払いを持つだけで、そのままでは予約できない
  // （会員ページで【自分も利用する】を登録すれば取れる）。
  // ここで通してしまうと「会社名義の誰か」の予約が1件混ざり、来店したのが誰か分からなくなる。
  const asUser = canBookAsCorporate(spec, member as { corporate_parent_id?: string | null; corporate_self_use?: boolean | null });
  if (!asUser.ok) return { ok: false, error: asUser.error ?? "ご利用者としてのご登録が必要です" };

  const nowHm = new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16);
  // 法人は契約者と利用者を全部集める。契約者の行は corporate_parent_id が null なので、
  // 自分が利用者なら親を、契約者なら自分を起点にする
  let holderIds: string[] = [String(member.id)];
  if (spec.isCorporate) {
    const rootId = (member as { corporate_parent_id?: string | null }).corporate_parent_id
      ? String((member as { corporate_parent_id?: string | null }).corporate_parent_id)
      : String(member.id);
    const { data: group } = await admin
      .from("frunk_members")
      .select("id")
      .or(`id.eq.${rootId},corporate_parent_id.eq.${rootId}`)
      .is("deleted_at", null);
    holderIds = (group ?? []).map((g) => String((g as { id: string }).id));
    if (holderIds.length === 0) holderIds = [rootId];
  }
  const { data: openRows, error: openErr } = await admin
    .from("frunk_bookings")
    .select("booked_date, start_time, end_time, status")
    .in("member_id", holderIds)
    .gte("booked_date", todayJst)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  if (openErr) {
    // 取得に失敗したら安全側（予約を通さない）。黙って上限を無効化しない
    console.error("[frank-booking] open slots query failed:", openErr);
    return { ok: false, error: "予約状況の確認に失敗しました。時間をおいてお試しください" };
  }
  const slotCheck = checkOpenSlots({
    bookings: (openRows ?? []).map((b) => ({
      date: String(b.booked_date),
      endTime: String(b.end_time),
      minutes: toMin(String(b.end_time)) - toMin(String(b.start_time)),
      status: String(b.status ?? ""),
    })),
    addMinutes: input.minutes,
    limit: spec.maxOpenSlots,
    todayYmd: todayJst,
    nowHm,
    corporate: spec.isCorporate,
  });
  if (!slotCheck.ok) return { ok: false, error: slotCheck.error ?? "ご予約の上限に達しています" };

  // パーソナルレッスン（25分）の希望。設定でオフのときは黙って無視する
  const lesson = lessonOption(cfg);
  const wantsLesson = input.lesson === true && lesson.enabled;

  const { data: bay } = await admin
    .from("frunk_bays")
    .select("id, name")
    .eq("code", input.bayCode)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bay) return { ok: false, error: "打席が見つかりません" };

  // 枠の重複（unique indexが最終防衛。ここでは連続枠すべて確認）
  const { data: conflict } = await admin
    .from("frunk_bookings")
    .select("id, start_time, end_time")
    .eq("bay_id", bay.id)
    .eq("booked_date", input.date)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  const lessonBlocks = (await lessonBaySlots(admin, input.date)).filter((s) => s.bay_id === String(bay.id));
  for (const b of [...(conflict ?? []), ...lessonBlocks]) {
    const bs = toMin(String(b.start_time));
    const be = toMin(String(b.end_time));
    if (startMin < be && endMin > bs) return { ok: false, error: "その時間帯はすでに予約が入っています" };
  }

  const { data: created, error } = await admin
    .from("frunk_bookings")
    .insert({
      company_id: member.company_id,
      store_id: FRANK_STORE,
      member_id: member.id,
      customer_kind: "member",
      bay_id: bay.id,
      booked_date: input.date,
      start_time: input.start,
      end_time: toTime(endMin),
      status: "confirmed",
      source: "web",
      ...(wantsLesson
        ? {
            lesson_option_status: "requested",
            lesson_option_minutes: lesson.minutes,
            lesson_option_fee: lesson.price,
          }
        : {}),
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: "予約の保存に失敗しました。別の枠でお試しください" };

  await logEvent(String(member.company_id), {
    event_type: "booking.created",
    title: `打席予約: ${member.name}様 ${input.date} ${input.start}〜${toTime(endMin)}（${bay.name}）${wantsLesson ? "＋パーソナル25分 希望" : ""}`.slice(0, 120),
    source: "frank_booking",
    source_type: "system",
  });
  return { ok: true, id: String(created.id) };
}

export async function listMyBookings(auth: MemberAuth) {
  const admin = createAdmin();
  const member = await authMember(admin, auth);
  if (!member) return null;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("frunk_bookings")
    .select(
      "id, booked_date, start_time, end_time, status, frunk_bays(name), " +
        "lesson_option_status, lesson_option_start, lesson_option_minutes, lesson_option_fee",
    )
    .eq("member_id", member.id)
    .gte("booked_date", today)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .order("booked_date")
    .order("start_time");
  return { name: member.name, member_no: member.member_no, bookings: data ?? [] };
}

export async function cancelBooking(auth: MemberAuth, bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdmin();
  const member = await authMember(admin, auth);
  if (!member) return { ok: false, error: "認証に失敗しました" };
  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, member_id, booked_date, start_time")
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (!bk || bk.member_id !== member.id) return { ok: false, error: "予約が見つかりません" };
  await admin.from("frunk_bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bk.id);
  await logEvent(String(member.company_id), {
    event_type: "booking.cancelled",
    title: `打席予約キャンセル: ${member.name}様 ${bk.booked_date} ${String(bk.start_time).slice(0, 5)}`.slice(0, 120),
    source: "frank_booking",
    source_type: "system",
  });
  return { ok: true };
}
