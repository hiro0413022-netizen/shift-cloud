import test from "node:test";
import assert from "node:assert/strict";
// ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
import {
  MAX_PROMO_BYTES,
  downloadName,
  mp4DurationSeconds,
  promoPath,
  promoUploadError,
  resolveMime,
} from "../apps/shift-cloud/src/lib/promo.ts";

/* ============================================================
   広報素材（#251）: 動画30秒・50MB・形式の判定
   画面とサーバーが同じ関数を使う。数字を変えるときはここも変わる
   ============================================================ */

const base = { kind: "photo", title: "FRANK ロゴ", fileName: "a.jpg", mime: "image/jpeg", size: 1000, durationSec: null };

test("写真・ロゴ・動画の基本", () => {
  assert.equal(promoUploadError(base), null);
  assert.equal(promoUploadError({ ...base, kind: "logo", fileName: "logo.svg", mime: "image/svg+xml" }), null);
  assert.equal(promoUploadError({ ...base, kind: "video", fileName: "v.mp4", mime: "video/mp4", durationSec: 30 }), null);
});

test("動画は30秒まで（丸めの0.5秒は通す）", () => {
  const v = { ...base, kind: "video", fileName: "v.mov", mime: "video/quicktime" };
  assert.equal(promoUploadError({ ...v, durationSec: 30.4 }), null);
  assert.match(promoUploadError({ ...v, durationSec: 31 }) ?? "", /30秒まで/);
  assert.match(promoUploadError({ ...v, durationSec: null }) ?? "", /長さを読み取れません/);
});

test("大きさ・種類の取り違え・名前なし", () => {
  assert.match(promoUploadError({ ...base, size: MAX_PROMO_BYTES + 1 }) ?? "", /50MB/);
  assert.match(promoUploadError({ ...base, kind: "photo", fileName: "v.mp4", mime: "video/mp4" }) ?? "", /画像ファイル/);
  assert.match(promoUploadError({ ...base, kind: "video" }) ?? "", /動画ファイル/);
  assert.match(promoUploadError({ ...base, title: "  " }) ?? "", /名前/);
  assert.match(promoUploadError({ ...base, fileName: "a.pdf", mime: "application/pdf" }) ?? "", /形式/);
});

test("type が空でも拡張子で判定（Windows の .mov）", () => {
  assert.deepEqual(resolveMime("IMG_0001.MOV", ""), { mime: "video/quicktime", ext: "mov" });
  assert.deepEqual(resolveMime("x.jpeg", ""), { mime: "image/jpeg", ext: "jpg" });
  assert.equal(resolveMime("x.exe", ""), null);
});

test("保存先パスとダウンロード名", () => {
  const p = promoPath("c1", "video", "mov", new Date("2026-09-17T03:00:00Z"), "ab/c..d");
  assert.match(p, /^c1\/video\/20260917-\d+-abcd\.mov$/);
  assert.equal(downloadName('ロゴ:白/黒', "c1/logo/x.png"), "ロゴ_白_黒.png");
});

/** mvhd を持つ最小の MP4 を組み立てる */
function fakeMp4(timescale: number, duration: number, version: 0 | 1 = 0): ArrayBuffer {
  const mvhdBody = version === 0 ? 100 : 112;
  const mvhdSize = 8 + mvhdBody;
  const moovSize = 8 + mvhdSize;
  const ftypSize = 16;
  const buf = new ArrayBuffer(ftypSize + moovSize);
  const v = new DataView(buf);
  const put = (off: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  v.setUint32(0, ftypSize); put(4, "ftyp"); put(8, "isom");
  v.setUint32(ftypSize, moovSize); put(ftypSize + 4, "moov");
  const m = ftypSize + 8;
  v.setUint32(m, mvhdSize); put(m + 4, "mvhd");
  const p = m + 8;
  v.setUint8(p, version);
  if (version === 0) {
    v.setUint32(p + 12, timescale);
    v.setUint32(p + 16, duration);
  } else {
    v.setUint32(p + 20, timescale);
    v.setUint32(p + 24, 0);
    v.setUint32(p + 28, duration);
  }
  return buf;
}

test("MP4/MOV の長さを中身から読む（v0 / v1）", () => {
  assert.equal(mp4DurationSeconds(fakeMp4(600, 600 * 29.5)), 29.5);
  assert.equal(mp4DurationSeconds(fakeMp4(90000, 90000 * 45, 1)), 45);
  assert.equal(mp4DurationSeconds(new ArrayBuffer(10)), null);
});
