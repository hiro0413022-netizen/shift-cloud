"use client";

type Row = { code: string; name: string; count: number; fee: number; transport: number; special: number; total: number };

/** 振込用CSVの書き出し（追加提案）。委託先ごとの当月支払額を出力する */
export function CsvButton({ rows, ym }: { rows: Row[]; ym: string }) {
  const download = () => {
    const header = ["コード", "委託先", "件数", "委託料", "交通費", "特別手当", "支払合計"];
    const body = rows.map((r) => [r.code, r.name, r.count, r.fee, r.transport, r.special, r.total]);
    const csv = [header, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    // Excelで文字化けしないよう BOM を付ける
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `caddy_payments_${ym}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={download} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs" disabled={rows.length === 0}>
      振込用CSVを書き出し
    </button>
  );
}
