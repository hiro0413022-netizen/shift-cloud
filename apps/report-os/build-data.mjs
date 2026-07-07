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
  // v_rpt_monthly（§4-B, 未整備なら null）から物販/フィッティング
  const { data: rpt } = await sb.from("v_rpt_monthly").select("ym,retail_sales,fittings")
    .eq("company_id", companyId).in("ym", [`${ym}-01`, `${prevMonth(ym)}-01`, `${prevYear(ym)}-01`]).maybeSingle?.() ?? { data: null };
  return {
    members: await computeMembers(byCode), // 正会員ルール（SYSTEM.md §4-A）
    trialBookings: kpi("trial_bookings", "体験予約数", "件"),
    conversionRate: kpi("conversion_rate", "入会率", "%"),
    churnRate: kpi("churn_rate", "退会率", "%"),
    retailSales: { label: "物販売上", unit: "円", current: null, prevMonth: null, prevYear: null }, // TODO §4-B
    fittings: { label: "フィッティング", unit: "件", current: null, prevMonth: null, prevYear: null }, // TODO §4-B
    staff: kpi("active_staff", "在籍スタッフ", "人"),
  };
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
    rule: "正会員＝総名簿からモニター・スタッフ・法人二枚目・トライアルを除外。当月末退会者は当月の会員数に含めない。",
  };
}

// --- 2. Claude APIで文章を下書き ---
async function draftNarrative(kpi, memo) {
  const prompt = `あなたはGOLF WING（尼崎インドアゴルフ）の運営を熟知したCEO秘書です。
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
