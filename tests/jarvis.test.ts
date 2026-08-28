import test from "node:test";
import assert from "node:assert/strict";
import {
  toBriefing,
  openingLine,
  parseDecision,
  findNav,
  normalizePriority,
  NAV_MAP,
} from "../apps/genesis/src/lib/jarvis-pure.ts";

// ホームの対話AI（JARVIS・#182）。
// 「最初の一言」「AIの返事の読み取り」「案内先の検証」は壊れても静かに壊れるので、ここで固定する。

const KPIS = [
  { code: "monthly_sales", name: "月間売上", unit: "円", current_value: 4200000, target_value: 5000000 },
  { code: "members", name: "会員数", unit: "名", current_value: 512, target_value: 550 },
  { code: "churn_rate", name: "退会率", unit: "%", current_value: null, target_value: 2 },
  { code: "zzz_other", name: "関係ないKPI", unit: "件", current_value: 3, target_value: null },
];

function brief(over: Partial<Parameters<typeof toBriefing>[0]> = {}) {
  return toBriefing({
    name: "古川",
    score: 82,
    grade: "watch",
    factors: [],
    approvals: 0,
    feed: [],
    alerts: [],
    kpis: KPIS,
    recentEvents: [],
    today: "2026-08-28",
    ...over,
  });
}

/* ---------- ブリーフィング ---------- */

test("判断件数は 承認 + フィード + アラート。undo（実行予定の取消枠）は数えない", () => {
  const b = brief({
    approvals: 2,
    feed: [
      { source: "queue", tag: "配信", title: "LINE配信の承認" },
      { source: "undo", tag: "実行予定", title: "取り消せる予約実行" },
    ],
    alerts: [{ kind: "risk", title: "在庫が閾値割れ" }],
  });
  // 承認2 + フィード1（undoを除く） + アラート1 = 4
  assert.equal(b.decisionCount, 4);
});

test("先頭の判断は5件まで。アラートの種類は日本語のタグになる", () => {
  const b = brief({
    feed: [],
    alerts: [
      { kind: "risk", title: "A" },
      { kind: "blocker", title: "B" },
      { kind: "check", title: "C" },
    ],
  });
  assert.deepEqual(
    b.topDecisions.map((t) => t.tag),
    ["リスク", "ブロッカー", "確認"]
  );
});

test("KPIは5大KPIの順に並び、一覧に無いコードは喋らせない", () => {
  const b = brief();
  assert.deepEqual(b.kpis.map((k) => k.code), ["monthly_sales", "members", "churn_rate"]);
  assert.equal(b.kpis.find((k) => k.code === "zzz_other"), undefined);
});

test("値が入っていないKPIは 0 にせず null のまま持つ（0件と未取得を混同しない）", () => {
  const b = brief();
  assert.equal(b.kpis.find((k) => k.code === "churn_rate")?.value, null);
});

/* ---------- 最初の一言 ---------- */

test("判断が無い日は「判断はありません」と言い切る", () => {
  const line = openingLine(brief(), 9);
  assert.match(line, /おはようございます、古川さん。/);
  assert.match(line, /全体スコアは82点/);
  assert.match(line, /本日の判断はありません/);
});

test("判断があるときは件数と、いちばん上の1件を読み上げる", () => {
  const b = brief({ approvals: 1, feed: [{ source: "queue", tag: "配信", title: "LINE配信の承認" }] });
  const line = openingLine(b, 20);
  assert.match(line, /おかえりなさい、古川さん。/);
  assert.match(line, /本日の判断は2件です/);
  assert.match(line, /「LINE配信の承認」/);
});

test("時間帯で挨拶が変わる（深夜・朝・日中・夜）", () => {
  const b = brief();
  assert.match(openingLine(b, 2), /夜分おそくまで/);
  assert.match(openingLine(b, 9), /おはようございます/);
  assert.match(openingLine(b, 14), /おつかれさまです/);
  assert.match(openingLine(b, 21), /おかえりなさい/);
});

/* ---------- AIの返事の読み取り ---------- */

test("素のJSONを読める", () => {
  const d = parseDecision('{"intent":"talk","reply":"承知しました。"}');
  assert.equal(d?.intent, "talk");
  assert.equal(d?.reply, "承知しました。");
});

test("コードフェンスや前置きが付いていても拾う", () => {
  const d = parseDecision('はい。\n```json\n{"intent":"data","question":"今月の売上"}\n```');
  assert.equal(d?.intent, "data");
  assert.equal(d?.question, "今月の売上");
});

test("知らない intent は捨てる（勝手な動作をさせない）", () => {
  assert.equal(parseDecision('{"intent":"deploy","reply":"出します"}'), null);
  assert.equal(parseDecision('{"reply":"intentが無い"}'), null);
});

test("JSONとして壊れていたら null（呼び出し側が生テキストを喋る）", () => {
  assert.equal(parseDecision("すみません、うまく答えられません"), null);
  assert.equal(parseDecision('{"intent":"talk", "reply":'), null);
  assert.equal(parseDecision(""), null);
});

/* ---------- 案内先の検証 ---------- */

test("一覧にある画面だけを案内する", () => {
  assert.equal(findNav("/finance")?.label, "数字");
  assert.equal(findNav(" /approvals ")?.label, "承認待ち");
});

test("一覧に無いURLは案内しない（AIが作った存在しない画面へ飛ばさない）", () => {
  assert.equal(findNav("/kpi-dashboard"), null);
  assert.equal(findNav("https://example.com"), null);
  assert.equal(findNav(undefined), null);
  assert.equal(findNav(123), null);
});

test("案内先はすべてアプリ内の絶対パス（外部URLを混ぜない）", () => {
  for (const n of NAV_MAP) assert.match(n.href, /^\/[a-z-]*$/);
});

/* ---------- 開発依頼の優先度 ---------- */

test("優先度は3つだけ。知らない値は normal に寄せる", () => {
  assert.equal(normalizePriority("urgent"), "urgent");
  assert.equal(normalizePriority("low"), "low");
  assert.equal(normalizePriority("最優先"), "normal");
  assert.equal(normalizePriority(undefined), "normal");
});
