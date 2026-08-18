import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyJoins, samePerson, type LedgerJoin, type RosterJoin } from "../apps/member-os/src/lib/join-tally-pure.ts";

/**
 * ダッシュボード「入会者数」の暫定集計（GOLF WING 宝塚）。
 * ここで守りたいのは3つ:
 *   ① 名簿がまだ空でも、受付台帳の入会が人数に出る
 *   ② 名簿を取り込んだら同じ人を二重に数えない
 *   ③ 同姓同名の別人は勝手にくっつけない
 */

const roster = (name: string, over: Partial<RosterJoin> = {}): RosterJoin => ({ name, ...over });
const ledger = (name: string, over: Partial<LedgerJoin> = {}): LedgerJoin => ({ name, ...over });

test("名簿が未取込でも台帳の入会が人数に出る（暫定）", () => {
  const t = tallyJoins([], [ledger("山田 太郎"), ledger("鈴木 花子")]);
  assert.equal(t.total, 2);
  assert.equal(t.roster.length, 0);
  assert.equal(t.pending.length, 2);
  assert.equal(t.provisional, true);
});

test("名簿に載った人は台帳側から落ちる（二重に数えない）", () => {
  const t = tallyJoins([roster("山田太郎")], [ledger("山田 太郎"), ledger("鈴木 花子")]);
  assert.equal(t.total, 2);
  assert.deepEqual(t.pending.map((p) => p.name), ["鈴木 花子"]);
});

test("名簿だけで足りていれば暫定表示にならない", () => {
  const t = tallyJoins([roster("山田太郎"), roster("鈴木花子")], [ledger("山田　太郎")]);
  assert.equal(t.total, 2);
  assert.equal(t.provisional, false);
});

test("カナだけでも突き合わせる（ひらがな/カタカナのゆれを吸収）", () => {
  const t = tallyJoins(
    [roster("山田 太郎", { nameKana: "ヤマダタロウ" })],
    [ledger("", { nameKana: "やまだ たろう" })]
  );
  assert.equal(t.total, 1);
});

test("同姓同名でも生年月日が違えば別人として数える", () => {
  const t = tallyJoins(
    [roster("山田太郎", { birthDate: "1980-01-01" })],
    [ledger("山田太郎", { birthDate: "1995-05-05" })]
  );
  assert.equal(t.total, 2);
  assert.equal(samePerson({ name: "山田太郎", birthDate: "1980-01-01" }, { name: "山田太郎", birthDate: "1995-05-05" }), false);
});

test("台帳に同じ人が2行あっても1人", () => {
  const t = tallyJoins([], [ledger("山田太郎", { visitedOn: "2026-08-01" }), ledger("山田 太郎", { visitedOn: "2026-08-20" })]);
  assert.equal(t.total, 1);
});

test("氏名もカナも無い行は数えない（突き合わせようがないため）", () => {
  const t = tallyJoins([], [ledger("", { nameKana: null }), ledger("鈴木花子")]);
  assert.equal(t.total, 1);
});
