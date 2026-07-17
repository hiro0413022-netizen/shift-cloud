#!/usr/bin/env node
// 途中で切れたファイル（truncated file）検査 — push前の安全弁。
//
// 背景: Coworkサンドボックスから見えるプロジェクトフォルダは、日本語を含むファイルが
// 「文字数＝バイト数」で切られて見えることがある。その状態でコミットすると壊れたファイルが本番に入る
// （2026-07: templates/app-template/src/middleware.ts が349バイトで途切れた事故）。
//
// 使い方: node scripts/check-files.mjs   → 疑わしいファイルを一覧表示（0件なら exit 0）

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|sql|md|json|yml|yaml|html|svg)$/;
// 末尾がこれらで終わっていれば「文として閉じている」とみなす
const OK_TAIL = /[}\])>;,:.、。」）】\s*`'"|=-]$/;

const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && TEXT_EXT.test(f));

const bad = [];
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  if (!text.trim()) continue;

  const hasFinalNewline = text.endsWith("\n");
  const lastLine = text.replace(/\n+$/, "").split("\n").pop() ?? "";
  const tailOk = OK_TAIL.test(lastLine.trimEnd());

  // 末尾改行がなく、かつ最終行が文の途中で終わっている＝切れている疑い
  if (!hasFinalNewline && !tailOk) {
    bad.push({ f, lastLine: lastLine.slice(-60) });
    continue;
  }
  // 壊れたUTF-8（切断で生じる置換文字 U+FFFD）。
  // ただし、クォートで囲んだ1文字の文字列リテラルとして意図的にU+FFFDを書いている箇所は除く
  // （例: apps/*/src/lib/libkey.ts の復号化け判定。エスケープ付き \"…\" の形も除く）
  // ここでU+FFFDを直接書くとこのファイル自身が誤検知されるため、コード側でも文字コードから組み立てる
  const FFFD = String.fromCharCode(0xfffd);
  const withoutLiterals = text.replace(new RegExp(`\\\\?["'\`]${FFFD}\\\\?["'\`]`, "g"), "");
  if (withoutLiterals.includes(FFFD)) bad.push({ f, lastLine: "不正なUTF-8（U+FFFD）を含む" });
}

if (bad.length === 0) {
  console.log(`✅ ${files.length}ファイル検査: 途中で切れたファイルはありません`);
  process.exit(0);
}
console.error("⚠️ 途中で切れている疑いのあるファイル:");
for (const b of bad) console.error(`  - ${b.f}\n      …${b.lastLine}`);
console.error("\nWindows側の実ファイルを確認してください（コミットしないこと）。");
process.exit(1);
