/**
 * P3-a の Skill 3本（#294）。どれも「既存 Tool を手順で束ねる」だけで、新しい業務ロジックは持たない。
 *   skill.morning_briefing … 朝の一枚（今日の予約・体制・未対応・待ち・システム死活）
 *   skill.trial_followup   … 体験後フォロー漏れの洗い出し＋スタッフへの依頼文（送信は message.send＝承認）
 *   skill.executive_report … 経営者向けの月次まとめ（売上・事業別PL・会員数・体験の流入元・経費）
 *
 * 数字はすべて Tool（＝gnv_* ビュー）が出す。summarize は Step の出力を文字列にするだけで LLM を使わない。
 */
import { defineSkill, skillToTool, stepRows, stepOut } from "../skill.ts";
import type { ToolContract } from "../tool.ts";
import { addDays } from "../tools/_shared.ts";

const yen = (n: unknown) => `${Math.round(Number(n ?? 0)).toLocaleString("ja-JP")}円`;

export const morningBriefing = defineSkill({
  name: "skill.morning_briefing",
  version: 1,
  domain: "ops",
  description: "朝の一枚: 今日の予約・今日の体制（シフト）・未対応の問い合わせ・待っているもの・システムの健全性をまとめて出す。「今日の状況」「朝の確認」はこれ",
  input: { type: "object", properties: { date: { type: "string", format: "date", description: "省略時は今日" } } },
  permission: [],
  steps: (input, ctx) => {
    const date = typeof input.date === "string" ? input.date : ctx.time.jstDate;
    return [
      { key: "bookings", title: "今日の予約", tool: "booking.list@1", input: { date, days: 1 } },
      { key: "shifts", title: "今日の体制", tool: "shift.view@1", input: { from: date, to: date } },
      { key: "inquiries", title: "未対応の問い合わせ", tool: "inquiries.open@1", input: { limit: 20 } },
      { key: "waiting", title: "待っているもの", tool: "waiting.list@1", input: {} },
      { key: "health", title: "システムの健全性", tool: "health.check@1", input: { hours: 24 } },
    ];
  },
  summarize: (steps) => {
    const b = stepRows(steps, "bookings").length;
    const s = stepRows(steps, "shifts").length;
    const q = stepRows(steps, "inquiries").length;
    const w = stepRows(steps, "waiting").length;
    const h = stepOut(steps, "health");
    return `予約 ${b} 件・出勤 ${s} 名・未対応の問い合わせ ${q} 件・待ち ${w} 件・システム ${h.ok === true ? "正常" : h.ok === false ? "要確認" : "未取得"}`;
  },
});

export const trialFollowup = defineSkill({
  name: "skill.trial_followup",
  version: 1,
  domain: "growth",
  description: "体験後のフォロー漏れを洗い出す: 直近の体験で入会も断りも記録が無い方を一覧にし、スタッフへの依頼文（下書き）を作る。送信は承認してから",
  input: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 60, default: 14, description: "何日前までの体験を見るか" } } },
  permission: ["use_reception", "view_hq"],
  steps: (input, ctx) => {
    const days = Number(input.days ?? 14);
    const today = ctx.time.jstDate;
    return [
      { key: "trials", title: `直近${days}日の体験`, tool: "trial.list@1", input: { from: addDays(today, -days), to: today } },
      { key: "sources", title: "流入元別の効き目", tool: "trials.by_source@1", input: { from: addDays(today, -days), to: addDays(today, 1) } },
    ];
  },
  summarize: (steps) => {
    const rows = stepRows(steps, "trials");
    const open = rows.filter((r) => !r.result || r.result === "pending" || r.result === "undecided");
    const noFollow = open.filter((r) => !r.follow_up_at);
    const names = noFollow.slice(0, 8).map((r) => `${r.guest_name ?? ""}（${String(r.visited_on ?? "").slice(5)}${r.store_name ? "・" + r.store_name : ""}）`).join("、");
    return `体験 ${rows.length} 件のうち結果未記録 ${open.length} 件、フォロー未入力 ${noFollow.length} 件${names ? "：" + names : ""}`;
  },
});

export const executiveReport = defineSkill({
  name: "skill.executive_report",
  version: 1,
  domain: "finance",
  description: "経営者向けの月次まとめ: 店舗別売上と目標残・事業別収支・在籍会員数・体験の流入元・直近の経費を一枚に。「今月の状況」「経営の数字」はこれ",
  input: { type: "object", properties: { month: { type: "string", pattern: "^\\d{4}-\\d{2}$", description: "YYYY-MM（省略時は今月）" } } },
  permission: ["view_hq"],
  rateLimit: { perMinute: 5 },
  steps: (input, ctx) => {
    const month = typeof input.month === "string" ? input.month : ctx.time.jstDate.slice(0, 7);
    const from = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    return [
      { key: "sales", title: "店舗別売上", tool: "sales.month@1", input: { month } },
      { key: "pl", title: "事業別収支", tool: "pl.segment@1", input: { month } },
      { key: "members", title: "在籍会員数", tool: "members.count@1", input: {} },
      { key: "trials", title: "体験の流入元", tool: "trials.by_source@1", input: { from, to } },
      { key: "expenses", title: "直近の経費", tool: "expenses.recent@1", input: { days: 30 } },
    ];
  },
  summarize: (steps) => {
    const sales = stepOut(steps, "sales");
    const members = stepRows(steps, "members").map((r) => `${r.store} ${Number(r.members ?? 0)}名`).join(" / ");
    const trials = stepRows(steps, "trials");
    const t = trials.reduce((s, r) => s + Number(r.trials ?? 0), 0);
    const j = trials.reduce((s, r) => s + Number(r.joined ?? 0), 0);
    const ex = stepOut(steps, "expenses");
    return `売上 ${yen(sales.total)}${sales.target != null ? `（目標 ${yen(sales.target)}）` : ""}・会員 ${members || "未取得"}・体験 ${t} 件→入会 ${j} 件・経費30日 ${yen(ex.total)}`;
  },
});

export const SKILL_TOOLS: ToolContract[] = [morningBriefing, trialFollowup, executiveReport].map((s) => skillToTool(s as never));
