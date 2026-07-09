/*
 * report-os / build-data.mjs
 * パイプライン[1][2]: Supabase から数値を集め、Claude API で文章を下書きし、
 * generate.js が読む data JSON を出力する。
 *
 * 使い方:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... ANTHROPIC_API_KEY=... \
 *   node build-data.mjs <company_id> <YYYY-MM> [現場メモ.txt]
 *
 * 依存: npm i @supabase/supabase-js @anthropic-ai/sdk
 * 現状 物販売上/フィッティング/会員推移テーブルは未整備（SYSTEM.md §4）。
 * 該当データが無い月は代表値ではなく null を入れ、"要入力" として資料に出す運用にする。
 */
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const [companyId, ym, memoPath] = process.argv.slice(2);
if (!companyId || !ym) { console.error("usage: node build-data.mjs <company_id> <YYYY-MM> [memo.txt]"); process.exit(1); }

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const prevYear = (m) => { const [y, mo] = m.split("-"); return `${+y - 1}-${mo}`; };

// --- 1. KPI数値をkpisテーブルから取得（current + trendから前月/前年を復元） ---
async function loadKpis() {
  const { data: rows } = await sb.from("kpis").select("code,current_value,trend").eq("company_id", companyId);
  const byCode = Object.fromEntries((rows || []).map((r) => [r.code, r]));
  const fromTrend = (code, m) => {
    const t = byCode[code]?.trend || [];
    const hit = t.find((e) => (e.date || "").startsWith(m));
    return hit ? Number(hit.value) : null;
  };
  const kpi = (code, label, unit) => ({
    label, unit,
    current: byCode[code]?.current_value != null ? Number(byCode[code].current_value) : null,
    prevMonth: fromTrend(code, prevMonth(ym)),
    prevYear: fromTrend(code, prevYear(ym)),
  });
  // 体験/フィッティングは一時利用者名簿(mbr_walkin_visits)が正（予約一覧は不使用）
  const trial = await walkinCount("trial", "体験（一時利用）");
  const fitting = await walkinCount("fitting", "フィッティング");
  const conversion = await conversionRate();
  return {
    members: await computeMembers(byCode), // 正会員ルール（SYSTEM.md §4-A）
    trialBookings: trial,
    conversionRate: conversion,
    churnRate: kpi("churn_rate", "退会率", "%"),
    retailSales: { label: "物販売上", unit: "円", current: null, prevMonth: null, prevYear: null, pending: "物販ソース未確定" }, // TODO 物販ソース
    fittings: fitting,
    staff: kpi("active_staff", "在籍スタッフ", "人"),
  };
}

// --- 1c. 体験/フィッティング（mbr_walkin_visits, visit_type別・月次） ---
const monStart = (m) => `${m}-01`;
const monNext = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10); };
async function walkinMonthCount(vt, m) {
  const { count } = await sb.from("mbr_walkin_visits").select("*", { count: "exact", head: true })
    .eq("company_id", companyId).eq("visit_type", vt).gte("visited_on", monStart(m)).lt("visited_on", monNext(m));
  return count; // 未取込なら 0 / null
}
async function walkinCount(vt, label) {
  const cur = await walkinMonthCount(vt, ym);
  // データ0件＝未取込とみなし pending 表示（取込済みで実0のケースは稀）
  if (!cur) return { label, unit: "件", current: null, prevMonth: null, prevYear: null, pending: "一時利用者名簿の取込待ち" };
  return { label, unit: "件", current: cur, prevMonth: await walkinMonthCount(vt, prevMonth(ym)), prevYear: await walkinMonthCount(vt, prevYear(ym)) };
}
// 入会率＝会員名簿の当月入会数(mbr_members.join_date) ÷ 一時利用の当月体験数(mbr_walkin_visits.trial)
// ※会員名簿の入会には体験非経由の直接入会も含むため100%を超えることがある（ユーザー定義, 2026-07）。
async function convRateForMonth(m) {
  const { count: trial } = await sb.from("mbr_walkin_visits").select("*", { count: "exact", head: true })
    .eq("company_id", companyId).eq("visit_type", "trial").gte("visited_on", monStart(m)).lt("visited_on", monNext(m));
  if (!trial) return null;
  const { count: joins } = await sb.from("mbr_members").select("*", { count: "exact", head: true })
    .eq("company_id", companyId).gte("join_date", monStart(m)).lt("join_date", monNext(m));
  return Math.round(((joins || 0) / trial) * 1000) / 10;
}
async function conversionRate() {
  const cur = await convRateForMonth(ym);
  if (cur == null) return { label: "入会率(入会/体験)", unit: "%", current: null, prevMonth: null, prevYear: null, pending: "一時利用者名簿の取込待ち" };
  return { label: "入会率(入会/体験)", unit: "%", current: cur, prevMonth: await convRateForMonth(prevMonth(ym)), prevYear: await convRateForMonth(prevYear(ym)) };
}

// --- 1d. 打席稼働・パーソナル（mbr_reservations, キャンセル除外） ---
// 予約一覧の体験/フィッティング数はキャンセル未削除で不正確なため使わない。打席稼働・パーソナル監視のみ。
async function loadReservationsOps() {
  const inMonth = (q) => q.eq("company_id", companyId).gte("lesson_date", monStart(ym)).lt("lesson_date", monNext(ym)).not("status", "ilike", "%キャンセル%");
  const { count: personal } = await inMonth(sb.from("mbr_reservations").select("*", { count: "exact", head: true }).ilike("program_type", "%パーソナル%"));
  const { count: total } = await inMonth(sb.from("mbr_reservations").select("*", { count: "exact", head: true }));
  return { personal: personal ?? null, reservations: total ?? null }; // 打席稼働率は打席数×営業日で別途
}

