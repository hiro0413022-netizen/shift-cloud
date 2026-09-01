"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";

const SITE = "frank-golf";

async function getRow(admin: ReturnType<typeof createAdmin>) {
  const { data } = await admin.from("gn_site_content").select("id, company_id, data, news").eq("site", SITE).single();
  if (!data) throw new Error("gn_site_content: frank-golf 行がありません（migration 0080）");
  return data;
}

/** 基本情報（営業時間・電話・特典など）の保存 */
export async function saveBasics(formData: FormData): Promise<void> {
  const admin = createAdmin();
  const row = await getRow(admin);
  const data = (row.data ?? {}) as Record<string, Record<string, unknown>>;
  const put = (section: string, key: string, v: string) => {
    const val = v.trim();
    data[section] = data[section] ?? {};
    if (val === "") delete data[section][key];
    else data[section][key] = val;
  };
  put("store", "hours", String(formData.get("hours") ?? ""));
  put("store", "holiday", String(formData.get("holiday") ?? ""));
  put("store", "tel", String(formData.get("tel") ?? ""));
  put("store", "parking", String(formData.get("parking") ?? ""));
  const benefits = String(formData.get("benefits") ?? "").trim();
  data.preopen = data.preopen ?? {};
  if (benefits === "") delete data.preopen.benefits;
  else data.preopen.benefits = benefits.split(/[、,]/).map((s) => s.trim()).filter(Boolean);

  await admin.from("gn_site_content").update({ data, updated_at: new Date().toISOString() }).eq("id", row.id);
  await logEvent(String(row.company_id), {
    event_type: "site.updated",
    title: "FRANK GOLF サイト基本情報を更新",
    source: "site_admin",
    source_type: "human",
  });
  revalidatePath("/site-admin");
}

/** お客様が選べる利用時間。空・不正なら 60/120 に戻す */
function memberMinutes(raw: string): number[] {
  const list = raw
    .split(/[、,\s]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 15 && n <= 240);
  return list.length > 0 ? Array.from(new Set(list)).sort((a, b) => a - b) : [60, 120];
}

/** パーソナルレッスンの料金（0＝受付を止める） */
function lessonPrice(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 2500;
}

/** 予約設定（#87: 営業時間・定休日・祝日・臨時休業・予約可能日数） */
export async function saveBookingCfg(formData: FormData): Promise<void> {
  const admin = createAdmin();
  const row = await getRow(admin);
  const data = (row.data ?? {}) as Record<string, unknown>;
  const t = (k: string) => String(formData.get(k) ?? "").trim();
  const dates = (k: string) => t(k).split(/[、,\s]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const dows = t("closed_dows").split(/[、,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  data.booking = {
    // open_date / open_time など、このフォームに無いキーを消さない（#118）
    ...((data.booking as Record<string, unknown> | undefined) ?? {}),
    weekday: { open: t("wd_open") || "10:00", close: t("wd_close") || "21:00" },
    weekend: { open: t("we_open") || "08:00", close: t("we_close") || "20:00" },
    closed_dows: dows.length > 0 ? dows : [2],
    slot_minutes: [15, 30, 60].includes(Number(t("slot"))) ? Number(t("slot")) : 30,
    max_minutes_options: [30, 60, 90, 120],
    // お客様側（frankgolf.jp の打席予約）の刻み。スタッフの30分刻みとは別に持つ（2026-09-01）
    member_start_step: [30, 60].includes(Number(t("member_start_step"))) ? Number(t("member_start_step")) : 60,
    member_minutes_options: memberMinutes(t("member_minutes_options")),
    lesson_option: {
      enabled: lessonPrice(t("lesson_option_price")) > 0,
      minutes: 25,
      price: lessonPrice(t("lesson_option_price")),
    },
    holiday_dates: dates("holiday_dates"),
    closed_dates: dates("closed_dates"),
    special_open_dates: dates("special_open_dates"),
    advance_days: Math.min(60, Math.max(1, Number(t("advance_days")) || 14)),
  };
  await admin.from("gn_site_content").update({ data, updated_at: new Date().toISOString() }).eq("id", row.id);
  await logEvent(String(row.company_id), {
    event_type: "site.updated",
    title: "FRANK GOLF 予約設定を更新（営業時間・休業日）",
    source: "site_admin",
    source_type: "human",
  });
  revalidatePath("/site-admin");
}

/** お知らせ追加 */
export async function addNews(formData: FormData): Promise<void> {
  const admin = createAdmin();
  const row = await getRow(admin);
  const news = Array.isArray(row.news) ? (row.news as Record<string, unknown>[]) : [];
  const item = {
    date: String(formData.get("date") ?? "").trim() || new Date().toISOString().slice(0, 10),
    tag: String(formData.get("tag") ?? "お知らせ").trim() || "お知らせ",
    title: String(formData.get("title") ?? "").trim(),
    url: String(formData.get("url") ?? "").trim() || null,
  };
  if (!item.title) return;
  news.unshift(item);
  await admin.from("gn_site_content").update({ news: news.slice(0, 20), updated_at: new Date().toISOString() }).eq("id", row.id);
  revalidatePath("/site-admin");
}

/** お知らせ削除（index指定） */
export async function deleteNews(formData: FormData): Promise<void> {
  const admin = createAdmin();
  const row = await getRow(admin);
  const idx = Number(formData.get("index"));
  const news = Array.isArray(row.news) ? (row.news as Record<string, unknown>[]) : [];
  if (Number.isInteger(idx) && idx >= 0 && idx < news.length) {
    news.splice(idx, 1);
    await admin.from("gn_site_content").update({ news, updated_at: new Date().toISOString() }).eq("id", row.id);
  }
  revalidatePath("/site-admin");
}

/** 上級者向け: dataオーバーライドJSONの直接編集 */
export async function saveRawJson(formData: FormData): Promise<void> {
  const admin = createAdmin();
  const row = await getRow(admin);
  const raw = String(formData.get("json") ?? "").trim();
  let parsed: unknown;
  try {
    parsed = raw === "" ? {} : JSON.parse(raw);
  } catch {
    throw new Error("JSONの形式が正しくありません");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSONオブジェクトを指定してください");
  await admin.from("gn_site_content").update({ data: parsed, updated_at: new Date().toISOString() }).eq("id", row.id);
  revalidatePath("/site-admin");
}
