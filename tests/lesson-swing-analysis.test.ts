import test from "node:test";
import assert from "node:assert/strict";
import {
  scanShaftCandidates,
  motionThreshold,
  buildClub,
  signedDist,
  poseMetrics,
  headSway,
  planeMetrics,
  planeFromAddress,
  poseAt,
  clubAt,
  viewPoint,
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
  const hit = scanShaftCandidates(blank, cur, W, H, 100, 100, 90, THR)[0];
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
  const hit = scanShaftCandidates(blank, cur, W, H, 100, 100, 90, THR)[0];
  assert.ok(hit);
  assert.ok(Math.abs(((hit!.ang - 30 + 540) % 360) - 180) < 6, `クラブ側を選ぶ (実際 ${hit!.ang})`);
});

test("シャフト検出: 散らばったノイズは線として認めない（fillが低い）", () => {
  // 明るいが並んでいない点をばらまく。合計値だけで選ぶとこれが勝ってしまう
  const cur = new Uint8Array(W * H);
  for (let i = 0; i < cur.length; i += 13) cur[i] = 255;
  const hit = scanShaftCandidates(blank, cur, W, H, 100, 100, 90, THR)[0];
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
  const hit = scanShaftCandidates(blank, img, W, H, 100, 100, 90, THR)[0];
  assert.ok(hit, "ずれていても検出できること");
  assert.ok(hit!.r > 70, `先端まで届く (実際 ${hit!.r.toFixed(0)})`);
  assert.ok(hit!.fill > 0.6, `線として詰まっていると判定される (実際 ${hit!.fill.toFixed(2)})`);
});

test("シャフト検出: 動きが無いコマ（アドレス）は null", () => {
  assert.deepEqual(scanShaftCandidates(blank, blank, W, H, 100, 100, 90, THR), []);
});

test("シャフト検出: 候補は「山」ごとに1本ずつ、強い順に返る", () => {
  const cur = frameWithRay([
    { deg: 30, r0: 5, r1: 88, val: 220 },
    { deg: 150, r0: 5, r1: 70, val: 200 },
  ]);
  const cands = scanShaftCandidates(blank, cur, W, H, 100, 100, 90, THR, 4);
  assert.ok(cands.length >= 2, "2本とも候補に残る");
  assert.ok(cands[0].score >= cands[1].score, "強い順");
  const near = (deg: number) => cands.some((c) => Math.abs(((c.ang - deg + 540) % 360) - 180) < 6);
  assert.ok(near(30) && near(150), `2つの山が別々に出る (実際 ${cands.map((c) => c.ang)})`);
});

test("シャフト検出: 本物のシャフトとノイズは norm ではっきり分かれる", () => {
  const shaft = scanShaftCandidates(blank, frameWithRay([{ deg: 30, r0: 5, r1: 88, val: 220 }]), W, H, 100, 100, 90, THR)[0];
  const noise = new Uint8Array(W * H);
  for (let i = 0; i < noise.length; i += 13) noise[i] = 255;
  const n = scanShaftCandidates(blank, noise, W, H, 100, 100, 90, THR)[0];
  assert.ok(shaft.norm > 0.4, `シャフトは 0.4 超 (実際 ${shaft.norm.toFixed(2)})`);
  if (n) assert.ok(n.norm < 0.3, `ノイズは 0.3 未満 (実際 ${n.norm.toFixed(2)})`);
});

const mkCand = (ang, r, norm, fill = 0.85) => {
  const rad = (ang * Math.PI) / 180;
  return {
    ang, r, fill, score: norm * 48, norm, conf: Math.min(1, norm / 0.6) * Math.min(1, fill / 0.8),
    x: 100 + Math.cos(rad) * r, y: 100 + Math.sin(rad) * r,
  };
};
const frame = (...list) => ({ wx: 100, wy: 100, body: 100, armAng: null, list });
/** 前腕の向きつき（シャフトは前腕から大きくは外れないという条件を効かせる） */
const frameArm = (armAng, ...list) => ({ wx: 100, wy: 100, body: 100, armAng, list });

