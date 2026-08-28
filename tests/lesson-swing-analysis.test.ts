import test from "node:test";
import assert from "node:assert/strict";
import {
  scanShaft,
  motionThreshold,
  buildClub,
  signedDist,
  poseMetrics,
  headSway,
  planeMetrics,
  planeFromAddress,
  poseAt,
  clubAt,
  LM,
  type Landmarks,
  type Plane,
} from "../apps/lesson-os/src/lib/pose.ts";

/* ============================================================
   Lesson OS スイング解析（#174/#175）の幾何・画像処理まわり
   カメラも動画も無しで固定できる部分だけをここで止める。

   ここで守りたいこと:
     1. シャフト検出が「腕ではなくクラブ」を選ぶこと
     2. 角度をpxで計算していること（正規化のままだと 9:16 で角度が狂う）
     3. プレーンの上下の符号が「上が＋」で一貫していること
   ============================================================ */

const W = 200;
const H = 200;

/** (cx,cy) から角度 deg 方向に r0〜r1 の線を焼き込んだ画像を作る */
function frameWithRay(rays: { deg: number; r0: number; r1: number; val: number }[]) {
  const img = new Uint8Array(W * H);
  for (const { deg, r0, r1, val } of rays) {
    const rad = (deg * Math.PI) / 180;
    for (let r = r0; r <= r1; r += 0.4) {
      // 線に太さを持たせる（1pxだと標本化でスカスカになる）
      for (let o = -1; o <= 1; o++) {
        const x = Math.round(100 + Math.cos(rad) * r - Math.sin(rad) * o);
        const y = Math.round(100 + Math.sin(rad) * r + Math.cos(rad) * o);
        if (x >= 0 && y >= 0 && x < W && y < H) img[y * W + x] = val;
      }
    }
  }
  return img;
}

const blank = new Uint8Array(W * H);

const THR = 20;

test("動きの閾値は画面の地の高さから決まる（固定値にしない）", () => {
  // 静止画どうしなら下限に張り付く
  assert.equal(motionThreshold(blank, blank, W, H), 10);
  // 画面全体がざわついていれば閾値が上がる
  const noisy = new Uint8Array(W * H);
  for (let i = 0; i < noisy.length; i++) noisy[i] = (i * 37) % 60;
  assert.ok(motionThreshold(blank, noisy, W, H) > 30, "ざわついた動画では閾値が上がる");
});

test("シャフト検出: 動いた直線の向きと先端を拾う", () => {
  const cur = frameWithRay([{ deg: 30, r0: 5, r1: 88, val: 220 }]);
  const hit = scanShaft(blank, cur, W, H, 100, 100, 90, null, THR);
  assert.ok(hit, "検出できること");
  assert.ok(Math.abs(((hit!.ang - 30 + 540) % 360) - 180) < 4, `角度が30度付近 (実際 ${hit!.ang})`);
  assert.ok(hit!.r > 80, `先端が遠い側にある (実際 ${hit!.r})`);
  assert.ok(hit!.conf > 0.3, `確からしさが立つ (実際 ${hit!.conf})`);
});

test("シャフト検出: 短い腕ではなく長いクラブを選ぶ", () => {
  // 200度方向に「腕」（短い）、30度方向に「クラブ」（長い）。腕のほうが明るくても長さで勝たせる
  const cur = frameWithRay([
    { deg: 200, r0: 5, r1: 38, val: 255 },
    { deg: 30, r0: 5, r1: 88, val: 200 },
  ]);
  const hit = scanShaft(blank, cur, W, H, 100, 100, 90, null, THR);
  assert.ok(hit);
  assert.ok(Math.abs(((hit!.ang - 30 + 540) % 360) - 180) < 6, `クラブ側を選ぶ (実際 ${hit!.ang})`);
});

test("シャフト検出: 散らばったノイズは線として認めない（fillが低い）", () => {
  // 明るいが並んでいない点をばらまく。合計値だけで選ぶとこれが勝ってしまう
  const cur = new Uint8Array(W * H);
  for (let i = 0; i < cur.length; i += 13) cur[i] = 255;
  const hit = scanShaft(blank, cur, W, H, 100, 100, 90, null, THR);
  if (hit) assert.ok(hit.conf < 0.4, `ノイズに高い確からしさを与えない (実際 ${hit.conf.toFixed(2)})`);
});

test("シャフト検出: 原点が数pxずれても細いシャフトを見失わない", () => {
  // 手首の中点は数pxずれる。光線に幅を持たせていないと、遠くでシャフトから外れて検出できなくなる
  const img = new Uint8Array(W * H);
  const rad = (25 * Math.PI) / 180;
  for (let r = 5; r <= 88; r += 0.4) {
    for (let o = 0; o <= 1; o++) {   // 2px幅の細いシャフト
      const x = Math.round(104 + Math.cos(rad) * r);   // 原点を4pxずらして描く
      const y = Math.round(103 + Math.sin(rad) * r + o);
      if (x >= 0 && y >= 0 && x < W && y < H) img[y * W + x] = 230;
    }
  }
  const hit = scanShaft(blank, img, W, H, 100, 100, 90, null, THR);
  assert.ok(hit, "ずれていても検出できること");
  assert.ok(hit!.r > 70, `先端まで届く (実際 ${hit!.r.toFixed(0)})`);
  assert.ok(hit!.fill > 0.6, `線として詰まっていると判定される (実際 ${hit!.fill.toFixed(2)})`);
});

