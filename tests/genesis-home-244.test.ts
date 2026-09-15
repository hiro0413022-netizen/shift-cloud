import test from "node:test";
import assert from "node:assert/strict";
import { NAV_GROUPS, NAV_ITEMS, searchNav, groupOfPath, normalizeQuery } from "../apps/genesis/src/lib/nav.ts";
import { stalledFromFailedActions, stalledFromMail, stalledFromCron, sortStalled } from "../apps/genesis/src/lib/stalled-pure.ts";
import { remainingPerDay, daysLeftInMonth, changesLine, parsePanelKey, panelKey, drillMetricOfKpi } from "../apps/genesis/src/lib/home-pure.ts";
import { detectScreenCommand, detectStoreAlias, NAV_MAP, findNav } from "../apps/genesis/src/lib/jarvis-pure.ts";
import { launcherCards } from "../apps/genesis/src/lib/store-links.ts";

/* ============================================================
   GENESIS UI 大改修（#244・2026-09-15）の純粋な部分を固定する。
   ユーザー指摘「見にくい」「情報を取りに行きにくい」への対策が、
   次の改修で黙って壊れないように。
   ============================================================ */

test("メニュー: 旧29画面が7グループのどれかに必ず入っている（URLは1つも捨てない）", () => {
  const OLD = [
    "/", "/chat", "/agents", "/finance", "/command", "/ai-sales", "/suggestions", "/directives", "/executions",
    "/approvals", "/inbox", "/deliverables", "/incidents", "/notes", "/notice", "/legal", "/reserve", "/library",
    "/network", "/memories", "/decisions", "/events", "/dev-requests", "/dev", "/future", "/connectors",
    "/site-admin", "/vault", "/accounts",
  ];
  const hrefs = new Set(NAV_ITEMS.map((i) => i.href));
  for (const h of OLD) assert.ok(hrefs.has(h), `${h} がメニューから消えている`);
  assert.equal(NAV_GROUPS.length, 7);
  // 同じ href が2つのグループに入っていない
  assert.equal(hrefs.size, NAV_ITEMS.length);
});

test("メニュー: pathname からグループが決まる（/dev と /dev-requests を混同しない）", () => {
  assert.equal(groupOfPath("/"), "home");
  assert.equal(groupOfPath("/dev"), "settings");
  assert.equal(groupOfPath("/dev-requests"), "settings");
  assert.equal(groupOfPath("/finance"), "numbers");
  assert.equal(groupOfPath("/inbox"), "customers");
  assert.equal(groupOfPath("/stores?store=x"), "customers");
  assert.equal(groupOfPath("/command"), "approve");
});

test("Ctrl K の画面検索: 画面名・言い換え・ひらがな・大文字小文字で当たる", () => {
  assert.equal(normalizeQuery("けいやく Sho"), "ケイヤクsho");
  assert.equal(searchNav("契約")[0]?.href, "/legal");
  assert.equal(searchNav("パスワード")[0]?.href, "/vault");
  assert.equal(searchNav("うりあげ").some((i) => i.href === "/finance"), true);
  assert.equal(searchNav("受付台帳")[0]?.href, "/stores");
  assert.deepEqual(searchNav(""), []);
});

test("止まっているもの: LINE の月上限（429）はプラン変更の案内になる", () => {
  const items = stalledFromFailedActions([
    { action_type: "staff_directive", error: 'LINE API message/push HTTP 429 {"message":"You have reached your monthly limit."}', count: 4, last: null },
  ]);
  assert.equal(items.length, 1);
  assert.match(items[0].title, /朝の連絡/);
  assert.match(items[0].detail, /200通/);
  assert.equal(items[0].fix.external, true);
  assert.equal(items[0].severity, "danger");
});

test("止まっているもの: その他の失敗は AI自動実行 へ／0件は出ない", () => {
  const items = stalledFromFailedActions([
    { action_type: "sns_post", error: "IG token expired", count: 2, last: null },
    { action_type: "report_generate", error: null, count: 0, last: null },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].fix.href, "/executions");
});

test("止まっているもの: RESEND_API_KEY が無いときは1件で、件数がキーに入る", () => {
  const a = stalledFromMail({ hasResendKey: false, failedMails7d: 19 });
  assert.equal(a.length, 1);
  assert.match(a[0].detail, /19 件/);
  assert.equal(stalledFromMail({ hasResendKey: true, failedMails7d: 0 }).length, 0);
  const b = stalledFromMail({ hasResendKey: true, failedMails7d: 3 });
  assert.equal(b[0].key, "stalled::mail::failed::3");
});

