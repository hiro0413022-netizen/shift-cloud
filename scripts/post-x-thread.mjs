#!/usr/bin/env node
/**
 * Markdownの原稿 → X連続投稿（スレッド）の予約（migration 0096 / cnt_posts.thread_parts）
 *
 * ブラウザを開いて人が投稿する運用は、PCが起動していないと動かない＝仕組みとして成立しない。
 * このスクリプトは投稿しない。**予約するだけ**。実際の投稿は Vercel Cron
 * （/api/cron/execute・10分ごと）が publishDue() から行うので、PCの電源とは無関係に流れる。
 *
 * 原稿の書式（`---` の行で1投稿ずつ区切る。見出し `**1/9**` などの装飾行は自動で落とす）:
 *
 *     # タイトル（無視される）
 *     ---
 *     **1/9**
 *     1本目の本文
 *     ---
 *     **2/9**
 *     2本目の本文
 *
 * 使い方:
 *   node scripts/post-x-thread.mjs --file=X_スレッド原稿_YOZAN紹介.md --theme=会社紹介
 *      → 分割結果と各パートの文字数（X重み）を表示するだけ。DBは変更しない
 *   node scripts/post-x-thread.mjs --file=... --theme=会社紹介 --at="2026-08-07T20:00:00+09:00" --apply
 *      → cnt_posts に1行入れて予約する
 *
 * 主なオプション:
 *   --at=<ISO8601>   投稿予定時刻（既定: いま＝次の10分tickで投稿）
 *   --status=draft   下書きで入れる（cronは拾わない。デプロイ前に仕込むときに使う）
 *   --hook=<text>    一覧・カード用の見出し（既定: 1本目の先頭30字）
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const FILE = String(args.file || "");
const THEME = String(args.theme || "");
const APPLY = !!args.apply;
const STATUS = String(args.status || "scheduled");
const AT = args.at ? new Date(String(args.at)) : new Date();

if (!FILE || !THEME) {
  console.error("使い方: node scripts/post-x-thread.mjs --file=<md> --theme=<題材名> [--at=<ISO>] [--status=draft] [--apply]");
  process.exit(1);
}
if (Number.isNaN(AT.getTime())) {
  console.error(`--at の日時が読めません: ${args.at}`);
  process.exit(1);
}

// ---------- 原稿を投稿単位に割る ----------

/** X の文字数カウント（packages/content/src/x.ts の weightedLength と同じ規則。全角=2・半角=1） */
function weightedLength(text) {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const light =
      (cp >= 0x0000 && cp <= 0x10ff) ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    n += light ? 1 : 2;
  }
  return n;
}

export function splitMarkdownThread(md) {
  return md
    .split(/^---\s*$/m)
    .map((block) =>
      block
        .split("\n")
        // 見出し(# …)・通し番号(**1/9**)・注記行は投稿本文ではないので落とす
        .filter((line) => !/^#{1,6}\s/.test(line) && !/^\*\*\d+\s*\/\s*\d+\*\*\s*$/.test(line))
        .join("\n")
        .trim()
    )
    .filter((block) => block.length > 0)
    // 「全9投稿。各投稿は140字以内。」のような原稿のメモ書きだけの塊は捨てる
    .filter((block) => !/^全\d+投稿/.test(block));
}

const md = fs.readFileSync(FILE, "utf8");
const parts = splitMarkdownThread(md);

if (parts.length === 0) {
  console.error("投稿に分割できませんでした（`---` の行で区切ってください）");
  process.exit(1);
}

console.log(`\n${FILE} → ${parts.length}投稿\n`);
let over = 0;
parts.forEach((p, i) => {
  const w = weightedLength(p);
  const flag = w > 280 ? " ← 280超過（末尾が削られます）" : "";
  if (w > 280) over += 1;
  console.log(`--- ${i + 1}/${parts.length}  (${w}/280)${flag}`);
  console.log(p);
  console.log("");
});
if (over > 0) console.log(`⚠️ ${over}投稿が上限超過です。原稿を分けてください\n`);

if (!APPLY) {
  console.log("dry-run（--apply でDBに予約）");
  process.exit(0);
}

// ---------- 予約 ----------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// companies には FRANK GOLF も入っている。SNS投稿は株式会社YOZAN側に集約されているので名前で引く
// （limit(1) だと別会社を掴む＝別テナントに投稿が入る事故になる）
const { data: company, error: cErr } = await db
  .from("companies")
  .select("id")
  .eq("name", String(args.company || "株式会社YOZAN"))
  .maybeSingle();
if (cErr || !company) {
  console.error(`会社が特定できません: ${cErr?.message ?? "該当なし"}（--company=<会社名> で指定できます）`);
  process.exit(1);
}

// 同じ題材が未投稿で残っていれば二重に入れない（何度実行しても増えない）
const { data: dup } = await db
  .from("cnt_posts")
  .select("id, status")
  .eq("company_id", company.id)
  .eq("theme", THEME)
  .in("status", ["draft", "awaiting_approval", "scheduled"])
  .is("deleted_at", null);
if (dup && dup.length > 0) {
  console.log(`同じ題材「${THEME}」が既に予約済みです（id=${dup[0].id} / ${dup[0].status}）。何もしません`);
  process.exit(0);
}

const { data, error } = await db
  .from("cnt_posts")
  .insert({
    company_id: company.id,
    product: "yozan",
    platform: "x", // X専用（Instagramには配信しない）
    theme: THEME,
    hook: parts[0].replace(/\s+/g, " ").slice(0, 30),
    body: parts.join("\n\n"), // 一覧・承認カードでの表示用
    hashtags: [],
    status: STATUS,
    scheduled_at: AT.toISOString(),
    thread_parts: parts,
    source: { kind: "thread", parts: parts.length, file: FILE, generator: "manual" },
  })
  .select("id")
  .single();

if (error) {
  console.error(`予約に失敗: ${error.message}`);
  process.exit(1);
}
console.log(`✅ 予約しました id=${data.id} / status=${STATUS} / ${AT.toISOString()}`);
console.log("   投稿は Vercel Cron（/api/cron/execute・10分ごと）が行います。PCの電源は不要です");
