"use client";

import { useState } from "react";
import { buildCsv, csvFileName, CSV_FORMATS, jpDate, withBom, type CsvFormat, type ExportRow } from "@/lib/csv";

/**
 * 1ゴルフ場ぶんのプレビュー＋CSVダウンロード。
 * CSVの組み立ては純粋関数（lib/csv.ts）なので、サーバーに問い合わせず画面でそのまま作れる。
 * ＝ プレビューとダウンロードが必ず一致する（別々に組み立てるとズレる）。
 */
export function ExportPanel({
  ym,
  client,
  rows,
}: {
  ym: string;
  client: { id: string; name: string; csv_format: CsvFormat; contact_name: string | null; contact_email: string | null };
  rows: ExportRow[];
}) {
  const [format, setFormat] = useState<CsvFormat>(client.csv_format ?? "standard");
  const [open, setOpen] = useState(false);

  const download = () => {
    const blob = new Blob([withBom(buildCsv(format, rows, ym))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(client.name, ym);
    a.click();
    URL.revokeObjectURL(url);
  };

  const days = new Set(rows.map((r) => r.date)).size;
  const caddies = new Set(rows.map((r) => r.caddie_name)).size;

  return (
    <div className="rounded-lg border border-(--color-line) p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{client.name}</p>
          <p className="text-xs text-(--color-dim)">
            確定 {rows.length} 人工 / {days} 日 / キャディ {caddies} 名
            {client.contact_name ? ` ・ 担当 ${client.contact_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as CsvFormat)}
            className="rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm"
          >
            {CSV_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}（{f.hint}）
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm"
          >
            {open ? "閉じる" : "内容を見る"}
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={download}
            className="rounded-lg bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            CSV
          </button>
          {client.contact_email ? (
            <a
              href={`mailto:${client.contact_email}?subject=${encodeURIComponent(
                `${ym.replace("-", "年")}月 キャディ派遣日一覧（株式会社YOZAN）`
              )}`}
              className="text-xs underline"
            >
              メール作成
            </a>
          ) : null}
        </div>
      </div>

      {open ? (
        rows.length === 0 ? (
          <p className="mt-3 text-sm text-(--color-dim)">この月の確定した派遣はありません</p>
        ) : (
          <div className="mt-3 max-h-72 overflow-auto rounded border border-(--color-line)">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-(--color-panel-2) text-left text-(--color-dim)">
                <tr>
                  <th className="p-1.5">日付</th>
                  <th className="p-1.5">キャディ名</th>
                  <th className="p-1.5">備考</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.date}-${r.caddie_name}-${i}`} className="border-t border-(--color-line)">
                    <td className="p-1.5 whitespace-nowrap">{jpDate(r.date)}</td>
                    <td className="p-1.5">{r.caddie_name}</td>
                    <td className="p-1.5 text-(--color-dim)">{r.memo ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
