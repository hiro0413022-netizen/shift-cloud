/*
 * report-os / build-data.mjs
 * パイプライン[1][2]: Supabase(v_rpt_monthly)から数値を集め、Claude APIで文章を下書きし、
 * generate.js が読む data JSON を出力する。
 *
 * 使い方:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... ANTHROPIC_API_KEY=... \
 *   node build-data.mjs <company_id> <YYYY-MM> [現場メモ.txt]
 *   --no-ai を付けると文章下書きをスキップ（数値のみ・Claude API未使用）
 *
 * 依存: npm i @supabase/supabase-js @anthropic-ai/sdk
 * データソース(0047 / SYSTEM.md §3):
 *   会員数(正会員ルール §4-A) … report_member_counts() ← mbr_members(会員名簿)
 *   体験・フィッティング       … mbr_walkin_visits(一時利用者名簿)  ※予約一覧は使わない
 *   物販売上                   … rpt_retail_sales(売上データ 品目「販売」税込)
 *   すべて v_rpt_monthly に集約済み。
 */
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const NO_AI = process.argv.includes("--no-ai");
const argv = process.argv.slice(2).filter((a) => a !== "--no-ai");
const [companyId, ym, memoPath] = argv;
if (!companyId || !ym) {
  console.error("usage: node build-data.mjs <company_id> <YYYY-MM> [memo.txt] [--no-ai]");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// 除外4区分（SYSTEM.md §4-A。表記は会員名簿の会員種類名どおり）
const EXCLUDE_TYPES = ["スタッフ", "モニター会員", "法人会員2枚目", "トライアル会員"];
const MEMBER_RULE =
  "会員数（正会員）＝会員名簿の在籍から、会員種類名「スタッフ」「モニター会員」「法人会員2枚目」「トライアル会員」を除外。当月末退会者は当月の会員数に含めない。表記は会員名簿の会員種類名どおり。";

const ymAdd = (m, n) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const first = (m) => `${m}-01`;
const endOf = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const label = (m) => m.slice(2).replace("-", "/");
const round1 = (n) => Math.round(n * 10) / 10;

// --- 1. 月次数値（v_rpt_monthly を前年同月〜当月まとめて取得） ---
async function loadMonthly() {
  const { data, error } = await sb
    .from("v_rpt_monthly")
    .select("ym,members,new_joins,leavers,retail_sales,fittings,trials")
    .eq("company_id", companyId)
    .gte("ym", first(ymAdd(ym, -13)))
    .lte("ym", first(ym))
    .order("ym");
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [String(r.ym).slice(0, 7), r]));
}