test("シャフト検出: 動きが無いコマ（アドレス）は null", () => {
  assert.equal(scanShaft(blank, blank, W, H, 100, 100, 90, null, THR), null);
});

test("シャフト検出: 直前の向きは弱い後押しにとどまる（切り返しで置いていかれない）", () => {
  // 1コマで100度回っても、実際に写っている向きを選べること
  const cur = frameWithRay([{ deg: 130, r0: 5, r1: 88, val: 220 }]);
  const hit = scanShaft(blank, cur, W, H, 100, 100, 90, 30, THR);
  assert.ok(hit);
  assert.ok(Math.abs(((hit!.ang - 130 + 540) % 360) - 180) < 6, `実際に動いた向きを選ぶ (実際 ${hit!.ang})`);
});

test("軌跡の組み立て: 確からしさの低いコマは落ち、クラブ長で頭打ちになる", () => {
  const mk = (ang: number, r: number, conf: number, fill = 0.8) =>
    ({ wx: 100, wy: 100, hit: { ang, r, score: 100, fill, conf } });
  const hits = [
    null,
    mk(0, 80, 0.8), mk(10, 82, 0.8), mk(20, 79, 0.8), mk(30, 81, 0.8),
    mk(40, 300, 0.9),            // 外れ値（背景の何かを拾った）→ クラブ長でクランプされる
    mk(50, 40, 0.05, 0.2),       // 線になっていない → 落ちる
    mk(60, 80, 0.7), mk(70, 80, 0.7),
  ];
  const t = hits.map((_, i) => i * 33);
  const { club } = buildClub(hits, t, W, H);
  assert.ok(club, "軌跡ができること");
  assert.equal(club!.p.length, hits.length, "コマ数は骨格とそろえる");
  assert.equal(club!.p[0].length, 0, "1コマ目は前コマが無いので空");
  assert.equal(club!.p[6].length, 0, "線になっていないコマは空にする（滑らかにつないで嘘をつかない）");
  const far = Math.hypot(club!.p[5][0] / 1000 * W - 100, club!.p[5][1] / 1000 * H - 100);
  assert.ok(far < 95, `外れ値はクラブ長までに抑える (実際 ${far.toFixed(0)}px)`);
});

test("軌跡の組み立て: 前後から離れた孤立点は落とす", () => {
  const mk = (ang: number, r: number) => ({ wx: 100, wy: 100, hit: { ang, r, score: 100, fill: 0.8, conf: 0.6 } });
  // 0,10,20,30度と続くところに、ひとつだけ180度反対を向いた点を挟む
  const hits = [mk(0, 80), mk(10, 80), mk(200, 80), mk(20, 80), mk(30, 80), mk(40, 80), mk(50, 80)];
  const t = hits.map((_, i) => i * 33);
  const { club } = buildClub(hits, t, W, H);
  assert.ok(club);
  assert.equal(club!.p[2].length, 0, "孤立した点は落ちる");
  assert.ok(club!.p[1].length === 3 && club!.p[3].length === 3, "前後の点は残る");
});

test("軌跡の組み立て: 材料が少なすぎるときは null（無理に線を引かない）", () => {
  assert.equal(buildClub([null, null, null], [0, 33, 66], W, H).club, null);
});

/* --- 角度は必ず px で計算する（9:16 の落とし穴） ------------------ */

function lmWith(over: Record<number, [number, number]>): Landmarks {
  const base: Landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [i, [x, y]] of Object.entries(over)) base[Number(i)] = { x, y, z: 0 };
  return base;
}

test("肩の角度は動画の実寸で計算する（正規化のままだと縦長動画で狂う）", () => {
  const lm = lmWith({ [LM.lShoulder]: [0.4, 0.5], [LM.rShoulder]: [0.6, 0.6] });
  // 1080x1920 では dx=216px, dy=192px → 41.6度。正規化のままなら 26.6度になってしまう
  const m = poseMetrics(lm, 1080, 1920);
  assert.ok(Math.abs(m.shoulder - 41.6) < 1, `実寸の角度 (実際 ${m.shoulder})`);
  // 正方形の動画なら 26.6度
  const sq = poseMetrics(lm, 1000, 1000);
  assert.ok(Math.abs(sq.shoulder - 26.6) < 1, `正方形なら別の値 (実際 ${sq.shoulder})`);
});

test("水平な肩は0度・ねじれは肩と腰の差", () => {
  const lm = lmWith({
    [LM.lShoulder]: [0.4, 0.5], [LM.rShoulder]: [0.6, 0.5],
    [LM.lHip]: [0.42, 0.7], [LM.rHip]: [0.58, 0.75],
  });
  const m = poseMetrics(lm, 1080, 1920);
  assert.equal(m.shoulder, 0);
  assert.equal(m.xFactor, Number((m.shoulder - m.hip).toFixed(1)));
});