// --- 1b. 会員数（正会員ルール, SYSTEM.md §4-A） ---
// モニター/スタッフ/法人二枚目/トライアルを除外、当月末退会者は当月に含めない。
// mbr_members から算出（推奨: report_member_counts RPCを用意し月末在籍・当月異動・除外内訳を返す）。
// 会員名簿の会員種類名どおり（会員名簿_20260707で確定）
const EXCLUDE_TYPES = ["スタッフ", "モニター会員", "法人会員2枚目", "トライアル会員"];
async function computeMembers(byCode) {
  const endOf = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo, 0).toISOString().slice(0, 10); };
  const monthStart = (m) => `${m}-01`;
  const nextMonth = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo, 1); return d.toISOString().slice(0, 10); };
  const activeCount = async (end) => {
    const { count } = await sb.from("mbr_members").select("*", { count: "exact", head: true })
      .eq("company_id", companyId).not("member_type", "in", `(${EXCLUDE_TYPES.join(",")})`)
      .lte("join_date", end).or(`leave_date.is.null,leave_date.gt.${end}`);
    return count ?? null;
  };
  // 当月末在籍がゼロ（名簿未取込）なら kpis の集計値にフォールバック
  const current = await activeCount(endOf(ym));
  const fallback = byCode["members"]?.current_value != null ? Number(byCode["members"].current_value) : null;
  const { count: leavers } = await sb.from("mbr_members").select("*", { count: "exact", head: true })
    .eq("company_id", companyId).gte("leave_date", monthStart(ym)).lt("leave_date", nextMonth(ym));
  const { count: newJoins } = await sb.from("mbr_members").select("*", { count: "exact", head: true })
    .eq("company_id", companyId).gte("join_date", monthStart(ym)).lt("join_date", nextMonth(ym));
  const { data: exRows } = await sb.from("mbr_members").select("member_type")
    .eq("company_id", companyId).in("member_type", EXCLUDE_TYPES)
    .or(`leave_date.is.null,leave_date.gt.${endOf(ym)}`);
  const exCount = {};
  (exRows || []).forEach((r) => (exCount[r.member_type] = (exCount[r.member_type] || 0) + 1));
  return {
    label: "会員数（正会員）", unit: "人",
    current: current || fallback,
    prevMonth: await activeCount(endOf(prevMonth(ym))) || null,
    prevYear: await activeCount(endOf(prevYear(ym))) || null,
    newJoins: newJoins ?? null, leavers: leavers ?? null,
    excluded: EXCLUDE_TYPES.map((t) => ({ label: t, v: exCount[t] || 0 })),
    rule: "会員数（正会員）＝会員名簿の在籍から、会員種類名「スタッフ」「モニター会員」「法人会員2枚目」「トライアル会員」を除外。当月末退会者は当月の会員数に含めない。表記は会員名簿の会員種類名どおり。",
  };
}

// --- 2. Claude APIで文章を下書き ---
async function draftNarrative(kpi, memo) {
  const prompt = `あなたはGOLF WING（宝塚・インドアゴルフ）の運営を熟知したCEO秘書です。
以下の当月KPIと現場メモから、月次報告資料の文章を作成してください。数値は断定的な創作をせず、与えられた数値と現場メモの範囲で書くこと。

# 当月KPI(${ym})
${JSON.stringify(kpi, null, 2)}

# 現場メモ
${memo || "(なし)"}

# 出力(JSONのみ、前置き不要)
{
  "activities": ["月間の実施事項を3-5件"],
  "problems": ["問題点を2-4件"],
  "plans": ["problemsと同数・同順で、各問題への実施予定/解決策"],
  "shareInfo": ["その他の情報共有を2-4件"]
}`;
  const res = await ai.messages.create({
    model: "claude-sonnet-5", max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const txt = res.content.map((c) => c.text || "").join("");
  return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
}

// --- 3. 月次推移(12ヶ月) ---
async function loadTrend(code) {
  const { data } = await sb.from("kpis").select("trend").eq("company_id", companyId).eq("code", code).single();
  const t = (data?.trend || []).slice(-12);
  return t.map((e) => ({ m: (e.date || "").slice(2, 7).replace("-", "/"), v: Number(e.value) }));
}

const kpi = await loadKpis();
const memo = memoPath && fs.existsSync(memoPath) ? fs.readFileSync(memoPath, "utf8") : "";
const narrative = await draftNarrative(kpi, memo);
const out = {
  meta: { business: "GOLF WING", businessSub: "尼崎インドアゴルフ", company: "株式会社YOZAN",
    monthLabel: `${ym.split("-")[0]}年${+ym.split("-")[1]}月`, month: ym,
    author: "CEO AI 秘書 (YOZAN GENESIS)" },
  kpi, memberTrend: await loadTrend("members"), retailTrend: [], narrative,
};
const path = `data/golfwing-${ym}.json`;
fs.writeFileSync(path, JSON.stringify(out, null, 2));
console.log("data生成:", path, "→ node generate.js", path);
