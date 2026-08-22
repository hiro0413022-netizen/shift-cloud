/* ============================================================
   ゴルフ場へ提出する「派遣日一覧」CSV（DECISIONS #140 / migration 0118）

   ゴルフ場ごとに欲しい形が違う。書式は取引先マスタ（cad_clients.csv_format）に持ち、
   ここでは **純粋関数** として切り替えるだけにする。DBにもUIにも依存しないので、
   将来ゴルフ場が増えても `FORMATS` に1つ足すだけで済む（画面・API側は無改修）。

   既定は「確定」のみ。ただし小川さん依頼（2026-08-22）で **仮のまま提出したい**（先にゴルフ場へ
   予定として渡し、後で確定を送り直す運用）ケースがあるため、仮を含めることもできる。

   ⚠ **仮かどうかはゴルフ場に出さない**（#145b・小川さん指示）。ゴルフ場から見ればこれは
   「提出された予定」であって、確定/仮はYOZAN社内の管理状態でしかない。提出物（CSV/PDF）には
   行ごとの状態も件数も出さず、表題とファイル名を「予定」にするだけにとどめる。
   社内画面（カレンダー・派遣台帳・提出プレビュー）では引き続き 破線＋「仮」で区別できる。
   ============================================================ */

export type CsvFormat = "standard" | "simple" | "grouped" | "wide";

export const CSV_FORMATS: Array<{ value: CsvFormat; label: string; hint: string }> = [
  { value: "standard", label: "標準", hint: "日付 / ゴルフ場 / キャディ名 / 備考" },
  { value: "simple", label: "シンプル", hint: "日付 / キャディ名 だけ" },
  { value: "grouped", label: "キャディ別", hint: "キャディ名 / 勤務日数 / 勤務日（カンマ区切り）" },
  { value: "wide", label: "カレンダー表", hint: "行=キャディ、列=日付 の ○ 表" },
];

export type ExportRow = {
  date: string; // YYYY-MM-DD
  client_name: string;
  caddie_name: string;
  memo: string | null;
  /** "confirmed" | "tentative"。仮を含めて出すときだけ表示に効く */
  status?: string;
};

/** 仮の行か。**社内画面の表示にだけ使う**（提出物には出さない・#145b） */
export function isTentative(r: ExportRow): boolean {
  return r.status === "tentative";
}


const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-08-19" → "8/19(水)"。Excelが日付として壊さないよう文字列で出す */
export function jpDate(d: string): string {
  const [, m, day] = d.split("-");
  const wd = WD[new Date(`${d}T00:00:00Z`).getUTCDay()];
  return `${Number(m)}/${Number(day)}(${wd})`;
}

/** CSVの1セル。カンマ・改行・引用符を含む値だけ引用する */
export function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Array<string | number | null>>): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** 月の日付リスト（"YYYY-MM" → ["YYYY-MM-01", …]） */
export function daysOfMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * 書式ごとにCSV本体を組み立てる。
 * rows は日付昇順・同日はキャディ名順で渡すこと（buildExportRows がその順で返す）。
 */
export function buildCsv(format: CsvFormat, rows: ExportRow[], ym: string): string {
  // 提出物に「仮」の印は入れない（#145b）。社内で仮と確定を見分けるのは画面側の仕事。
  switch (format) {
    case "simple":
      return toCsv([["日付", "キャディ名"], ...rows.map((r) => [jpDate(r.date), r.caddie_name])]);

    case "grouped": {
      const m = new Map<string, string[]>();
      for (const r of rows) {
        const cur = m.get(r.caddie_name) ?? [];
        cur.push(jpDate(r.date));
        m.set(r.caddie_name, cur);
      }
      return toCsv([
        ["キャディ名", "勤務日数", "勤務日"],
        ...[...m.entries()].map(([name, ds]) => [name, ds.length, ds.join(" ")]),
      ]);
    }

    case "wide": {
      const days = daysOfMonth(ym);
      const names = [...new Set(rows.map((r) => r.caddie_name))].sort();
      const set = new Set(rows.map((r) => `${r.caddie_name}|${r.date}`));
      return toCsv([
        ["キャディ名", ...days.map((d) => String(Number(d.slice(-2)))), "計"],
        ...names.map((n) => [
          n,
          ...days.map((d) => (set.has(`${n}|${d}`) ? "○" : "")),
          days.filter((d) => set.has(`${n}|${d}`)).length,
        ]),
      ]);
    }

    case "standard":
    default:
      return toCsv([
        ["日付", "ゴルフ場", "キャディ名", "備考"],
        ...rows.map((r) => [jpDate(r.date), r.client_name, r.caddie_name, r.memo ?? ""]),
      ]);
  }
}

/**
 * ゴルフ場へメール添付する前提なので **Excelがそのまま開ける** ようBOM付きUTF-8で返す。
 * （BOMなしだと日本語がShift_JIS扱いで文字化けする。現場で必ず踏む）
 */
export function withBom(csv: string): string {
  return `﻿${csv}`;
}

/** 提出ファイル名。例: 加古川ゴルフ倶楽部_2026-08_派遣一覧.csv ／ 仮込みは「_予定」を付ける */
export function exportFileName(clientName: string, ym: string, ext: "csv" | "pdf", withTentative = false): string {
  const safe = clientName.replace(/[\\/:*?"<>|]/g, "_");
  return `${safe}_${ym}_派遣一覧${withTentative ? "_予定" : ""}.${ext}`;
}

/** @deprecated exportFileName を使う */
export function csvFileName(clientName: string, ym: string): string {
  return exportFileName(clientName, ym, "csv");
}