// 正会員の種別内訳・除外区分の内訳（当月末在籍）
async function loadComposition() {
  const end = endOf(ym);
  const { data, error } = await sb
    .from("mbr_members")
    .select("member_type,join_date,leave_date")
    .eq("company_id", companyId);
  if (error) throw error;
  const active = (data || []).filter(
    (m) => m.join_date && m.join_date <= end && (!m.leave_date || m.leave_date > end)
  );
  const count = (rows) => {
    const c = {};
    rows.forEach((r) => (c[r.member_type] = (c[r.member_type] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  };
  return {
    composition: count(active.filter((m) => !EXCLUDE_TYPES.includes(m.member_type))).map(([t, v]) => ({ t, v })),
    excluded: EXCLUDE_TYPES.map((t) => ({ label: t, v: active.filter((m) => m.member_type === t).length })),
  };
}

function buildKpi(byYm, comp) {
  const cur = byYm[ym], pm = byYm[ymAdd(ym, -1)], py = byYm[ymAdd(ym, -12)];
  if (!cur) throw new Error(`${ym} のデータがありません（取込漏れ？）`);
  const pick = (r, f) => (r && r[f] != null ? Number(r[f]) : null);

  // 退会率＝当月退会者 ÷ (月末会員数＋当月退会者)
  const churn = (r) => {
    if (!r || r.members == null) return null;
    const lv = Number(r.leavers || 0);
    const base = Number(r.members) + lv;
    return base ? round1((lv / base) * 100) : 0;
  };
  // 入会率＝当月入会数 ÷ 当月体験数（体験非経由の直接入会も含むため100%超あり）
  const conv = (r) => (r && r.trials ? round1((Number(r.new_joins || 0) / Number(r.trials)) * 100) : null);

  return {
    members: {
      label: "会員数（正会員）", unit: "人",
      current: pick(cur, "members"), prevMonth: pick(pm, "members"), prevYear: pick(py, "members"),
      newJoins: pick(cur, "new_joins"), leavers: pick(cur, "leavers"),
      composition: comp.composition, excluded: comp.excluded, rule: MEMBER_RULE,
    },
    trialBookings: { label: "体験（一時利用）", unit: "件", current: pick(cur, "trials"), prevMonth: pick(pm, "trials"), prevYear: pick(py, "trials") },
    conversionRate: { label: "入会率(入会/体験)", unit: "%", current: conv(cur), prevMonth: conv(pm), prevYear: conv(py) },
    churnRate: { label: "退会率", unit: "%", current: churn(cur), prevMonth: churn(pm), prevYear: churn(py) },
    retailSales: {
      label: "物販売上", unit: "円",
      current: pick(cur, "retail_sales"), prevMonth: pick(pm, "retail_sales"), prevYear: pick(py, "retail_sales"),
      ...(cur.retail_sales == null ? { pending: "物販売上の取込待ち（rpt_retail_sales）" } : {}),
    },
    fittings: { label: "フィッティング", unit: "件", current: pick(cur, "fittings"), prevMonth: pick(pm, "fittings"), prevYear: pick(py, "fittings") },
    staff: { label: "在籍スタッフ", unit: "人", current: comp.excluded.find((e) => e.label === "スタッフ")?.v ?? null, prevMonth: null, prevYear: null },
  };
}

const trend = (byYm, field) =>
  Array.from({ length: 12 }, (_, i) => ymAdd(ym, -11 + i))
    .map((m) => ({ m: label(m), v: byYm[m]?.[field] != null ? Number(byYm[m][field]) : null }))
    .filter((e) => e.v != null);

// --- 2. Claude APIで文章を下書き（AIは下書きまで。人が承認するまで確定させない） ---
async function draftNarrative(kpi, memo) {
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

// --- 実行 ---
const byYm = await loadMonthly();
const comp = await loadComposition();
const kpi = buildKpi(byYm, comp);
const memo = memoPath && fs.existsSync(memoPath) ? fs.readFileSync(memoPath, "utf8") : "";
const narrative = NO_AI
  ? { activities: [], problems: [], plans: [], shareInfo: [] }
  : await draftNarrative(kpi, memo);

const out = {
  meta: {
    business: "GOLF WING", businessSub: "宝塚", company: "株式会社YOZAN",
    monthLabel: `${ym.split("-")[0]}年${+ym.split("-")[1]}月`, month: ym,
    author: "CEO AI 秘書 (YOZAN GENESIS)",
    note_data:
      "会員数・入会数・除外区分は会員名簿(mbr_members)、体験・フィッティングは一時利用者名簿(mbr_walkin_visits)、物販売上は売上データ(rpt_retail_sales・品目「販売」税込)。入会率＝当月入会数÷当月体験数（体験非経由の入会も含むため100%超あり）。会員推移・退会率は名簿の入会日/退会日の再構成のため、名簿から消えた過去の退会者を含まない参考値（過去月の退会率が0になることがある）。文章はAI下書き（要承認）。",
  },
  kpi,
  memberTrend: trend(byYm, "members"),
  retailTrend: trend(byYm, "retail_sales"),
  narrative,
};

const path = `data/golfwing-${ym}.json`;
fs.writeFileSync(path, JSON.stringify(out, null, 2));
console.log("data生成:", path, "→ node generate.js", path);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 