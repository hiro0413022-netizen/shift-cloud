import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { loadBookingCfg, businessHours } from "@/lib/frank-booking";
import { bookableRange } from "@yozan/core/frank-booking";
import { buildTrialConfirmMail, sendFrankMail } from "@/lib/frank-mail";

/**
 * FRANK GOLF 体験のセルフ予約（0083）
 *
 * 方針:
 * - 非会員がその場で「日時」を選ぶだけで確定する。折り返し連絡は挟まない。
 * - 打席はお客様に選ばせず、A→B→C の優先順で自動割当（初めての人に打席の違いは判断できないため）。
 * - レフティ希望は左右打席（B打席）のみ。
 * - 会員の打席予約と同じ frunk_bookings に入れるので、空き状況は自動的に共通になる。
 */

const FRANK_STORE = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

/** 体験の所要時間。案内は「約55分」、枠は60分押さえる（片付け・見送りの余裕） */
export const TRIAL_MINUTES = 60;
export const TRIAL_LABEL_MINUTES = 55;

/**
 * 体験の開始は「毎時00分」のみ（2026-07-31 運用ルール）。
 * 会員の打席予約は frunk_booking_cfg.slot_minutes（30分刻み等）のままなので、
 * 体験だけこの定数で刻みを上書きする。cfg を変えると会員側にも波及するため触らない。
 */
export const TRIAL_START_STEP = 60;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

type Bay = { id: string; code: string; name: string; company_id: string; is_lefty: boolean; trial_priority: number };

/** 体験に使える打席（優先順）。D打席のように active=false / trial_priority=null は除外 */
async function trialBays(admin: ReturnType<typeof createAdmin>): Promise<Bay[]> {
  const { data } = await admin
    .from("frunk_bays")
    .select("id, code, name, company_id, is_lefty, trial_priority")
    .eq("active", true)
    .not("trial_priority", "is", null)
    .is("deleted_at", null)
    .order("trial_priority");
  return (data ?? []) as Bay[];
}

/** その日の打席別の埋まっている時間帯（会員予約＋体験＋打席指定のレッスン枠） */
async function busyByBay(admin: ReturnType<typeof createAdmin>, dateStr: string) {
  const [{ data: bookings }, { data: lessons }] = await Promise.all([
    admin
      .from("frunk_bookings")
      .select("bay_id, start_time, end_time")
      .eq("booked_date", dateStr)
      // 来店済み・無断欠も枠は使われている（0084）
      .neq("status", "cancelled")
      .is("deleted_at", null),
    admin
      .from("frunk_lesson_slots")
      .select("bay_id, start_time, end_time")
      .eq("slot_date", dateStr)
      .eq("status", "open")
      .not("bay_id", "is", null)
      .is("deleted_at", null),
  ]);
  const busy: Record<string, { s: number; e: number }[]> = {};
  for (const b of [...(bookings ?? []), ...(lessons ?? [])]) {
    const key = String(b.bay_id);
    (busy[key] ??= []).push({ s: toMin(String(b.start_time)), e: toMin(String(b.end_time)) });
  }
  return busy;
}

const overlaps = (list: { s: number; e: number }[] | undefined, s: number, e: number) =>
  (list ?? []).some((b) => s < b.e && e > b.s);

/** 指定時刻に割り当てられる打席を優先順で1つ返す（空きが無ければ null） */
function pickBay(bays: Bay[], busy: Record<string, { s: number; e: number }[]>, s: number, e: number, lefty: boolean) {
  for (const bay of bays) {
    if (lefty && !bay.is_lefty) continue;
    if (!overlaps(busy[bay.id], s, e)) return bay;
  }
  return null;
}

export type TrialSlots = {
  date: string;
  closed: boolean;
  minutes: number;
  labelMinutes: number;
  /** 予約可能な開始時刻（右打ち＝どの打席でもよい場合） */
  slots: string[];
  /** レフティ希望の場合に予約可能な開始時刻（左右打席のみ） */
  leftySlots: string[];
  advanceDays: number;
  /** 定休曜日 0=日〜6=土（日付ボタンを最初からグレーにするため） */
  closedDows: number[];
  /** 臨時休業日 YYYY-MM-DD */
  closedDates: string[];
  /** 予約受付の開始日（プレオープン日より前は不可） */
  openDate: string;
};

