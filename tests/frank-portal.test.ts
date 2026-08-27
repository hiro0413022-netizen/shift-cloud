// FRANK 会員ポータル / QRチェックイン / モバイルオーダー（#154）
//
// ここが緩むと現場で起きること:
//   - トークンに記号や小文字が混ざる → 受付PCのキーボード配列で化けて「読めない会員証」になる
//   - normalizeCheckinScan が何でも通す → 卓上リーダーが読んだ商品バーコードでDBを引きに行く
//   - 明細の単価をメニューから都度引く → メニュー改定で過去の伝票の金額が変わる
import test from "node:test";
import assert from "node:assert/strict";
import {
  newCheckinToken,
  normalizeCheckinScan,
  CHECKIN_TOKEN_ALPHABET,
  CHECKIN_TOKEN_LENGTH,
  orderNo,
  buildOrderLines,
  orderNote,
  parseOrderNote,
  greetingLines,
  daysBetween,
  bayQrUrl,
  squareOrderIdempotencyKey,
  SQUARE_IDEMPOTENCY_MAX,
  type MenuItem,
} from "../packages/core/src/frank-portal.ts";

// --- トークン ---------------------------------------------------
test("トークンは数字＋英大文字のみ・16桁（キーボード配列で化けない文字種）", () => {
  for (let i = 0; i < 200; i++) {
    const t = newCheckinToken();
    assert.equal(t.length, CHECKIN_TOKEN_LENGTH);
    assert.match(t, /^[0-9A-Z]+$/);
    for (const ch of t) assert.ok(CHECKIN_TOKEN_ALPHABET.includes(ch), `使わない文字が出た: ${ch}`);
  }
});

test("紛らわしい 0 O 1 I L は使わない（リーダー故障時にスタッフが読んで打つため）", () => {
  const joined = Array.from({ length: 200 }, () => newCheckinToken()).join("");
  for (const ch of "01OIL") assert.ok(!joined.includes(ch), `${ch} が混ざっている`);
});

test("同じトークンは出ない", () => {
  const set = new Set(Array.from({ length: 500 }, () => newCheckinToken()));
  assert.equal(set.size, 500);
});

// --- 読み取りの受け口 -------------------------------------------
test("小文字・前後の空白・全角空白は救済する", () => {
  const t = newCheckinToken();
  assert.equal(normalizeCheckinScan(` ${t.toLowerCase()} `), t);
  assert.equal(normalizeCheckinScan(`${t.slice(0, 8)}　${t.slice(8)}`), t);
});

test("自社トークンの形でないものは黙って捨てる（卓上リーダーは何でも読む）", () => {
  assert.equal(normalizeCheckinScan("4901234567894"), null);            // JANコード
  assert.equal(normalizeCheckinScan("https://example.com/x"), null);     // 他所のQR
  assert.equal(normalizeCheckinScan("FR0001"), null);                    // 会員番号そのもの
  assert.equal(normalizeCheckinScan(""), null);
  assert.equal(normalizeCheckinScan(null), null);
  assert.equal(normalizeCheckinScan(123456), null);
  assert.equal(normalizeCheckinScan("2".repeat(15)), null);              // 桁不足
  assert.equal(normalizeCheckinScan("2".repeat(17)), null);              // 桁超過
  assert.equal(normalizeCheckinScan("0".repeat(16)), null);              // 使わない文字
});

// --- 伝票番号 ---------------------------------------------------
test("伝票番号は月日＋当日連番", () => {
  assert.equal(orderNo("2026-08-26", 1), "0826-001");
  assert.equal(orderNo("2026-08-26", 14), "0826-014");
  assert.equal(orderNo("2026-12-01", 999), "1201-999");
});

test("Squareのnoteから伝票番号を取り出せる／関係ない決済は null", () => {
  assert.equal(parseOrderNote(orderNote("0826-014")), "0826-014");
  assert.equal(parseOrderNote("FRANK入会金"), null);
  assert.equal(parseOrderNote("FRANK入会初回一括"), null);
  assert.equal(parseOrderNote(null), null);
});

