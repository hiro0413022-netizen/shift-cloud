"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFreeLine,
  addLaborLine,
  addProductLine,
  findProducts,
  removeItem,
  updateItems,
} from "../actions";
import { adoptTrialInto } from "@/app/f/[id]/actions";

/**
 * 御見積書そのものを編集する画面。
 *
 * 紙（00_雛形.xlsm）と同じ並び・同じ罫線で出して、そのセルの上で数量と掛け率を触る。
 * 「明細を作る画面」と「印刷プレビュー」を分けると、出来上がりが想像できないので分けない。
 *
 * ★ 追加は画面を作り直さない。押した瞬間に薄い行が出て、裏で保存してから実体になる。
 *   以前は追加のたびに全体が再描画され、探した商品の一覧まで消えていた。
 */

export type SheetRow = {
  id: number;
  demoNo: number | null;
  kind: string;
  name: string;
  maker: string;
  listPrice: number;
  discountAmount: number;
  discountReason: string;
  quantity: number;
  amount: number;
  rate: number | null;
  manual: boolean;
  reason: string | null;
  finishInch: number | null;
  isShaft: boolean;
};

export type SheetTotals = {
  subtotal: number;
  tax: number;
  taxFree: number;
  refund: number;
  prepaid: number;
  total: number;
  taxPct: number;
};

export type ProductHit = {
  id: number;
  item_category: string | null;
  manufacturer: string | null;
  name: string;
  spec: string | null;
  club_type: string | null;
  list_price: number | null;
};

export type LaborOption = {
  code: string;
  name: string;
  section: string;
  price: number | null;
  priceNote: string | null;
};

export type TrialOption = { id: number; demoNo: number | null; maker: string; name: string; listPrice: number | null };

const CATEGORIES = [
  "",
  "シャフト",
  "クラブ",
  "グリップ",
  "スリーブ",
  "ウッド用 ソケット",
  "アイアン用 ソケット",
  "ボール",
  "グローブ",
  "練習機",
  "工具",
];

const RATE_OPTIONS = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];

const yen = (n: number) => n.toLocaleString("ja-JP");
const offLabel = (rate: number | null) => {
  if (rate == null) return "—";
  const off = Math.round((1 - rate) * 1000) / 10;
  return off === 0 ? "定価" : `${off}%OFF`;
};

/** 帳票のセル。画面では枠線つきの入力欄、印刷では紙と同じ罫線だけ残る */
const cell = "border-b border-(--color-line) px-2 py-1.5 align-middle";
const numInput =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-sm tabular-nums hover:border-(--color-line) focus:border-(--color-accent) focus:bg-white focus:outline-none";
const textInput =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-(--color-line) focus:border-(--color-accent) focus:bg-white focus:outline-none";