test("軌跡の組み立て: 弱い候補は捨て、前後のつながりで1本を選ぶ", () => {
  // 本物＝角度が少しずつ回りながら距離が一定。にせもの＝毎コマ違う方向に飛ぶ
  const frames = [];
  for (let i = 0; i < 14; i++) {
    frames.push(frame(mkCand(20 + i * 6, 88, 0.5), mkCand((i * 137) % 360, 60, 0.55)));
  }
  const t = frames.map((_, i) => i * 33);
  const { club } = buildClub(frames, t, W, H);
  assert.ok(club, "軌跡ができること");
  const picked = club.p.filter((r) => r.length === 3).length;
  assert.ok(picked >= 12, `ほぼ全コマ選ばれる (実際 ${picked})`);
  // 選ばれたのは滑らかに回るほう（距離が一定＝クラブ長に近い）
  const rs = club.p.map((r, i) => (r.length ? Math.hypot(r[0] / 1000 * W - 100, r[1] / 1000 * H - 100) : null)).filter(Boolean);
  assert.ok(rs.every((r) => Math.abs(r - 88) < 8), "距離が一定のほうを選ぶ");
});

test("軌跡の組み立て: 弱い候補しかないコマは空にする（滑らかにつないで嘘をつかない）", () => {
  const frames = [];
  for (let i = 0; i < 14; i++) {
    const list = [mkCand(20 + i * 6, 88, i === 7 ? 0.1 : 0.5)];  // 7コマ目だけ弱い
    frames.push(frame(...list));
  }
  const { club } = buildClub(frames, frames.map((_, i) => i * 33), W, H);
  assert.ok(club);
  assert.equal(club.p[7].length, 0, "弱いコマは飛ばす");
  assert.ok(club.p[6].length === 3 && club.p[8].length === 3, "前後はつながる");
});

test("軌跡の組み立て: 材料が少なすぎるときは null（無理に線を引かない）", () => {
  const frames = [frame(), frame(), frame()];
  assert.equal(buildClub(frames, [0, 33, 66], W, H).club, null);
});

test("軌跡の組み立て: 前腕から見て有り得ない向きの候補は捨てる", () => {
  // 本物＝前腕とほぼ同じ向き。にせもの＝毎コマ強いが前腕の真裏（背景や体の輪郭を拾った形）
  const frames = [];
  for (let i = 0; i < 14; i++) {
    const arm = 20 + i * 6;
    frames.push(frameArm(arm, mkCand(arm + 5, 88, 0.5), mkCand(arm + 180, 92, 0.9)));
  }
  const { club } = buildClub(frames, frames.map((_, i) => i * 33), W, H);
  assert.ok(club);
  // 強さでは負けているほう（前腕と同じ向き）が選ばれること
  const i = club.p.findIndex((r) => r.length === 3);
  const arm = 20 + i * 6;
  const got = Math.atan2(club.p[i][1] / 1000 * H - 100, club.p[i][0] / 1000 * W - 100) * 180 / Math.PI;
  const diff = Math.abs(((got - arm + 540) % 360) - 180);
  assert.ok(diff < 25, `前腕側を選ぶ (実際 ${got.toFixed(0)} vs 前腕 ${arm})`);
});

test("軌跡の組み立て: 取れなかったコマは前腕から補い、推定であることを負の値で残す", () => {
  const frames = [];
  for (let i = 0; i < 14; i++) {
    const arm = 20 + i * 6;
    // 5〜7コマ目だけ画像から取れない
    frames.push(frameArm(arm, ...(i >= 5 && i <= 7 ? [] : [mkCand(arm + 5, 88, 0.5)])));
  }
  const { club } = buildClub(frames, frames.map((_, i) => i * 33), W, H);
  assert.ok(club);
  for (const i of [5, 6, 7]) {
    assert.equal(club.p[i].length, 3, `${i}コマ目が埋まる`);
    assert.ok(club.p[i][2] < 0, `${i}コマ目は推定として残る（負の値）`);
  }
  assert.ok(club.p[4][2] > 0, "実測は正のまま");
});

