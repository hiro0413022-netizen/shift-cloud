/**
 * ビルド前に MediaPipe の wasm とモデルを public/mp/ に用意する（2026-08-28）
 *
 * なぜコミットせずビルド時に置くか:
 *   wasm 4.4MB ＋ モデル 5.4MB。リポジトリはPublicで、他アプリのビルドも重くなる。
 *   wasm は node_modules から複製、モデルだけ Google の配布元から一度だけ落とす。
 *
 * 失敗しても絶対にビルドを止めない。
 *   用意できなければ実行時にCDNへ落ちる（src/lib/pose.ts の headOk 判定）。
 *   ネットワークが無い顧客環境でビルドが赤くなる方が困る。
 */
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const out = path.join(process.cwd(), "public", "mp");
const warn = (m) => console.warn(`[prepare-mediapipe] ${m}（実行時はCDNに落ちます）`);

const exists = (p) => stat(p).then(() => true, () => false);

try {
  await mkdir(out, { recursive: true });

  // 1) wasm を node_modules から複製
  //    ディレクトリ丸ごとではなく必要な4つだけ。module 版（11MB）は useModule=false では使わない。
  //    1つずつ複製するのは、node_modules が欠けている開発機でも残りは揃えるため。
  const WASM = [
    "vision_wasm_internal.js",
    "vision_wasm_internal.wasm",          // SIMD 版（実質これが使われる）
    "vision_wasm_nosimd_internal.js",
    "vision_wasm_nosimd_internal.wasm",   // 古い端末向けフォールバック
  ];
  try {
    const require = createRequire(import.meta.url);
    // exports マップがあるので package.json は直接 resolve できない。本体から辿る
    const entry = require.resolve("@mediapipe/tasks-vision");
    const from = path.join(path.dirname(entry), "wasm");
    await mkdir(path.join(out, "wasm"), { recursive: true });
    for (const f of WASM) {
      try {
        await cp(path.join(from, f), path.join(out, "wasm", f));
      } catch (e) {
        warn(`${f} を複製できませんでした: ${e.message}`);
      }
    }
  } catch (e) {
    warn(`wasm を複製できませんでした: ${e.message}`);
  }

  // 2) モデル（既にあれば触らない＝ビルドのたびに落とさない）
  const model = path.join(out, "pose_landmarker_lite.task");
  if (!(await exists(model))) {
    try {
      const res = await fetch(MODEL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(model, Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      warn(`モデルを取得できませんでした: ${e.message}`);
    }
  }
} catch (e) {
  warn(e.message);
}
