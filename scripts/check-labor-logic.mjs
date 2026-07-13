#!/usr/bin/env node
// 給与・労働時間ロジックの二重実装ガード（DECISIONS #53 / CIで実行）
//
// 背景: /hq が独自に work_minutes を合計し hourly_wage を掛けていたため、給与画面と数字が割れた
//       （15分丸めなし・月給者0円扱い・交通費/手当なし）。同じ事故を機械的に防ぐ。
//
// 禁止:
//   1. hourly_wage / monthly_salary を使った金額計算（乗除算）を payroll-calc.ts 以外で書く
//   2. work_minutes の集計（reduce / += / sum）を payroll-calc.ts・labor-summary.ts 以外で書く
//      ※ 単に1日分を表示する fmtMinutes(d.work_minutes) 等はOK
//   3. `${ym}-31` のような月末日決め打ち（31日が無い月で壊れる / AUDIT D-1）→ monthRange() を使う
//
// 追加が必要になったら ALLOW に理由つきで書く（無言で緩めない）。

import { readFileSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 計算の正典。ここだけは金額・時間の計算を書いてよい */
const ALLOW = [
  "apps/shift-cloud/src/lib/payroll-calc.ts", // 正典（金額・丸め）
  "apps/shift-cloud/src/lib/labor-summary.ts", // 正典（集計・店舗按分）
  "apps/shift-cloud/src/lib/attendance.ts", // work_minutes を作る側（拘束−休憩）
];

const RULES = [
  {
    id: "wage-arithmetic",
    // hourly_wage / monthly_salary を掛けたり割ったりしている行
    re: /(hourly_wage|monthly_salary)\s*[*/]|[*/]\s*(w\.|wage\.|.*\.)?(hourly_wage|monthly_salary)/,
    msg: "時給・月給を直接計算しています。payroll-calc.ts の calcMonthlyPayroll() を使ってください（丸め・月給・交通費・手当の反映漏れの原因）",
  },
  {
    id: "work-minutes-aggregate",
    // reduce/+=/sum で work_minutes を積算している行
    re: /(\+=\s*[\w.]*work_minutes)|(reduce\([^\n]*work_minutes)|(sum\([^\n]*work_minutes)/,
    msg: "work_minutes を直接集計しています。labor-summary.ts の summarizeLabor() を使ってください（15分丸めの掛け忘れの原因）",
  },
  {
    id: "hardcoded-month-end",
    re: /\$\{ym\}-31|`\$\{[\w.]+\}-31`/,
    msg: "月末日を -31 で決め打ちしています。payroll-calc.ts の monthRange() を使ってください（2月等で勤怠0件になる）",
  },
];

const files = globSync("apps/**/src/**/*.{ts,tsx}", { cwd: ROOT })
  .filter((f) => !ALLOW.includes(f.split("\\").join("/")));

const violations = [];
for (const f of files) {
  const path = join(ROOT, f);
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trim().startsWith("*") || line.trim().startsWith("//")) return; // コメントは対象外
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations.push({ file: relative(ROOT, path).split("\\").join("/"), line: i + 1, rule: rule.id, msg: rule.msg, src: line.trim() });
      }
    }
  });
}

if (violations.length) {
  console.error("❌ 給与・労働時間ロジックの二重実装を検出しました（DECISIONS #53）\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`    ${v.src}`);
    console.error(`    → ${v.msg}\n`);
  }
  process.exit(1);
}

console.log(`✅ 給与・労働時間ロジックの二重実装なし（${files.length}ファイル検査）`);