test("頭のブレは肩幅を100%とした割合", () => {
  const base = poseMetrics(lmWith({ [LM.nose]: [0.5, 0.2], [LM.lShoulder]: [0.4, 0.5], [LM.rShoulder]: [0.6, 0.5] }), 1000, 1000);
  const now = poseMetrics(lmWith({ [LM.nose]: [0.6, 0.2], [LM.lShoulder]: [0.4, 0.5], [LM.rShoulder]: [0.6, 0.5] }), 1000, 1000);
  // 肩幅0.2・頭が0.1動いた → 50%
  assert.deepEqual(headSway(base, now), { x: 50, y: 0 });
});

/* --- プレーン ---------------------------------------------------- */

const flat: Plane = { x1: 0, y1: 0.5, x2: 1, y2: 0.5, _method: "address" };

test("プレーンの符号: 線より上が＋", () => {
  assert.ok(signedDist(flat, 500, 200, 1000, 1000) > 0, "画面の上側は＋");
  assert.ok(signedDist(flat, 500, 800, 1000, 1000) < 0, "下側は−");
});

test("プレーンからの離れはクラブ長を100とした比率で出る", () => {
  const t = [0, 33, 66, 99];
  const club = {
    v: 1 as const,
    t,
    p: [
      [500, 500, 90],   // 線の上（ズレ0）
      [500, 400, 90],   // 100px上 = クラブ長200pxの50%
      [500, 700, 90],   // 200px下 = -100%
      [],
    ],
    clubLen: 200,       // 画面幅1000 のとき 200px
  };
  const pm = planeMetrics(flat, club, 1000, 1000, { top: 0.033, downswing: 0.066, impact: 0.099 });
  assert.equal(pm.angle, 0, "水平なプレーンは0度");
  assert.equal(pm.top, 50);
  assert.equal(pm.down, -100);
  assert.equal(pm.impact, null, "検出できていないコマは null");
  assert.equal(pm.backMax, -100, "インパクトまでの最大（絶対値で選ぶ）");
  assert.equal(pm.downMax, null, "インパクト後に検出コマが無ければ null");

  // インパクトの位置でバック／ダウンの区切りが変わること
  const split = planeMetrics(flat, club, 1000, 1000, { impact: 0.04 });
  assert.equal(split.backMax, 50);
  assert.equal(split.downMax, -100);
});

test("プレーン角は0〜90度に畳む（線の向きで数字が反転しない）", () => {
  const up: Plane = { x1: 0, y1: 1, x2: 1, y2: 0, _method: "address" };
  const down: Plane = { x1: 1, y1: 0, x2: 0, y2: 1, _method: "address" };
  const club = { v: 1 as const, t: [0], p: [[500, 500, 90]], clubLen: 200 };
  assert.equal(planeMetrics(up, club, 1000, 1000).angle, 45);
  assert.equal(planeMetrics(down, club, 1000, 1000).angle, 45);
});

test("アドレスのプレーンは手とヘッドを結んだ線になる", () => {
  const row = new Array(99).fill(0);
  row[LM.lWrist * 3] = 500; row[LM.lWrist * 3 + 1] = 500;
  row[LM.rWrist * 3] = 500; row[LM.rWrist * 3 + 1] = 500;
  const pose = { v: 1 as const, t: [0, 33], p: [[], row] };
  const club = { v: 1 as const, t: [0, 33], p: [[], [600, 600, 90]], clubLen: 200 };
  const pl = planeFromAddress(pose, club, 1000, 1000);
  assert.ok(pl);
  // 手(0.5,0.5)とヘッド(0.6,0.6)を通る＝45度
  assert.equal(planeMetrics(pl!, club, 1000, 1000).angle, 45);
  assert.equal(pl!._method, "address");
});

test("プレーンは検出できたコマが無ければ引かない", () => {
  const pose = { v: 1 as const, t: [0], p: [[]] };
  const club = { v: 1 as const, t: [0], p: [[]], clubLen: 200 };
  assert.equal(planeFromAddress(pose, club, 1000, 1000), null);
});

/* --- 取り出し ---------------------------------------------------- */

test("秒からいちばん近いコマを引く", () => {
  const row = new Array(99).fill(500);
  const pose = { v: 1 as const, t: [0, 100, 200], p: [row, [], row] };
  assert.ok(poseAt(pose, 0.01), "0秒付近は1コマ目");
  assert.equal(poseAt(pose, 0.1), null, "未検出コマは null");
  assert.ok(poseAt(pose, 0.19), "0.19秒は3コマ目に寄る");
  assert.equal(poseAt(null, 0), null);

  const club = { v: 1 as const, t: [0, 100], p: [[100, 200, 80], []], clubLen: 200 };
  assert.deepEqual(clubAt(club, 0), { x: 0.1, y: 0.2, conf: 0.8 });
  assert.equal(clubAt(club, 0.1), null);
});