/** 日別の体験の空き（時刻だけ返す。打席名は確定するまで見せない） */
export async function getTrialSlots(dateStr: string): Promise<TrialSlots> {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(dateStr, cfg);
  const base = {
    date: dateStr,
    minutes: TRIAL_MINUTES,
    labelMinutes: TRIAL_LABEL_MINUTES,
    advanceDays: cfg.advance_days,
    closedDows: cfg.closed_dows,
    closedDates: cfg.closed_dates,
    openDate: cfg.open_date,
  };
  if (!hours) return { ...base, closed: true, slots: [], leftySlots: [] };

  const [bays, busy] = await Promise.all([trialBays(admin), busyByBay(admin, dateStr)]);
  const open = toMin(hours.open);
  const close = toMin(hours.close);
  const today = jstToday();
  // 当日ぶんは「今から2時間後以降」だけ出す（直前予約で準備が間に合わない事故を防ぐ）
  const nowMin = new Date(Date.now() + 9 * 3600_000).getUTCHours() * 60 + new Date(Date.now() + 9 * 3600_000).getUTCMinutes();
  const earliest = dateStr === today ? nowMin + 120 : -1;

  const slots: string[] = [];
  const leftySlots: string[] = [];
  // 開始は毎時00分のみ。営業開始が 9:30 のような場合は次の00分（10:00）から。
  const first = Math.ceil(open / TRIAL_START_STEP) * TRIAL_START_STEP;
  for (let s = first; s + TRIAL_MINUTES <= close; s += TRIAL_START_STEP) {
    if (s < earliest) continue;
    const e = s + TRIAL_MINUTES;
    if (pickBay(bays, busy, s, e, false)) slots.push(toTime(s));
    if (pickBay(bays, busy, s, e, true)) leftySlots.push(toTime(s));
  }
  return { ...base, closed: false, slots, leftySlots };
}

export type TrialInput = {
  name: string;
  nameKana?: string;
  phone?: string;
  email?: string;
  date: string;
  start: string;
  lefty?: boolean;
  experience?: string;
  message?: string;
  consent: boolean;
  /** 流入元タグ（広告・SNSのURL ?src=）。英数とハイフン/アンダースコアのみ許可 */
  src?: string;
};

export type TrialResult =
  | {
      ok: true;
      id: string;
      cancelToken: string;
      date: string;
      start: string;
      end: string;
      bayName: string;
      minutes: number;
    }
  | { ok: false; error: string };

