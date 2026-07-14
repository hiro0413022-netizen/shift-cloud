#!/usr/bin/env node
// new-app.mjs — 独立アプリの雛形生成器（AUDIT_2026-07-11 B-4 / DECISIONS #35）
// 「入力面は独立アプリ / GENESISは閲覧＋承認 / DBは共有」の勝ちパターンを型として固定化する。
//
// 使い方:
//   npm run new-app -- --name booking-os --title "Booking OS" --prefix bkg \
//     --permission use_booking --port 3006 --desc "○○の受付・管理"
//
// 生成後にやること（スクリプトが最後に表示する / OPERATIONS.md §「新アプリ デプロイ定型」参照）:
//   1. ルートで npm install（workspaceリンク）
//   2. supabase/migrations/00XX_<prefix>.sql を追加（番号は migrations/README.md 台帳で確認）
//   3. ユーザーPCから push → Vercel新規プロジェクト作成（Root=apps/<name>、env 3つ）
//   4. vault_systems へ登録（Vaultルール #26）

import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const name = arg("name");
const title = arg("title");
const prefix = arg("prefix");
const permission = arg("permission", name ? `use_${name.replace(/-os$/, "").replace(/-/g, "_")}` : null);
const port = arg("port");
const desc = arg("desc", title ?? "");

function fail(msg) {
  console.error(`✖ ${msg}`);
  console.error(
    '\n使い方: npm run new-app -- --name booking-os --title "Booking OS" --prefix bkg --permission use_booking --port 3006 --desc "説明"'
  );
  process.exit(1);
}

if (!name || !/^[a-z][a-z0-9-]+$/.test(name)) fail("--name は英小文字ケバブケース（例: booking-os）");
if (!title) fail("--title は必須（例: \"Booking OS\"）");
if (!prefix || !/^[a-z]{2,5}$/.test(prefix)) fail("--prefix は英小文字2〜5文字（例: bkg → テーブルは bkg_*）");
if (!port || !/^3\d{3}$/.test(port)) fail("--port は3000番台（既存: genesis/shift-cloud/member-os=3001, survey-os=3003, legal-os/reserve-os=3004 等と重複しない番号）");

const dest = join(root, "apps", name);
if (existsSync(dest)) fail(`apps/${name} は既に存在します`);

const src = join(root, "templates", "app-template");
if (!existsSync(src)) fail("templates/app-template が見つかりません");

cpSync(src, dest, { recursive: true });

const tokens = {
  __APP_NAME__: name,
  __APP_TITLE__: title,
  __PREFIX__: prefix,
  __PERMISSION__: permission,
  __PORT__: port,
  __DESC__: desc,
};

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else {
      let text = readFileSync(p, "utf8");
      for (const [k, v] of Object.entries(tokens)) text = text.replaceAll(k, v);
      writeFileSync(p, text);
    }
  }
}
walk(dest);

console.log(`✔ apps/${name} を生成しました（${title} / ${prefix}_* / ${permission} / port ${port}）`);
console.log(`
次にやること:
  1. ルートで npm install（@yozan/core のworkspaceリンク）
  2. ローカル確認: npm run dev -w apps/${name} → http://localhost:${port}
  3. DBスキーマ: supabase/migrations/ に ${prefix}_* テーブルを追加
     （番号は supabase/migrations/README.md の台帳で最新+1。追加のみ・破壊的変更禁止）
  4. 権限 ${permission} を roles.permissions に追加（付与手順: OPERATIONS.md）
  5. デプロイ: OPERATIONS.md §「新アプリ デプロイ定型チェックリスト」の通り
     （push→Vercel新規プロジェクト Root=apps/${name}、env 3つ→vault_systems登録 #26）
`);