test("軌跡の組み立て: コックの変化が速すぎる空白は埋めない（どちらかが誤検出）", () => {
  const frames = [];
  for (let i = 0; i < 14; i++) {
    const arm = 0;
    // 0〜5 は取れる、6〜7 は取れない、8〜13 は3コマ相当でコックが90度飛んだ状態で取れる
    // （90度/3コマ=30度/コマ > 上限25度/コマ → 両端のどちらかが誤検出とみなす）
    const list = i <= 5 ? [mkCand(5, 88, 0.5)] : i >= 8 ? [mkCand(95, 88, 0.5)] : [];
    frames.push(frameArm(arm, ...list));
  }
  const { club } = buildClub(frames, frames.map((_, i) => i * 33), W, H);
  assert.ok(club);
  assert.ok(club.p.slice(6, 8).every((r) => r.length === 0), "速すぎるコック変化の空白は埋めない");
});

test("軌跡の組み立て: 長い空白もコックがなめらかなら前腕から埋める（2026-08-29・骨格を背骨に）", () => {
  // インパクト前後は差分では原理的に取れないが、骨格（手首・前腕）は取れている。
  // IMG_8986の実測: トップの切り返し25コマをまたぐコック変化は5.3度/コマ → 補間で引ける。
  const frames = [];
  for (let i = 0; i < 40; i++) {
    const arm = 0;
    // 0〜9=取れる、10〜29=20コマの空白、30〜39=コックが80度進んだ状態（3.8度/コマ）
    const list = i <= 9 ? [mkCand(5, 88, 0.5)] : i >= 30 ? [mkCand(85, 88, 0.5)] : [];
    frames.push(frameArm(arm, ...list));
  }
  const { club } = buildClub(frames, frames.map((_, i) => i * 33), W, H);
  assert.ok(club);
  for (let i = 10; i < 30; i++) {
    assert.equal(club.p[i].length, 3, `${i}コマ目が埋まる`);
    assert.ok(club.p[i][2] < 0, `${i}コマ目は推定として残る（負の値）`);
  }
});

test("軌跡の組み立て: インパクトの空白で二つに分かれても両方拾う（2026-08-29・IMG_8986）", () => {
  // ダウンスイング〜インパクトは差分が扇になり候補が長く途切れる。
  // 最良の1本だけを採る作りだと、切れた向こう側＝フォロースルーが丸ごと消えていた。
  const frames = [];
  for (let i = 0; i < 34; i++) {
    // 0-13=バック側、14-23=空白（DPの飛び越え8コマを超える）、24-33=フォロー側
    frames.push(frame(...(i >= 14 && i < 24 ? [] : [mkCand(20 + i * 6, 88, 0.5)])));
  }
  const { club } = buildClub(frames, frames.map((_, i) => i * 33), W, H);
  assert.ok(club);
  const picked = (a: number, b: number) => club!.p.slice(a, b + 1).filter((r) => r.length === 3).length;
  assert.ok(picked(0, 13) >= 12, `バック側が残る (実際 ${picked(0, 13)})`);
  assert.ok(picked(24, 33) >= 8, `フォロー側も拾う (実際 ${picked(24, 33)})`);
  assert.equal(picked(14, 23), 0, "インパクトの空白はそのまま＝滑らかにつないで嘘をつかない");
});

test("軌跡の組み立て: 空白の向こうが短い切れ端なら拾わない（ノイズの可能性が高い）", () => {
  const frames = [];
  for (let i = 0; i < 29; i++) {
    // 24-28 の5コマだけの切れ端は、体の輪郭や画面の映り込みかもしれないので採らない
    frames.push(frame(...(i >= 14 && i < 24 ? [] : [mkCand(20 + i * 6, 88, 0.5)])));
  }
  const { club } = buildClub(frames, frames.map((_, i) => i * 33), W, H);
  assert.ok(club);
  assert.ok(club.p.slice(24, 29).every((r) => r.length === 0), "5コマの切れ端は空のまま");
});

