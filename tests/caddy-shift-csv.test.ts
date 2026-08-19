import test from "node:test";
import assert from "node:assert/strict";
// ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
import { buildCsv, csvFileName, daysOfMonth, jpDate, toCsv, withBom, type ExportRow } from "../apps/caddy-os/src/lib/csv.ts";
import { isBillable, kindLabel } from "../apps/caddy-os/src/lib/shift.ts";

/* ============================================================
   ゴルフ場提出CSV と 確定フラグ（DECISIONS #140 / migration 0118）

   ここを固定しておく理由:
     - CSVはゴルフ場へそのまま送る＝間違えると外に出てしまう
     - 「仮」が売上・提出物へ混ざらないことは、この事業の一番の事故ポイント
   ============================================================ */

const ROWS: ExportRow[] = [
  { date: "2026-08-03", client_name: "加古川ゴルフ倶楽部", caddie_name: "山田花子", memo: null },
  { date: "2026-08-03", client_name: "加古川ゴルフ倶楽部", caddie_name: "鈴木一郎", memo: "1組目" },
  { date: "2026-08-15", client_name: "加古川ゴルフ倶楽部", caddie_name: "山田花子", memo: null },
];

test("standard: 日付/ゴルフ場/キャディ名/備考 の4列", () => {
  const csv = buildCsv("standard", ROWS, "2026-08");
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "日付,ゴルフ場,キャディ名,備考");
  assert.equal(lines[1], "8/3(月),加古川ゴルフ倶楽部,山田花子,");
  assert.equal(lines[2], "8/3(月),加古川ゴルフ倶楽部,鈴木一郎,1組目");
  assert.equal(lines.length, 4);
});

test("simple: 日付とキャディ名だけ", () => {
  const lines = buildCsv("simple", ROWS, "2026-08").split("\r\n");
  assert.equal(lines[0], "日付,キャディ名");
  assert.equal(lines[3], "8/15(土),山田花子");
});

test("grouped: キャディ別に勤務日をまとめる", () => {
  const lines = buildCsv("grouped", ROWS, "2026-08").split("\r\n");
  assert.equal(lines[0], "キャディ名,勤務日数,勤務日");
  assert.equal(lines[1], "山田花子,2,8/3(月) 8/15(土)");
  assert.equal(lines[2], "鈴木一郎,1,8/3(月)");
});

test("wide: 行=キャディ・列=日付 の ○ 表（31日分＋計）", () => {
  const lines = buildCsv("wide", ROWS, "2026-08").split("\r\n");
  const header = lines[0].split(",");
  assert.equal(header[0], "キャディ名");
  assert.equal(header.length, 1 + 31 + 1); // 8月は31日
  const yamada = lines.find((l) => l.startsWith("山田花子"))!.split(",");
  assert.equal(yamada[3], "○"); // 3日
  assert.equal(yamada[15], "○"); // 15日
  assert.equal(yamada[4], ""); // 4日は勤務なし
  assert.equal(yamada[yamada.length - 1], "2");
});

test("カンマ・引用符を含む備考は壊れない", () => {
  const csv = buildCsv("standard", [{ date: "2026-08-01", client_name: "A", caddie_name: "B", memo: '早出,"要確認"' }], "2026-08");
  assert.ok(csv.includes('"早出,""要確認"""'));
});

test("Excelで文字化けしないようBOMを付ける", () => {
  assert.equal(withBom("日付").charCodeAt(0), 0xfeff);
});

test("月末日は実在する日で数える（2月は28/29日）", () => {
  assert.equal(daysOfMonth("2026-02").length, 28);
  assert.equal(daysOfMonth("2028-02").length, 29);
  assert.equal(daysOfMonth("2026-08").length, 31);
});

test("ファイル名にファイルシステムで使えない文字が混ざらない", () => {
  assert.equal(csvFileName("A/B:C", "2026-08"), "A_B_C_2026-08_派遣一覧.csv");
});

test("jpDate は 8/3(月) 形式", () => {
  assert.equal(jpDate("2026-08-03"), "8/3(月)");
});

test("toCsv は CRLF 区切り（Excel既定）", () => {
  assert.equal(toCsv([["a", "b"], [1, null]]), "a,b\r\n1,");
});

test("集計対象は確定のみ。仮・取消は入らない", () => {
  assert.equal(isBillable({ status: "confirmed" }), true);
  assert.equal(isBillable({ status: "tentative" }), false);
  assert.equal(isBillable({ status: "cancelled" }), false);
  // status を持たない古い行は確定扱い（migration 0118 の default と一致させる）
  assert.equal(isBillable({}), true);
});

test("勤務区分の表示名", () => {
  assert.equal(kindLabel("dispatch"), "派遣");
  assert.equal(kindLabel("golfwing"), "GW勤務");
  assert.equal(kindLabel("unknown"), "unknown");
});