test("止まっているもの: 日次レポートは36時間止まったら出る・並びは danger が上", () => {
  const now = new Date("2026-09-15T09:00:00+09:00");
  assert.equal(stalledFromCron({ lastDailyReportAt: "2026-09-15T06:00:00+09:00", now }).length, 0);
  const late = stalledFromCron({ lastDailyReportAt: "2026-09-12T06:00:00+09:00", now });
  assert.equal(late.length, 1);
  assert.match(late[0].title, /3 日/);
  const sorted = sortStalled([...late, ...stalledFromMail({ hasResendKey: false, failedMails7d: 0 })]);
  assert.equal(sorted[0].severity, "danger");
});

test("④ 目標までの残りを1日あたりに直す", () => {
  assert.equal(daysLeftInMonth("2026-09-15"), 16);
  assert.equal(daysLeftInMonth("2026-09-30"), 1);
  assert.equal(remainingPerDay({ code: "monthly_sales", value: 3_120_000, target: 3_700_000, unit: "円", today: "2026-09-15" }), "あと 58万円 ＝ 1日 約3.6万円");
  assert.equal(remainingPerDay({ code: "members", value: 219, target: 200, unit: "名", today: "2026-09-15" }), "目標 200名 達成");
  assert.equal(remainingPerDay({ code: "churn_rate", value: 1.4, target: 2, unit: "%", today: "2026-09-15" }), "目安 2% 以内");
  assert.equal(remainingPerDay({ code: "conversion_rate", value: 32, target: 40, unit: "%", today: "2026-09-15" }), "目標 40%（あと 8%）");
  assert.equal(remainingPerDay({ code: "members", value: null, target: 200, unit: "名", today: "2026-09-15" }), null);
});

test("② 変化の1行と ③ パネルキー", () => {
  const chips = changesLine({ joins: 2, trials: 3, leaves: 1, inquiries: 0, warnings: 0 });
  assert.deepEqual(chips.map((c) => c.label), ["入会", "体験申込", "退会の申出"]);
  assert.deepEqual(parsePanelKey(panelKey("join", "abc:def")), { source: "join", id: "abc:def" });
  assert.equal(parsePanelKey("nocolon"), null);
  assert.equal(drillMetricOfKpi("labor_cost_ratio"), "labor_cost");
  assert.equal(drillMetricOfKpi("unknown"), null);
});

test("声で画面を動かす: 会員数・店舗・やること・検索・画面名", () => {
  const a = detectScreenCommand("会員数を見せて");
  assert.equal(a?.kind, "drill");
  assert.equal(a?.href, "/?drill=members");

  const b = detectScreenCommand("フランクの売上を出して");
  assert.equal(b?.kind, "drill");
  assert.equal(b?.href, "/?drill=monthly_sales&alias=frank");

  const c = detectScreenCommand("ゴルフウィングの予約を開いて");
  assert.equal(c?.kind, "stores");
  assert.equal(c?.href, "/stores?alias=gw");

  const d = detectScreenCommand("やることを出して");
  assert.equal(d?.kind, "todo");

  const e = detectScreenCommand("山田さんを探して");
  assert.equal(e?.kind, "search");
  assert.equal(e?.kind === "search" ? e.q : "", "山田");

  const f = detectScreenCommand("契約・法務を開いて");
  assert.equal(f?.kind, "nav");
  assert.equal(f?.href, "/legal");

  // 数字の質問は拾わない（Ask Data に行く）
  assert.equal(detectScreenCommand("今月の売上は？"), null);
  assert.equal(detectScreenCommand("おはよう"), null);
  assert.equal(detectStoreAlias("姫路の体験"), "frank");
});

test("JARVIS の案内先に /todo と /stores がある", () => {
  assert.ok(findNav("/todo"));
  assert.ok(findNav("/stores"));
  assert.ok(NAV_MAP.length >= 25);
});

test("店舗の入口: FRANK には会員一覧、GOLF WING にはフィッティング申込が出る", () => {
  const f = launcherCards(true);
  const g = launcherCards(false);
  assert.ok(f.find((c) => c.key === "reception")?.links.some((l) => l.label === "FRANK会員"));
  assert.ok(g.find((c) => c.key === "reservations")?.links.some((l) => /フィッティング/.test(l.label)));
  for (const c of [...f, ...g]) assert.ok(c.links.length >= 1 && /^https:\/\//.test(c.links[0].href));
});