/* --- アーク表示（軌跡を1本のなめらかな線に・2026-08-29） ---------- */

import { buildClubArc } from "../apps/lesson-os/src/lib/pose.ts";

const AW = 1080;
const AH = 1920;

/** ClubData を作る（p は 0〜1000 の整数・conf 80） */
function clubOf(pts: ({ x: number; y: number } | null)[], clubLen = 555) {
  return {
    v: 1 as const,
    t: pts.map((_, i) => i * 33),
    p: pts.map((p) => (p ? [Math.round((p.x / AW) * 1000), Math.round((p.y / AH) * 1000), 80] : [])),
    clubLen,
  };
}

test("アーク: なめらかな弧は実線のアンカー列にまとまる（30分割方式）", () => {
  // 中心(540,1000)半径600の弧を40コマ（1コマ約5度＝50px前後の動き）
  const pts = Array.from({ length: 40 }, (_, i) => {
    const ang = ((-90 + i * 5) * Math.PI) / 180;
    return { x: 540 + Math.cos(ang) * 600, y: 1000 + Math.sin(ang) * 600 };
  });
  const segs = buildClubArc(clubOf(pts), AW, AH);
  assert.ok(segs.length >= 8, `アンカー区間ができる (実際 ${segs.length})`);
  assert.ok(segs.every((s) => s.kind === "measured"), "全部実線（推定なし）");
  // なめらかにしても元の弧から大きくは離れない（データに無い場所へ線を引かない）
  for (const s of segs) for (const p of s.pts) {
    const r = Math.hypot(p.x * AW - 540, p.y * AH - 1000);
    assert.ok(Math.abs(r - 600) < 45, `弧の上にある (実際 r=${r.toFixed(0)})`);
  }
});

test("アーク: 大きな空白は飛び越えず、点の多い側だけ描く（落書き防止）", () => {
  // バック側20コマ → 25コマの空白 → 別の場所に20コマ。
  // 空白は区間6個ぶんの上限を超えるので、無理につながず片側だけを描く
  const pts: ({ x: number; y: number } | null)[] = [];
  for (let i = 0; i < 20; i++) pts.push({ x: 150 + i * 15, y: 1500 });
  for (let i = 0; i < 25; i++) pts.push(null);
  for (let i = 0; i < 20; i++) pts.push({ x: 900 - i * 15, y: 300 });
  const segs = buildClubArc(clubOf(pts), AW, AH);
  assert.ok(segs.length > 0, "片側は描ける");
  // どの線も空白の中間帯（y=700〜1200px）を通らない＝知らない場所に線を引かない
  for (const s of segs) for (const p of s.pts) {
    const y = p.y * AH;
    assert.ok(y < 700 || y > 1200, `中間帯を通らない (実際 y=${y.toFixed(0)})`);
  }
});