export function QuoteSheet({
  quoteId,
  quoteNo,
  customerName,
  quoteDate,
  issuer,
  staffName,
  subject,
  deliveryNote,
  paymentTerms,
  validityNote,
  note,
  rows,
  totals,
  taxFreeAmount,
  prepaidAmount,
  refundAuto,
  refundAmount,
  refundNote,
  refundLines,
  refundAvailable,
  labor,
  trials,
  fittingId,
  fittingNo,
}: {
  quoteId: number;
  quoteNo: string;
  customerName: string;
  quoteDate: string;
  issuer: string;
  staffName: string;
  subject: string;
  deliveryNote: string;
  paymentTerms: string;
  validityNote: string;
  note: string;
  rows: SheetRow[];
  totals: SheetTotals;
  taxFreeAmount: number;
  prepaidAmount: number;
  refundAuto: boolean;
  refundAmount: number;
  refundNote: string;
  refundLines: string[];
  refundAvailable: boolean;
  labor: LaborOption[];
  trials: TrialOption[];
  fittingId: number | null;
  fittingNo: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<null | "product" | "labor" | "free" | "trial">(null);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ghosts, setGhosts] = useState<{ key: string; name: string; maker: string; price: number }[]>([]);
  const qRef = useRef<HTMLInputElement>(null);
  const catRef = useRef<HTMLSelectElement>(null);

  /** 押した瞬間に行を見せる。裏で保存してから実体に差し替わる */
  function run(action: () => Promise<unknown>, ghost?: { name: string; maker: string; price: number }) {
    const key = `${Date.now()}-${Math.random()}`;
    if (ghost) setGhosts((g) => [...g, { ...ghost, key }]);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } finally {
        if (ghost) setGhosts((g) => g.filter((x) => x.key !== key));
      }
    });
  }

  async function search() {
    setSearching(true);
    try {
      const fd = new FormData();
      fd.set("pq", qRef.current?.value ?? "");
      fd.set("pcat", catRef.current?.value ?? "");
      const res = await findProducts({}, fd);
      setHits(res.rows ?? []);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  const colCount = 9;

  return (
    <>
      {/* ── 帳票そのもの ───────────────────────────────────────── */}
      <div className="rounded-xl border border-(--color-line) bg-white p-6 shadow-sm sm:p-10">
        <form action={updateItems} id="sheet-form">
          <input type="hidden" name="quote_id" value={quoteId} />

          <header className="mb-6 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold tracking-[0.3em]">御見積書</h2>
              <p className="mt-4 border-b border-black pb-1 text-lg">
                {customerName} <span className="ml-2 text-sm">様</span>
              </p>
            </div>
            <div className="text-right text-xs leading-6">
              <p>{quoteDate}</p>
              <p>No. {quoteNo}</p>
              <p className="mt-2 font-bold">{issuer}</p>
              <p>担当：{staffName}</p>
              {fittingId && (
                <p className="mt-1">
                  表紙{" "}
                  <a href={`/f/${fittingId}`} className="text-(--color-accent) underline">
                    {fittingNo}
                  </a>
                </p>
              )}
            </div>
          </header>

          <table className="mb-5 w-full text-xs">
            <tbody>
              <tr>
                <td className="w-24 py-0.5 text-(--color-dim)">件名</td>
                <td>
                  <input name="subject" defaultValue={subject} className={textInput} />
                </td>
              </tr>
              <tr>
                <td className="py-0.5 text-(--color-dim)">納期</td>
                <td>
                  <input name="delivery_note" defaultValue={deliveryNote} className={textInput} />
                </td>
              </tr>
              <tr>
                <td className="py-0.5 text-(--color-dim)">支払条件</td>
                <td>
                  <input name="payment_terms" defaultValue={paymentTerms} className={textInput} />
                </td>
              </tr>
              <tr>
                <td className="py-0.5 text-(--color-dim)">有効期限</td>
                <td>
                  <input name="validity_note" defaultValue={validityNote} className={textInput} />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mb-6 flex items-end gap-4 border-y-2 border-black py-3">
            <span className="text-sm font-bold">合計金額</span>
            <span className="text-3xl font-bold tabular-nums">{yen(totals.total)}</span>
            <span className="text-xs">（税込）</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-black text-xs text-(--color-dim)">
                  <th className="w-14 px-2 py-1.5 text-left font-medium">試打NO</th>
                  <th className="w-20 px-2 py-1.5 text-left font-medium">種類</th>
                  <th className="px-2 py-1.5 text-left font-medium">商品名</th>
                  <th className="w-28 px-2 py-1.5 text-left font-medium">メーカー名</th>
                  <th className="w-24 px-2 py-1.5 text-right font-medium">定価</th>
                  <th className="w-32 px-2 py-1.5 text-left font-medium">掛け率／割引額</th>
                  <th className="w-16 px-2 py-1.5 text-right font-medium">数量</th>
                  <th className="w-28 px-2 py-1.5 text-right font-medium">金額</th>
                  <th className="w-8 px-1 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-(--color-panel-2)">
                    <td className={`${cell} text-xs text-(--color-dim)`}>{r.demoNo ?? ""}</td>
                    <td className={`${cell} text-xs text-(--color-dim)`}>{r.kind}</td>
                    <td className={cell}>
                      <div>{r.name}</div>
                      {r.isShaft && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-(--color-dim)">
                          仕上げ
                          <input
                            name={`finish_${r.id}`}
                            defaultValue={r.finishInch ?? ""}
                            placeholder="—"
                            className="w-14 rounded border border-transparent bg-transparent px-1 text-right hover:border-(--color-line) focus:border-(--color-accent) focus:bg-white focus:outline-none"
                          />
                          inch
                        </div>
                      )}
                    </td>
                    <td className={`${cell} text-xs text-(--color-dim)`}>{r.maker}</td>
                    <td className={`${cell} text-right tabular-nums`}>{yen(r.listPrice)}</td>
                    <td className={cell}>
                      <select
                        name={`rate_${r.id}`}
                        defaultValue={r.manual ? String(r.rate ?? "") : "auto"}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-(--color-line) focus:border-(--color-accent) focus:bg-white focus:outline-none"
                      >
                        <option value="auto">自動（{offLabel(r.rate)}）</option>
                        {RATE_OPTIONS.map((v) => (
                          <option key={v} value={v}>
                            {offLabel(v)}
                          </option>
                        ))}
                      </select>
                      <div className="mt-0.5 text-right text-xs tabular-nums text-(--color-dim)">
                        {r.discountAmount ? yen(r.discountAmount) : ""}
                      </div>
                      {r.manual && (
                        <input
                          name={`reason_${r.id}`}
                          defaultValue={r.reason ?? ""}
                          placeholder="理由（必須）"
                          className="mt-1 w-full rounded border border-amber-300 bg-amber-50/40 px-1 py-0.5 text-[11px] focus:outline-none"
                        />
                      )}
                    </td>
                    <td className={cell}>
                      <input name={`qty_${r.id}`} defaultValue={r.quantity} inputMode="numeric" className={numInput} />
                    </td>
                    <td className={`${cell} text-right font-medium tabular-nums`}>{yen(r.amount)}</td>
                    <td className={`${cell} text-center`}>
                      <button
                        type="button"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("quote_id", String(quoteId));
                          run(() => removeItem(r.id, fd));
                        }}
                        title="この行を消す"
                        className="text-(--color-dim) hover:text-red-500"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}

                {ghosts.map((g) => (
                  <tr key={g.key} className="animate-pulse opacity-60">
                    <td className={cell}></td>
                    <td className={cell}></td>
                    <td className={cell}>{g.name}</td>
                    <td className={`${cell} text-xs text-(--color-dim)`}>{g.maker}</td>
                    <td className={`${cell} text-right tabular-nums`}>{yen(g.price)}</td>
                    <td className={`${cell} text-xs text-(--color-dim)`}>計算中…</td>
                    <td className={`${cell} text-right`}>1</td>
                    <td className={cell}></td>
                    <td className={cell}></td>
                  </tr>
                ))}

                {rows.length === 0 && ghosts.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-2 py-8 text-center text-sm text-(--color-dim)">
                      まだ何も入っていません。下の「＋ 商品」から足してください。
                    </td>
                  </tr>
                )}
              </tbody>

              <tfoot>
                <tr>
                  <td colSpan={6}></td>
                  <td className="border-t border-black px-2 py-1 text-right text-xs text-(--color-dim)">小計</td>
                  <td className="border-t border-black px-2 py-1 text-right tabular-nums">{yen(totals.subtotal)}</td>
                  <td className="border-t border-black"></td>
                </tr>
                <tr>
                  <td colSpan={6}></td>
                  <td className="px-2 py-1 text-right text-xs text-(--color-dim)">消費税（{totals.taxPct}%）</td>
                  <td className="px-2 py-1 text-right tabular-nums">{yen(totals.tax)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={6}></td>
                  <td className="px-2 py-1 text-right text-xs text-(--color-dim)">税別品</td>
                  <td className="px-2 py-1 text-right">
                    <input name="tax_free_amount" defaultValue={taxFreeAmount} inputMode="numeric" className={numInput} />
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={6}></td>
                  <td className="px-2 py-1 text-right text-xs text-(--color-dim)">フィッティング料 返金</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {refundAuto ? (
                      <span>{totals.refund ? `▲ ${yen(totals.refund)}` : "—"}</span>
                    ) : (
                      <input name="refund_amount" defaultValue={refundAmount} inputMode="numeric" className={numInput} />
                    )}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={6}></td>
                  <td className="px-2 py-1 text-right text-xs text-(--color-dim)">前受金</td>
                  <td className="px-2 py-1 text-right">
                    <input name="prepaid_amount" defaultValue={prepaidAmount} inputMode="numeric" className={numInput} />
                  </td>
                  <td></td>
                </tr>
                <tr className="border-y-2 border-black text-base font-bold">
                  <td colSpan={6}></td>
                  <td className="px-2 py-1.5 text-right">合計</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{yen(totals.total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── 行を足す ─────────────────────────────────────── */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-dashed border-(--color-line) pb-3">
            <span className="text-xs text-(--color-dim)">行を足す</span>
            {(
              [
                ["product", "＋ 商品"],
                ["labor", "＋ 工賃・加工"],
                ["free", "＋ 手入力"],
                ...(trials.length > 0 ? ([["trial", "＋ 試打したシャフト"]] as const) : []),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAdding(adding === key ? null : key)}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  adding === key
                    ? "border-(--color-accent) bg-(--color-accent) font-medium text-white"
                    : "border-(--color-line) hover:bg-(--color-panel-2)"
                }`}
              >
                {label}
              </button>
            ))}
            {pending && <span className="text-xs text-(--color-dim)">保存中…</span>}
          </div>

          <div className="mt-3 space-y-3">
            {adding === "product" && (
              <div className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <div className="flex flex-wrap gap-2">
                  <select ref={catRef} defaultValue="" className="rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm">
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c || "すべての区分"}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={qRef}
                    placeholder="商品名・メーカーで探す（例: VENTUS 6S）"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void search();
                      }
                    }}
                    className="min-w-48 flex-1 rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void search()}
                    disabled={searching}
                    className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {searching ? "検索中…" : "探す"}
                  </button>
                </div>

                {hits.length > 0 && (
                  <ul className="mt-2 max-h-72 divide-y divide-(--color-line) overflow-auto rounded-lg border border-(--color-line) bg-white">
                    {hits.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("quote_id", String(quoteId));
                            fd.set("product_id", String(p.id));
                            run(() => addProductLine(fd), {
                              name: `${p.name}${p.spec ? ` ${p.spec}` : ""}`,
                              maker: p.manufacturer ?? "",
                              price: p.list_price ?? 0,
                            });
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-(--color-panel-2)"
                        >
                          <span className="w-24 shrink-0 text-xs text-(--color-dim)">{p.manufacturer}</span>
                          <span className="flex-1">
                            {p.name}
                            {p.spec ? ` ${p.spec}` : ""}
                            {p.club_type ? <span className="ml-1 text-xs text-(--color-dim)">{p.club_type}</span> : null}
                          </span>
                          <span className="w-24 shrink-0 text-right tabular-nums">{yen(p.list_price ?? 0)}</span>
                          <span className="shrink-0 text-xs text-(--color-accent)">入れる</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searched && hits.length === 0 && (
                  <p className="mt-2 text-xs text-(--color-dim)">
                    見つかりませんでした。マスタに無いものは「＋ 手入力」から入れてください。
                  </p>
                )}
                <p className="mt-2 text-[11px] text-(--color-dim)">
                  定価は発注管理の商品マスタから、入れた瞬間の値を写し取ります（あとで値上げがあっても、この見積は動きません）。
                </p>
              </div>
            )}

            {adding === "labor" && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <select id="labor_code" className="w-72 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm">
                  {labor.map((r) => (
                    <option key={r.code} value={r.code}>
                      [{r.section}] {r.name}
                      {r.price != null ? ` — ${yen(r.price)}円` : r.priceNote ? ` — ${r.priceNote}` : ""}
                    </option>
                  ))}
                </select>
                <select id="price_kind" className="w-48 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm">
                  <option value="price">通常（商品ご購入あり）</option>
                  <option value="bring_in">フィッティング時持ち込み</option>
                  <option value="no_purchase">購入なし持ち込み</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const code = (document.getElementById("labor_code") as HTMLSelectElement).value;
                    const kind = (document.getElementById("price_kind") as HTMLSelectElement).value;
                    const hit = labor.find((l) => l.code === code);
                    const fd = new FormData();
                    fd.set("quote_id", String(quoteId));
                    fd.set("labor_code", code);
                    fd.set("price_kind", kind);
                    run(() => addLaborLine(fd), { name: hit?.name ?? "工賃", maker: "", price: hit?.price ?? 0 });
                  }}
                  className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
                >
                  入れる
                </button>
              </div>
            )}

            {adding === "free" && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <input id="free_name" placeholder="商品名" className="w-56 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm" />
                <input id="free_category" placeholder="区分（シャフト など）" className="w-40 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm" />
                <input id="free_maker" placeholder="メーカー" className="w-32 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm" />
                <select id="free_club_type" defaultValue="" className="w-20 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  <option value="DR">DR</option>
                  <option value="FW">FW</option>
                  <option value="UT">UT</option>
                </select>
                <input id="free_price" placeholder="定価" inputMode="numeric" className="w-24 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-right text-sm" />
                <input id="free_qty" defaultValue={1} inputMode="numeric" className="w-16 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-right text-sm" />
                <button
                  type="button"
                  onClick={() => {
                    const v = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;
                    if (!v("free_name")) return;
                    const fd = new FormData();
                    fd.set("quote_id", String(quoteId));
                    for (const k of ["free_name", "free_category", "free_maker", "free_club_type", "free_price", "free_qty"]) fd.set(k, v(k));
                    run(() => addFreeLine(fd), { name: v("free_name"), maker: v("free_maker"), price: Number(v("free_price") || 0) });
                    (document.getElementById("free_name") as HTMLInputElement).value = "";
                  }}
                  className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
                >
                  入れる
                </button>
              </div>
            )}

            {adding === "trial" && fittingId && (
              <ul className="divide-y divide-(--color-line) rounded-lg border border-(--color-line) bg-(--color-panel-2)">
                {trials.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("fitting_id", String(fittingId));
                        fd.set("quote_id", String(quoteId));
                        fd.set("trial_id", String(t.id));
                        run(() => adoptTrialInto(fd), { name: t.name, maker: t.maker, price: t.listPrice ?? 0 });
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white"
                    >
                      <span className="w-16 shrink-0 text-xs text-(--color-dim)">試打 {t.demoNo}</span>
                      <span className="w-24 shrink-0 text-xs text-(--color-dim)">{t.maker}</span>
                      <span className="flex-1">{t.name}</span>
                      <span className="w-24 shrink-0 text-right tabular-nums">{yen(t.listPrice ?? 0)}</span>
                      <span className="shrink-0 text-xs text-(--color-accent)">入れる</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── 返金と備考 ───────────────────────────────────── */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-(--color-line) p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="refund_auto" defaultChecked={refundAuto} />
                フィッティング料の返金を自動で計算する
              </label>
              <div className="mt-2 space-y-0.5 text-xs text-(--color-dim)">
                {refundAvailable ? (
                  refundLines.map((b, i) => <div key={i}>{b}</div>)
                ) : (
                  <div>{fittingId ? "この表紙ではフィッティング料のご利用がありません" : "フィッティングを伴わない伝票のため、返金はありません"}</div>
                )}
              </div>
              <input
                name="refund_note"
                defaultValue={refundNote}
                placeholder="返金のメモ"
                className="mt-2 w-full rounded-lg border border-(--color-line) px-2 py-1.5 text-xs"
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-(--color-dim)">備考（御見積書に出ます）</span>
              <textarea name="note" defaultValue={note} rows={4} className="w-full rounded-lg border border-(--color-line) px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent) px-5 py-2.5 text-sm font-medium text-white hover:bg-(--color-accent-2)">
              保存する
            </button>
            <span className="text-xs text-(--color-dim)">
              数量・掛け率・仕上げ長さ・件名などを直したら押してください。行の追加と削除はその場で保存されます。
            </span>
          </div>
        </form>
      </div>
    </>
  );
}