// --- 注文明細 ---------------------------------------------------
const coffee: MenuItem = { id: "m1", name: "コーヒー", category: "DRINK", price_general: 400, price_member: 300 };
const redbull: MenuItem = { id: "m2", name: "レッドブル", category: "DRINK", price_general: 500, price_member: 450 };
const soldout: MenuItem = { ...coffee, id: "m3", name: "炭酸水", sold_out: true };

test("会員価格と一般価格が切り替わる", () => {
  const m = buildOrderLines([{ item: coffee, qty: 2 }], "member");
  assert.equal(m.total, 600);
  const g = buildOrderLines([{ item: coffee, qty: 2 }], "general");
  assert.equal(g.total, 800);
});

test("明細には注文時点の品名と単価が入る（あとでメニューを直しても伝票は変わらない）", () => {
  const { lines } = buildOrderLines([{ item: redbull, qty: 1 }], "member");
  assert.deepEqual(lines[0], {
    menu_item_id: "m2", name: "レッドブル", price_kind: "member", unit_price: 450, qty: 1, amount: 450,
  });
});

test("売り切れと 0以下の数量は落とす", () => {
  const { lines, total } = buildOrderLines(
    [{ item: soldout, qty: 1 }, { item: coffee, qty: 0 }, { item: coffee, qty: -3 }, { item: coffee, qty: 1 }],
    "member",
  );
  assert.equal(lines.length, 1);
  assert.equal(total, 300);
});

// --- 声かけカード -----------------------------------------------
test("日数は暦日で数える", () => {
  assert.equal(daysBetween("2026-08-05", "2026-08-26"), 21);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
});

test("初来店・回数・間隔・誕生月が出る", () => {
  assert.deepEqual(
    greetingLines({ pastVisits: 0, lastVisitedOn: null, today: "2026-08-26", birthDate: null }),
    ["はじめてのご来店です"],
  );
  assert.deepEqual(
    greetingLines({ pastVisits: 2, lastVisitedOn: "2026-08-05", today: "2026-08-26", birthDate: "1988-08-14" }),
    ["3回目のご来店です", "前回から21日空いています", "今月がお誕生月です"],
  );
});

test("困ることが先に出て、3行を超えない", () => {
  const lines = greetingLines({
    pastVisits: 2,
    lastVisitedOn: "2026-08-01",
    today: "2026-08-26",
    birthDate: "1988-08-14",
    lessonToday: { startTime: "14:00", coach: "安東" },
    unpaidAmount: 2200,
    importantNote: "腰痛のため長時間は不可",
  });
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "⚠ 腰痛のため長時間は不可");
  assert.equal(lines[1], "未収 2,200円 のご案内");
  assert.equal(lines[2], "本日レッスン 14:00〜 安東コーチ");
});

test("間隔が空いていなければ「前回から」は出さない", () => {
  const lines = greetingLines({ pastVisits: 8, lastVisitedOn: "2026-08-25", today: "2026-08-26", birthDate: null });
  assert.deepEqual(lines, []);
});

// --- 打席QR -----------------------------------------------------
test("打席QRは会員/ビジターで分けない1本のURL", () => {
  assert.equal(bayQrUrl("https://my.frankgolf.jp/", "bay-1f-l"), "https://my.frankgolf.jp/bay/bay-1f-l");
});

// --- Square の冪等キー -------------------------------------------
// #161: 本番で「Field must not be greater than 45 length」が出て
//       モバイルオーダーの決済が1件も通らなかった。長さを固定する。
test("Squareの冪等キーは45文字を超えない（UUIDでも収まる）", () => {
  const uuid = "0123abcd-4567-89ef-0123-456789abcdef"; // 36文字
  const key = squareOrderIdempotencyKey(uuid);
  assert.ok(key.length <= SQUARE_IDEMPOTENCY_MAX, `${key.length}文字ある: ${key}`);
  assert.match(key, /^fo-/);
});

test("同じ注文IDなら毎回同じ冪等キー（二重課金しない）", () => {
  const uuid = "0123abcd-4567-89ef-0123-456789abcdef";
  assert.equal(squareOrderIdempotencyKey(uuid), squareOrderIdempotencyKey(uuid));
  assert.notEqual(squareOrderIdempotencyKey(uuid), squareOrderIdempotencyKey(uuid.replace("0123a", "9999a")));
});