test("アーク: 骨格があれば前腕から90度超の点は使わない（ネットの揺れ対策）", () => {
  // 前腕は右向き（肘(400,1000)→手首(540,1000)）。ヘッドが真後ろ（左）にある点は有り得ない
  const row = new Array(99).fill(0);
  const set = (j: number, x: number, y: number) => {
    row[j * 3] = Math.round((x / AW) * 1000);
    row[j * 3 + 1] = Math.round((y / AH) * 1000);
  };
  set(LM.lWrist, 540, 1000); set(LM.rWrist, 540, 1000);
  set(LM.lElbow, 400, 1000); set(LM.rElbow, 400, 1000);
  const pts = Array.from({ length: 12 }, (_, i) => ({ x: 100 - i * 2, y: 1000 })); // 手首の真後ろ
  const club = clubOf(pts);
  const pose = { v: 1 as const, t: club.t, p: club.t.map(() => [...row]) };
  assert.deepEqual(buildClubArc(club, AW, AH, { pose }), [], "全部落ちる");
  // 前腕と同じ向き（右）なら残る
  const ok = Array.from({ length: 12 }, (_, i) => ({ x: 940 + i * 2, y: 1000 }));
  const segs = buildClubArc(clubOf(ok), AW, AH, { pose });
  assert.ok(segs.length >= 8, `アンカー区間ができる (実際 ${segs.length})`);
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

/* --- 撮影方向（三脚を据えない運用のための目安） -------------------- */

test("撮影方向: 肩が目一杯写れば正面、カメラを向いて短ければ後方", () => {
  const stand = (shoulderHalf: number): Landmarks =>
    lmWith({
      [LM.lShoulder]: [0.5 - shoulderHalf, 0.3], [LM.rShoulder]: [0.5 + shoulderHalf, 0.3],
      [LM.lAnkle]: [0.5, 0.9], [LM.rAnkle]: [0.5, 0.9],
    });
  // 肩〜足首 = 0.6 × 1000px = 600px。正面は 肩幅/身長 ≒ 0.30 → 肩幅 180px → half 0.09
  const face = viewPoint(stand(0.09), 1000, 1000);
  const dtl = viewPoint(stand(0.012), 1000, 1000);
  assert.ok(face && face.label === "正面", `正面と出る (実際 ${face?.label}${face?.deg})`);
  assert.ok(dtl && dtl.label === "後方", `後方と出る (実際 ${dtl?.label}${dtl?.deg})`);
  assert.equal(face!.fill, 60, "体が画面の何%かも返す（撮影距離の目安）");
});

test("撮影方向: 体が小さすぎて測れないときは null", () => {
  const tiny = lmWith({
    [LM.lShoulder]: [0.5, 0.5], [LM.rShoulder]: [0.5, 0.5],
    [LM.lAnkle]: [0.5, 0.51], [LM.rAnkle]: [0.5, 0.51],
  });
  assert.equal(viewPoint(tiny, 1000, 1000), null);
});

/* ---------- 出来上がった軌跡がスイングとしてありうるか（#185） ----------
   本番データ（2026-08-29）で「線は出ているのに中身が腕だった」実例をそのままケースにする。
   video 71fb30cd: 147コマ中146コマで線・conf 75% と報告されたが、
                   ヘッドは一度も手元より下に来ず、縦の動きは体の24%しかなかった。   */
import { verifySwingTrack, type PoseData, type ClubData } from "../apps/lesson-os/src/lib/pose.ts";

const VW = 1080;
const VH = 1920;

/** 33関節×xyz を1000倍した整数の行を作る（要る関節だけ埋める） */
function poseRow(o: { wristY: number; wristX?: number; shoulderY?: number; ankleY?: number }): number[] {
  const row = new Array(99).fill(0);
  const set = (j: number, x: number, y: number) => {
    row[j * 3] = Math.round((x / VW) * 1000);
    row[j * 3 + 1] = Math.round((y / VH) * 1000);
  };
  const wx = o.wristX ?? 540;
  set(15, wx, o.wristY); // 左手首
  set(16, wx, o.wristY); // 右手首
  set(11, 540, o.shoulderY ?? 600); // 肩
  set(12, 540, o.shoulderY ?? 600);
  set(27, 540, o.ankleY ?? 1600); // 足首（肩〜足首＝体の大きさ 1000px）
  set(28, 540, o.ankleY ?? 1600);
  set(13, 540, 700); // 肘
  set(14, 540, 700);
  return row;
}

function make(frames: { wristY: number; wristX?: number; cx: number; cy: number; conf?: number }[]) {
  const pose: PoseData = { v: 1, t: frames.map((_, i) => i * 33), p: frames.map((f) => poseRow(f)) };
  const club: ClubData = {
    v: 1,
    t: frames.map((_, i) => i * 33),
    // cx,cy は px 指定 → 保存形式（0〜1000の正規化）に直して入れる。
    // ⚠ 以前はここが px のままで、本体の単位ミス（正規化とpxの混同）と打ち消し合って
    //   バグを見逃していた（2026-08-29 に IMG_8982 の棄却で発覚）。
    p: frames.map((f) => [Math.round((f.cx / VW) * 1000), Math.round((f.cy / VH) * 1000), f.conf ?? 80]),
    clubLen: 600,
  };
  return { pose, club };
}

test("ヘッドが一度も手元より下に来なければ却下する（腕を追っている）", () => {
  // 本番 71fb30cd の再現: ヘッドは常に手元より上、縦の動きもわずか
  const { pose, club } = make(
    Array.from({ length: 40 }, (_, i) => ({
      wristY: 1000,
      cx: 400 + i * 10,
      cy: 800 + (i % 5) * 10, // 手元(1000)より常に上
    }))
  );
  const v = verifySwingTrack(pose, club, VW, VH);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /手元より下/);
  assert.equal(v.belowHands, 0);
});

test("ヘッドの縦の動きが体の大きさに対して小さすぎれば却下する", () => {
  // 手元より下には来るが、縦にほとんど動いていない
  const { pose, club } = make(
    Array.from({ length: 40 }, (_, i) => ({
      wristY: 900,
      cx: 300 + i * 12,
      cy: 1000 + (i % 4) * 20, // 常に手元より下だが縦の幅は60px（体は1000px）
    }))
  );
  const v = verifySwingTrack(pose, club, VW, VH);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /縦の動き/);
});