/** 流入元タグを source 列の値へ（不正値は無視して従来どおり web-self） */
function trialSource(src?: string): string {
  const s = (src ?? "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(s) ? `web-self:${s}` : "web-self";
}

/** 体験を即時確定する */
export async function createTrialBooking(input: TrialInput): Promise<TrialResult> {
  const admin = createAdmin();

  const name = input.name?.trim() ?? "";
  if (!name) return { ok: false, error: "お名前をご入力ください" };
  const phone = input.phone?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  if (!phone && !email) return { ok: false, error: "電話番号またはメールアドレスのいずれかをご入力ください" };
  if (phone && phone.replace(/\D/g, "").length < 10) return { ok: false, error: "電話番号をご確認ください" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "メールアドレスをご確認ください" };
  if (!input.consent) return { ok: false, error: "個人情報の取扱いへの同意が必要です" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "日付が不正です" };
  if (!/^\d{2}:\d{2}$/.test(input.start)) return { ok: false, error: "時刻が不正です" };

  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(input.date, cfg);
  if (!hours) return { ok: false, error: "この日は休業日です" };

  const s = toMin(input.start);
  const e = s + TRIAL_MINUTES;
  // 体験は毎時00分スタートのみ（画面を経由せず直接POSTされた場合の防波堤）
  if (s % TRIAL_START_STEP !== 0) return { ok: false, error: "体験のご予約は毎時00分開始のみ承っています" };
  if (s < toMin(hours.open) || e > toMin(hours.close)) return { ok: false, error: "営業時間外です" };

  const today = jstToday();
  if (input.date < today) return { ok: false, error: "過去の日付は予約できません" };
  const range = bookableRange(cfg);
  if (input.date < range.min) return { ok: false, error: `ご予約は ${range.min.replace(/-/g, "/")} 以降で承ります` };
  if (input.date > range.max) return { ok: false, error: `ご予約は ${range.max.replace(/-/g, "/")} までの日付で承ります` };

  // 同じ連絡先で、これから先の体験がすでに確定していないか（重複申込・いたずら対策）
  if (phone || email) {
    const dup = admin
      .from("mbr_trial_requests")
      .select("id, booked_date")
      .eq("status", "confirmed")
      .gte("booked_date", today)
      .is("deleted_at", null);
    const { data: existing } = await (phone ? dup.eq("phone", phone) : dup.eq("email", email));
    if ((existing ?? []).length > 0) {
      return {
        ok: false,
        error: "すでに体験のご予約をお受けしています。日程の変更は、確定メッセージのキャンセルリンクからお願いいたします。",
      };
    }
  }

  const lefty = Boolean(input.lefty);
  const [bays, busy] = await Promise.all([trialBays(admin), busyByBay(admin, input.date)]);
  if (bays.length === 0) return { ok: false, error: "ただいま体験のご予約を承れません。お手数ですが店舗までご連絡ください。" };

  const bay = pickBay(bays, busy, s, e, lefty);
  if (!bay) {
    return {
      ok: false,
      error: lefty
        ? "その時間の左右打席はふさがってしまいました。別の時間をお選びください。"
        : "その時間はふさがってしまいました。別の時間をお選びください。",
    };
  }

  const cancelToken = crypto.randomUUID().replace(/-/g, "");
  const endTime = toTime(e);

  const { data: req, error: reqErr } = await admin
    .from("mbr_trial_requests")
    .insert({
      company_id: bay.company_id,
      store_id: FRANK_STORE,
      name,
      name_kana: input.nameKana?.trim() || null,
      phone: phone || null,
      email: email || null,
      pref1: `${input.date} ${input.start}`, // 旧一覧との互換（第1希望欄に確定枠を入れる）
      experience: input.experience?.trim() || null,
      message: input.message?.trim() || null,
      consent_privacy: true,
      source: trialSource(input.src),
      status: "confirmed",
      booked_date: input.date,
      start_time: input.start,
      end_time: endTime,
      bay_id: bay.id,
      lefty,
      cancel_token: cancelToken,
    })
    .select("id")
    .single();
  if (reqErr || !req) return { ok: false, error: `ご予約の保存に失敗しました: ${reqErr?.message ?? "unknown"}` };

  const { error: bookErr } = await admin.from("frunk_bookings").insert({
    company_id: bay.company_id,
    store_id: FRANK_STORE,
    trial_request_id: req.id,
    customer_kind: "trial",
    bay_id: bay.id,
    booked_date: input.date,
    start_time: input.start,
    end_time: endTime,
    status: "confirmed",
    source: "trial",
    note: `体験レッスン（${name} 様${lefty ? "・レフティ" : ""}）`,
  });
  if (bookErr) {
    // 打席の確保に失敗したら申込も取り消す（画面だけ確定して席が無い、を作らない）
    await admin.from("mbr_trial_requests").update({ status: "canceled", deleted_at: new Date().toISOString() }).eq("id", req.id);
    const raced = /duplicate key|uq_frunk_booking_slot/i.test(bookErr.message);
    return { ok: false, error: raced ? "ちょうど今、その時間が埋まりました。別の時間をお選びください。" : `ご予約に失敗しました: ${bookErr.message}` };
  }

  await logEvent(bay.company_id, {
    event_type: "trial.booked",
    title: `体験予約が確定: ${name} 様 ${input.date} ${input.start}〜 ${bay.name}${lefty ? "（レフティ）" : ""}`,
    source: "web",
    source_type: "external",
    severity: "info",
  });

  // 確認メール（キャンセルURLの控え）。送信失敗しても予約は成立させる（#118）
  if (email) {
    const mail = buildTrialConfirmMail({
      name,
      date: input.date,
      start: input.start,
      end: endTime,
      bayName: bay.name,
      cancelToken,
    });
    await sendFrankMail({ to: email, ...mail });
  }

  return {
    ok: true,
    id: req.id,
    cancelToken,
    date: input.date,
    start: input.start,
    end: endTime,
    bayName: bay.name,
    minutes: TRIAL_LABEL_MINUTES,
  };
}

/** キャンセルトークンで予約内容を引く（キャンセル画面の表示用） */
export async function getTrialByToken(token: string) {
  if (!token) return null;
  const admin = createAdmin();
  const { data } = await admin
    .from("mbr_trial_requests")
    .select("id, name, booked_date, start_time, end_time, status, lefty, frunk_bays(name)")
    .eq("cancel_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const bay = (data as unknown as { frunk_bays: { name: string } | null }).frunk_bays;
  return {
    name: String(data.name),
    date: String(data.booked_date ?? ""),
    start: String(data.start_time ?? "").slice(0, 5),
    end: String(data.end_time ?? "").slice(0, 5),
    status: String(data.status),
    bayName: bay?.name ?? "",
  };
}

/** お客様によるキャンセル（トークンのみで実行できる＝ログイン不要） */
export async function cancelTrialByToken(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: "キャンセル用のリンクが不正です" };
  const admin = createAdmin();
  const { data: req } = await admin
    .from("mbr_trial_requests")
    .select("id, company_id, name, booked_date, start_time, status")
    .eq("cancel_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!req) return { ok: false, error: "ご予約が見つかりません" };
  if (req.status === "canceled") return { ok: true };
  if (req.status === "done") return { ok: false, error: "この体験は受講済みのため、キャンセルできません" };

  await admin.from("mbr_trial_requests").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", req.id);
  await admin
    .from("frunk_bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("trial_request_id", req.id)
    .neq("status", "cancelled");

  await logEvent(String(req.company_id), {
    event_type: "trial.cancelled",
    title: `体験予約がキャンセル: ${req.name} 様 ${req.booked_date} ${String(req.start_time).slice(0, 5)}〜`,
    source: "web",
    source_type: "external",
    severity: "info",
  });
  return { ok: true };
}
