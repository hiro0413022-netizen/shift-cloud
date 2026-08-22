"use client";

import { useState } from "react";
import {
  buildCsv,
  exportFileName,
  CSV_FORMATS,
  isTentative,
  jpDate,
  withBom,
  type CsvFormat,
  type ExportRow,
} from "@/lib/csv";
import { clientTone } from "@/lib/client-colors";

/**
 * 1ゴルフ場ぶんのプレビュー＋CSV／PDFダウンロード。
 *
 * CSVの組み立ては純粋関数（lib/csv.ts）なので、サーバーに問い合わせず画面でそのまま作れる。
 * ＝ プレビューとダウンロードが必ず一致する（別々に組み立てるとズレる）。
 * PDFはフォント埋め込みが要るのでサーバー（/exports/pdf）で作る。元データは同じなので中身は一致する。
 */
export function ExportPanel({
  ym,
  client,
  rows,
  withTentative,
}: {
  ym: string;
  client: { id: string; name: string; csv_format: CsvFormat; contact_name: string | null; contact_email: string | null };
  rows: ExportRow[];
  withTentative: boolean;
}) {
  const [format, setFormat] = useState<CsvFormat>(client.csv_format ?? "standard");
  const [open, setOpen] = useState(false);

  const download = () => {
    const blob = new Blob([withBom(buildCsv(format, rows, ym))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(client.name, ym, "csv", withTentative);
    a.click();
    URL.revokeObjectURL(url);
  };

  const days = new Set(rows.map((r) => r.date)).size;
  const caddies = new Set(rows.map((r) => r.caddie_name)).size;
  const kari = rows.filter(isTentative).length;
  const pdfHref = `/exports/pdf?ym=${ym}&client=${client.id}${withTentative ? "&kari=1" : ""}`;

  return (
    <div className="rounded-lg border border-(--color-line) p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-medium">
            <span className={`inline-block h-3 w-3 rounded-sm ${clientTone(client.id).dot}`} />
            {client.name}
          </p>
          <p className="text-xs text-(--color-dim)">
            {rows.length} 人工 / {days} 日 / キャディ {caddies} 名
            {kari > 0 ? <span className="ml-1 text-amber-700">（うち仮 {kari}）</span> : null}
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
          {rows.length === 0 ? (
            <span className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm text-(--color-dim) opacity-50">
              PDF
            </span>
          ) : (
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent)"
            >
              PDF
            </a>
          )}
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
          <p className="mt-3 text-sm text-(--color-dim)">
            この月に出せる派遣はありません{withTentative ? "" : "（仮のままの分は「仮も含めて出す」で入ります）"}
          </p>
        ) : (
          <div className="mt-3 max-h-72 overflow-auto rounded border border-(--color-line)">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-(--color-panel-2) text-left text-(--color-dim)">
                <tr>
                  <th className="p-1.5">日付</th>
                  <th className="p-1.5">キャディ名</th>
                  {kari > 0 ? <th className="p-1.5">状態</th> : null}
                  <th className="p-1.5">備考</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.date}-${r.caddie_name}-${i}`} className="border-t border-(--color-line)">
                    <td className="p-1.5 whitespace-nowrap">{jpDate(r.date)}</td>
                    <td className="p-1.5">{r.caddie_name}</td>
                    {kari > 0 ? (
                      <td className={`p-1.5 whitespace-nowrap ${isTentative(r) ? "text-amber-700" : "text-(--color-dim)"}`}>
                        {isTentative(r) ? "仮" : "確定"}
                      </td>
                    ) : null}
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
