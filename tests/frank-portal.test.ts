// FRANK 会員ポータル / QRチェックイン / モバイルオーダー（#154）
//
// ここが緩むと現場で起きること:
//   - トークンに記号や小文字が混ざる → 受付PCのキーボード配列で化けて「読めない会員証」になる
//   - normalizeCheckinScan が何でも通す → 卓上リーダーが読んだ商品バーコードでDBを引きに行く
//   - 明細の単価をメニューから都度引く → メニュー改定で過去の伝票の金額が変わる
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECKIN_TOKEN_ALPHABET as TOKEN_ALPHABET,
  CHECKIN_TOKEN_LENGTH as TOKEN_LENGTH,
  isCheckinTokenShape,
} from "../packages/core/src/frank-token.ts";
import {
  newCheckinToken,
  normalizeCheckinScan,
  CHECKIN_TOKEN_ALPHABET,
  CHECKIN_TOKEN_LENGTH,
  orderNo,
  buildOrderLines,
  taxOf,
  withTax,
  FRANK_TAX_RATE,
  orderNote,
  parseOrderNote,
  greetingLines,
  daysBetween,
  bayQrUrl,
  hhmmToMin,
  visitClosed,
  VISIT_GRACE_MIN,
  VISIT_NO_BOOKING_MIN,
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

test("会員価格と一般価格が切り替わる（小計は税抜）", () => {
  const m = buildOrderLines([{ item: coffee, qty: 2 }], "member");
  assert.equal(m.subtotal, 600);
  const g = buildOrderLines([{ item: coffee, qty: 2 }], "general");
  assert.equal(g.subtotal, 800);
});

// --- 消費税（#166: 内税 → 外税） ---------------------------------
// メニューの価格は税抜の本体価格。請求するのは税込の total。
// ここが逆になると、お客様への請求額がそのままずれる。
test("300円のコーヒー1杯は 300 + 消費税30 = 330円を請求する", () => {
  const r = buildOrderLines([{ item: coffee, qty: 1 }], "member");
  assert.equal(r.subtotal, 300);
  assert.equal(r.tax, 30);
  assert.equal(r.total, 330);
  assert.equal(r.taxRate, FRANK_TAX_RATE);
  assert.equal(r.lines[0].unit_price, 300, "明細の単価は税抜のまま残す");
});

test("消費税は明細ごとではなく税抜合計に1回だけかける", () => {
  // 1個ずつ2回 と 2個まとめて で総額が変わってはいけない
  const once = buildOrderLines([{ item: coffee, qty: 2 }], "member").total;
  const twice = buildOrderLines([{ item: coffee, qty: 1 }], "member").total * 2;
  assert.equal(once, 660);
  assert.equal(twice, 660);
});

test("店内飲食なので税率は10%（軽減税率8%は持ち帰りの扱い）", () => {
  assert.equal(FRANK_TAX_RATE, 10);
});

test("端数は切り捨て、税率は差し替えられる（将来の税率改定に耐える）", () => {
  assert.equal(taxOf(333), 33);      // 33.3 → 33
  assert.equal(taxOf(1), 0);         // 0.1 → 0
  assert.equal(withTax(333), 366);
  assert.equal(taxOf(1000, 8), 80);
  assert.equal(withTax(1000, 8), 1080);
});

test("0円・不正値に税はかからない（0で割る/NaNを請求しない）", () => {
  assert.equal(taxOf(0), 0);
  assert.equal(taxOf(-100), 0);
  assert.equal(taxOf(Number.NaN), 0);
  assert.equal(withTax(0), 0);
});

test("何も選ばれていない注文は 0円のまま（空の注文に税だけ立てない）", () => {
  const r = buildOrderLines([], "member");
  assert.equal(r.subtotal, 0);
  assert.equal(r.tax, 0);
  assert.equal(r.total, 0);
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
  assert.equal(total, 330, "税込で返る（税抜300 + 消費税30）");
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

// --- 受付リーダーの読み取り（#162） -------------------------------
// トークンの「形」だけを frank-token.ts に切り出した。
// 受付画面（クライアント）が同じ定義を読むためで、コピーを作らないことが目的。
// ここが frank-portal.ts の再エクスポートと食い違うと、
// 画面の診断表示だけが嘘をつく（現場でいちばん困る壊れ方）ので固定しておく。
test("トークンの定義は frank-token.ts が正典で、frank-portal.ts はそれを再エクスポートしている", () => {
  assert.equal(TOKEN_ALPHABET, CHECKIN_TOKEN_ALPHABET);
  assert.equal(TOKEN_LENGTH, CHECKIN_TOKEN_LENGTH);
});

test("トークンの文字集合に記号・小文字・紛らわしい文字を入れない", () => {
  // 記号が入るとキーボード配列(US/JP)の違いでリーダーの打ち込みが化ける
  assert.match(CHECKIN_TOKEN_ALPHABET, /^[0-9A-Z]+$/);
  for (const c of "01OIL") {
    assert.ok(!CHECKIN_TOKEN_ALPHABET.includes(c), `${c} は手入力で誤りやすいので入れない`);
  }
});

test("isCheckinTokenShape は normalizeCheckinScan と同じ判定になる", () => {
  const good = newCheckinToken();
  assert.ok(isCheckinTokenShape(good));
  assert.equal(normalizeCheckinScan(good), good);

  for (const bad of ["", "ABC", good.slice(0, 15), `${good}X`, good.replace(/^./, "0"), "4901234567894"]) {
    assert.ok(!isCheckinTokenShape(bad), `${bad} は弾く`);
    assert.equal(normalizeCheckinScan(bad), null);
  }
});

// --- 来店中モードを閉じる判定（#163） -----------------------------
// ここが緩むと現場で起きること:
//   閉じるのが早すぎる → 打席にいるお客様が注文できなくなる（気づかれない）
//   閉じないまま       → 帰宅後もスマホに打席が出て、店外から注文画面が開ける
const min = (hhmm: string) => hhmmToMin(hhmm) as number;

test("予約がある人は 終了+30分 まで来店中", () => {
  const endMin = min("14:00");
  const base = { endMin, checkedInMin: min("13:00") };
  assert.equal(visitClosed({ ...base, nowMin: min("14:00") }), false);
  assert.equal(visitClosed({ ...base, nowMin: endMin + VISIT_GRACE_MIN }), false, "ちょうど30分後はまだ来店中");
  assert.equal(visitClosed({ ...base, nowMin: endMin + VISIT_GRACE_MIN + 1 }), true);
});

test("予約が無い人は チェックイン+2時間 で閉じる（#163・これが無いと日付が変わるまで閉じなかった）", () => {
  const inMin = min("10:00");
  const base = { endMin: null, checkedInMin: inMin };
  assert.equal(visitClosed({ ...base, nowMin: min("11:59") }), false);
  assert.equal(visitClosed({ ...base, nowMin: inMin + VISIT_NO_BOOKING_MIN }), false);
  assert.equal(visitClosed({ ...base, nowMin: inMin + VISIT_NO_BOOKING_MIN + 1 }), true);
});

test("予約があるときは チェックイン時刻ではなく予約終了で判断する", () => {
  // 10:00にチェックインして13:00まで予約している人を、2時間ルールで閉じてはいけない
  assert.equal(
    visitClosed({ nowMin: min("12:30"), endMin: min("13:00"), checkedInMin: min("10:00") }),
    false,
  );
});

test("時刻がどちらも取れないときは閉じない（迷ったら開けておく）", () => {
  assert.equal(visitClosed({ nowMin: min("23:59"), endMin: null, checkedInMin: null }), false);
});

test("hhmmToMin は形の違うものを null にする（壊れた値で誤判定しない）", () => {
  assert.equal(hhmmToMin("00:00"), 0);
  assert.equal(hhmmToMin("14:05"), 845);
  assert.equal(hhmmToMin("14:05:00"), 845, "timeカラムの秒付きも読める");
  for (const bad of ["", "abc", "1400", null, undefined]) {
    assert.equal(hhmmToMin(bad as string | null), null, `${bad} は null`);
  }
});

// --- 実際の売価（#167・ユーザー確定） ---------------------------
// 決めたのは「お客様が払う額」のほう:
//   ソフトドリンク 会員330 / ビジター660、ノンアルコール 会員440 / ビジター880。
// DBには本体価格（税抜）を入れているので、丸めが変わるとこの額がずれる。
// ここが落ちたら、メニューの本体価格を入れ直す必要がある（migration 0128）。
test("決めた売価どおりの税込額になる（本体価格の割り付けが正しい）", () => {
  assert.equal(withTax(300), 330, "ソフトドリンク 会員");
  assert.equal(withTax(600), 660, "ソフトドリンク ビジター");
  assert.equal(withTax(400), 440, "ノンアルコール 会員");
  assert.equal(withTax(800), 880, "ノンアルコール ビジター");
});
