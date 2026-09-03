import test from "node:test";
import assert from "node:assert/strict";
import { cleanPose } from "../apps/lesson-os/src/lib/pose.ts";

/* ============================================================
   骨格の後処理（#203）

   MediaPipe が返した33関節をそのまま保存せず、スイング1本ぶんまとめて見直す。
   ここで固定したいのは2つ:
     1. おかしい点（左右の入れ替わり・骨の伸び・行って戻る飛び・信頼度が低い点）は直す
     2. **素直に速い動きには触らない** — ダウンスイングを鈍らせたら解析の意味が無い
   2 のほうが大事。1 を強くしすぎて 2 を壊す変更が入ったら、ここで落ちる。
   ============================================================ */

const W = 720;
const H = 1280;
const N = 60;

/** 立っている人を1本ぶん作る。腕はフェーズで動かすが、上腕120px・前腕110px は保つ */
function swing(): number[][] {
  return Array.from({ length: N }, (_, i) => {
    const row = new Array(99).fill(0);
    const put = (k: number, x: number, y: number) => {
      row[k * 3] = Math.round((x / W) * 1000);
      row[k * 3 + 1] = Math.round((y / H) * 1000);
      row[k * 3 + 2] = 0;
    };
    for (let k = 0; k < 33; k++) put(k, 360, 640);
    put(0, 360, 300);
    put(11, 320, 400); put(12, 400, 400);       // 肩
    put(23, 330, 700); put(24, 390, 700);       // 腰
    put(25, 325, 900); put(26, 395, 900);       // ひざ
    put(27, 322, 1100); put(28, 398, 1100);     // 足首
    const a = (0.2 + (i / N) * 0.6) * Math.PI;
    put(13, 320 + Math.cos(a) * 120, 400 + Math.sin(a) * 120);
    put(15, 320 + Math.cos(a) * 230, 400 + Math.sin(a) * 230);
    put(14, 400 + Math.cos(a) * 120, 400 + Math.sin(a) * 120);
    put(16, 400 + Math.cos(a) * 230, 400 + Math.sin(a) * 230);
    return row;
  });
}
const allVisible = () => Array.from({ length: N }, () => new Array(33).fill(1));

const PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

test("きれいなデータには1点も手を出さない", () => {
  const p = swing();
  const before = JSON.stringify(p);
  const fix = cleanPose(p, allVisible(), W, H);
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(
    { swapped: fix.swapped, lowVis: fix.lowVis, stretched: fix.stretched, spikes: fix.spikes, left: fix.left },
    { swapped: 0, lowVis: 0, stretched: 0, spikes: 0, left: 0 }
  );
});

test("左右のラベルが入れ替わったコマを見つけて戻す", () => {
  const p = swing();
  const want = p[30].slice();
  for (const [a, b] of PAIRS) {
    for (let c = 0; c < 3; c++) {
      const t = p[30][a * 3 + c];
      p[30][a * 3 + c] = p[30][b * 3 + c];
      p[30][b * 3 + c] = t;
    }
  }
  const fix = cleanPose(p, allVisible(), W, H);
  assert.equal(fix.swapped, 1);
  assert.ok(p[30].every((n, i) => Math.abs(n - want[i]) <= 2));
});

test("行って戻る飛びは引き直す（骨がぶら下がっていない鼻でも効く）", () => {
  const p = swing();
  const want = p[25][0];
  p[25][0] += 150;
  const fix = cleanPose(p, allVisible(), W, H);
  assert.equal(fix.spikes, 1);
  assert.ok(Math.abs(p[25][0] - want) <= 3, `nose=${p[25][0]} want=${want}`);
});

test("骨が伸びたコマは遠い側を引き直す（投影は縮みこそすれ伸びない）", () => {
  const p = swing();
  const want = p[10][15 * 3 + 1];
  p[10][15 * 3 + 1] += 180;
  const fix = cleanPose(p, allVisible(), W, H);
  assert.ok(fix.stretched + fix.spikes >= 1);
  assert.ok(Math.abs(p[10][15 * 3 + 1] - want) <= 10);
});

test("モデルが「見えていない」と言う点は引き直す", () => {
  const p = swing();
  const v = allVisible();
  const want = p[25][16 * 3];
  p[25][16 * 3] += 300;
  v[25][16] = 0.1;
  const fix = cleanPose(p, v, W, H);
  assert.equal(fix.lowVis, 1);
  assert.ok(Math.abs(p[25][16 * 3] - want) <= 10);
});

test("素直に速い動き（行ったきり戻らない）には触らない", () => {
  const p = swing();
  for (let i = 30; i < N; i++) p[i][15 * 3] += 250;
  const before = p.map((r) => r[15 * 3]);
  const fix = cleanPose(p, allVisible(), W, H);
  assert.equal(fix.spikes, 0);
  assert.ok(p.every((r, i) => Math.abs(r[15 * 3] - before[i]) <= 2));
});

test("穴が大きすぎるコマは埋めずに残す（作り話をしない）", () => {
  const p = swing();
  const v = allVisible();
  for (let i = 10; i < 40; i++) v[i][15] = 0.1;
  const fix = cleanPose(p, v, W, H);
  assert.ok(fix.left > 0, `left=${fix.left}`);
});

test("体の物差しはスイング全体で1つ・左右差は数字で出す", () => {
  const p = swing();
  const fix = cleanPose(p, allVisible(), W, H);
  assert.ok(fix.body > 600 && fix.body < 780, `body=${fix.body}`);
  assert.ok(fix.asym <= 5, `asym=${fix.asym}`);
});

test("未検出コマ（空配列）が混ざっても落ちない", () => {
  const p = swing();
  const v = allVisible();
  for (const i of [0, 1, 33, 59]) { p[i] = []; v[i] = []; }
  const fix = cleanPose(p, v, W, H);
  assert.equal(p[0].length, 0);
  assert.ok(fix.body > 0);
});
