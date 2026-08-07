"use client";

import { useEffect, useState } from "react";
import { yen, btnGhostCls } from "@/components/ui";
import { getCustomerHistory, type CustomerHistory } from "./actions";

/**
 * お客様名をクリックしたときに出す購入履歴。
 * 名簿は持たず「売上明細に出てくる名前」で引くので、表記ゆれ（全角スペース有無など）は別人扱いになる。
 */
export default function CustomerHistoryDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const [data, setData] = useState<CustomerHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCustomerHistory(name)
      .then((d) => { if (alive) setData(d); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-(--color-line) bg-(--color-panel) p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} の購入履歴`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{name}</h2>
            <p className="text-xs text-(--color-dim)">
              {data?.memberKind ? `${data.memberKind}・` : ""}この店舗での購入履歴
            </p>
          </div>
          <button type="button" onClick={onClose} className={btnGhostCls}>閉じる</button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-(--color-dim)">読み込み中…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-(--color-dim)">履歴が見つかりませんでした</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="累計（税抜）" value={`${yen(data.total)} 円`} />
              <Stat label="明細数" value={`${data.count} 件`} />
              <Stat label="来店日数" value={`${data.visitDays} 日`} />
              <Stat label="最終来店" value={data.lastOn ?? "—"} />
            </div>
            <p className="mb-2 text-xs text-(--color-dim)">
              初回 {data.firstOn ?? "—"}
              {data.truncated && "（件数が多いため直近分のみ表示しています）"}
            </p>

            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-(--color-panel)">
                  <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                    <th className="py-2 pr-2 text-left font-medium">日付</th>
                    <th className="px-2 py-2 text-left font-medium">区分</th>
                    <th className="px-2 py-2 text-left font-medium">品名・内容</th>
                    <th className="px-2 py-2 text-left font-medium">担当</th>
                    <th className="px-2 py-2 text-right font-medium">金額</th>
                    <th className="px-2 py-2 text-left font-medium">支払</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-b border-(--color-line)">
                      <td className="py-2 pr-2 tabular-nums whitespace-nowrap text-(--color-dim)">{r.soldOn}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{r.category || "—"}</td>
                      <td className="px-2 py-2">
                        {r.productName || "—"}
                        {r.qty > 1 && <span className="ml-1 text-xs text-(--color-dim)">×{r.qty}</span>}
                        {r.memo && <span className="ml-2 text-xs text-(--color-dim)">{r.memo}</span>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-(--color-dim)">{r.pro || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{yen(r.amount)}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-(--color-dim)">{r.payMethod || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-(--color-line) p-2">
      <p className="text-xs text-(--color-dim)">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
    </div>
  );
}