test("ちゃんとしたスイングは通す（地面から頭上まで回る）", () => {
  const frames = Array.from({ length: 60 }, (_, i) => {
    const ang = (-90 + (i / 59) * 300) * (Math.PI / 180); // 300度ぶん回す
    return {
      wristY: 1000,
      cx: 540 + Math.cos(ang) * 600,
      cy: 1000 + Math.sin(ang) * 600, // 手元の上下600px＝体の60%を超える
    };
  });
  const { pose, club } = make(frames);
  const v = verifySwingTrack(pose, club, VW, VH);
  assert.equal(v.ok, true, v.reason ?? "");
  assert.equal(v.reason, null);
  assert.ok(v.belowHands > 0);
});

test("クラブが無ければ理由を返す（例外にしない）", () => {
  const { pose } = make([{ wristY: 1000, cx: 0, cy: 0 }]);
  const v = verifySwingTrack(pose, null, VW, VH);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /見つかりませんでした/);
});

test("手元が速すぎる撮り方は、スロー撮影を促す案内になる", () => {
  // 1コマで手元が体の10%（100px）動く＝通常速度で撮った動画
  const frames = Array.from({ length: 20 }, (_, i) => ({
    wristY: 1000,
    wristX: 400 + i * 100,
    cx: 400 + i * 100,
    cy: 800,
  }));
  const { pose, club } = make(frames);
  const v = verifySwingTrack(pose, club, VW, VH);
  assert.equal(v.ok, false);
  assert.ok(v.handSpeedPct >= 10, `handSpeedPct=${v.handSpeedPct}`);
  assert.match(v.advice ?? "", /スロー/);
});

test("スロー撮影ぶんの遅さなら、速度を理由にした案内は出さない", () => {
  const frames = Array.from({ length: 60 }, (_, i) => {
    const ang = (-90 + (i / 59) * 300) * (Math.PI / 180);
    return {
      wristY: 1000,
      wristX: 540 + i, // 1コマ1px＝体の0.1%
      cx: 540 + Math.cos(ang) * 600,
      cy: 1000 + Math.sin(ang) * 600,
    };
  });
  const { pose, club } = make(frames);
  const v = verifySwingTrack(pose, club, VW, VH);
  assert.ok(v.handSpeedPct < 4, `handSpeedPct=${v.handSpeedPct}`);
  assert.equal(v.advice, null);
});
