import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePeople, digits, type Hit } from "../apps/member-os/src/lib/visitor-search-pure.ts";

/**
 * 来店検索の名寄せ（member-os /search・migration 0109）。
 * ここで守りたいのは2つだけ:
 *   ① 同じ人が「一時利用」と「会員」に別々に載っていたら1枚にまとめる
 *   ② 別人を絶対にくっつけない（同姓同名は普通にいる）
 */

function hit(over: Partial<Hit>): Hit {
  return {
    kind: "guest",
    id: Math.random().toString(36).slice(2),
    name: null,
    name_kana: null,
    phone: null,
    email: null,
    birth_date: null,
    gender: null,
    visit_count: 0,
    first_visit: null,
    last_visit: null,
    visits: [],
    ...over,
  };
}

test("電話番号が同じなら表記が違っても同一人物にまとめる", () => {
  const people = mergePeople([
    hit({ kind: "guest", name: "田中 太郎", phone: "090-1234-5678", visit_count: 2, first_visit: "2026-01-10", last_visit: "2026-03-02" }),
    hit({ kind: "frank", name: "田中太郎", phone: "09012345678", member_no: "FR0007" }),
  ]);
  assert.equal(people.length, 1);
  assert.deepEqual(
    people[0].hits.map((h) => h.kind).sort(),
    ["frank", "guest"]
  );
  assert.equal(people[0].visitCount, 2);
});

test("同姓同名でも生年月日も電話も違えば別人のまま", () => {
  const people = mergePeople([
    hit({ name: "田中 太郎", birth_date: "1980-01-01" }),
    hit({ name: "田中 太郎", birth_date: "1995-06-30" }),
  ]);
  assert.equal(people.length, 2);
});

test("氏名だけ一致（生年月日なし）ではくっつけない", () => {
  const people = mergePeople([hit({ name: "佐藤 花子" }), hit({ name: "佐藤 花子" })]);
  assert.equal(people.length, 2);
});

test("氏名＋生年月日が一致すれば会員名簿と受付台帳がつながる", () => {
  const people = mergePeople([
    hit({ kind: "guest", name: "山田　一郎", birth_date: "1975-05-05", visit_count: 1, first_visit: "2026-02-01", last_visit: "2026-02-01" }),
    hit({ kind: "member", name: "山田 一郎", birth_date: "1975-05-05", member_no: "1234", last_visit: "2026-07-20" }),
  ]);
  assert.equal(people.length, 1);
  // 会員名簿側の最終来店日も「最終来店」に反映される
  assert.equal(people[0].lastVisit, "2026-07-20");
  assert.equal(people[0].firstVisit, "2026-02-01");
});

test("カナがひらがな／カタカナで揺れても生年月日が同じならまとまる", () => {
  const people = mergePeople([
    hit({ kind: "guest", name_kana: "やまだ いちろう", birth_date: "1975-05-05", name: "山田 一郎" }),
    hit({ kind: "member", name_kana: "ヤマダ　イチロウ", birth_date: "1975-05-05", name: "山田一郎" }),
  ]);
  assert.equal(people.length, 1);
});

test("3件が電話・メール・生年月日の別々の鍵で数珠つなぎになっても1人になる", () => {
  const people = mergePeople([
    hit({ kind: "guest", name: "鈴木 二郎", phone: "080-1111-2222", email: "jiro@example.com" }),
    hit({ kind: "frank", name: "鈴木二郎", email: "JIRO@example.com", birth_date: "1988-08-08" }),
    hit({ kind: "member", name: "鈴木 二郎", birth_date: "1988-08-08", member_no: "0042" }),
  ]);
  assert.equal(people.length, 1);
  assert.equal(people[0].hits.length, 3);
});

test("来店履歴は複数ソースを日付の新しい順に1本化する", () => {
  const people = mergePeople([
    hit({
      kind: "guest",
      name: "高橋 三郎",
      phone: "07011112222",
      visit_count: 2,
      first_visit: "2026-01-05",
      last_visit: "2026-04-01",
      visits: [
        { date: "2026-04-01", type: "fitting" },
        { date: "2026-01-05", type: "trial" },
      ],
    }),
    hit({
      kind: "frank",
      name: "高橋三郎",
      phone: "070-1111-2222",
      visit_count: 1,
      first_visit: "2026-03-10",
      last_visit: "2026-03-10",
      visits: [{ date: "2026-03-10", type: "frank_bay" }],
    }),
  ]);
  assert.equal(people.length, 1);
  assert.deepEqual(people[0].visits.map((v) => v.date), ["2026-04-01", "2026-03-10", "2026-01-05"]);
  assert.equal(people[0].visitCount, 3);
});

test("来店回数が多い人・最近来た人が上に並ぶ", () => {
  const people = mergePeople([
    hit({ name: "古い 太郎", birth_date: "1970-01-01", visit_count: 9, last_visit: "2024-01-01" }),
    hit({ name: "最近 花子", birth_date: "1970-01-02", visit_count: 1, last_visit: "2026-08-01" }),
  ]);
  assert.deepEqual(people.map((p) => p.name), ["最近 花子", "古い 太郎"]);
});

test("連絡先が無い側があっても、ある側の情報が代表値になる", () => {
  const people = mergePeople([
    hit({ kind: "member", name: "会員 太郎", birth_date: "1990-03-03", member_no: "0001" }),
    hit({ kind: "guest", name: "会員 太郎", birth_date: "1990-03-03", phone: "090-9999-8888", email: "a@example.com" }),
  ]);
  assert.equal(people.length, 1);
  assert.equal(people[0].phone, "090-9999-8888");
  assert.equal(people[0].email, "a@example.com");
});

test("短い番号（下4桁など）は名寄せの鍵にしない＝別人を混ぜない", () => {
  const people = mergePeople([hit({ name: "A", phone: "5678" }), hit({ name: "B", phone: "5678" })]);
  assert.equal(people.length, 2);
});

test("digits はハイフン・全角・空白を落とす", () => {
  assert.equal(digits("090-1234-5678"), "09012345678");
  assert.equal(digits(" 06 (6123) 4567 "), "0661234567");
  assert.equal(digits(null), "");
});

test("空の結果でも落ちない", () => {
  assert.deepEqual(mergePeople([]), []);
  assert.deepEqual(mergePeople(null), []);
});
