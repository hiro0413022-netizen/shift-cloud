"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDemoLine,
  addFreeLine,
  addLaborLine,
  addProductLine,
  findProducts,
  removeItem,
  updateItems,
} from "../actions";
import { adoptTrialInto } from "@/app/f/[id]/actions";
import { PrintButtons } from "@/components/print-frame";
import { Money, QuoteBottom, QuotePaper, sumsOf, type PaperItem, type PaperSlot } from "@/components/paper";

/**
 * 御見積書そのものを編集する画面。
 *
 * 紙（00_雛形.xlsm）と同じ並び・同じ罫線で出して、そのセルの上で数量と掛け率を触る。
 * 「明細を作る画面」と「印刷プレビュー」を分けると、出来上がりが想像できないので分けない。
 * 2026-09-18: 紙の部品を components/paper.tsx にまとめ、印刷（/print/quote）と1つの部品で描くようにした。
 *   ＝ 画面で見えている水色の見出し・固定枠（加工部品／グリップ／工賃）・仕上げ長さ・備考が、そのまま紙に出る。
 *   空いている固定枠（グリップ装着・シャフトカット調整など）は、その場の「＋」で入れられる。
 *
 * ★ 追加は画面を作り直さない。押した瞬間に薄い行が出て、裏で保存してから実体になる。
 *   以前は追加のたびに全体が再描画され、探した商品の一覧まで消えていた。
 */

export type SheetRow = {
  id: number;
  /** product / grip / sleeve / coating / labor（紙のどの枠に入るか） */
  lineKind: string;
  category: string | null;
  /** 規格を含まない名前（工賃の固定枠との突き合わせ用） */
  productName: string;
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

/** 選択肢に無い掛け率か（任意の％で入れたもの） */
const isPreset = (rate: number | null) => rate != null && RATE_OPTIONS.some((v) => Math.abs(v - rate) < 1e-6);
const offLabel = (rate: number | null) => {
  if (rate == null) return "—";
  const off = Math.round((1 - rate) * 1000) / 10;
  return off === 0 ? "定価" : `${off}%OFF`;
};

export function QuoteSheet({
  quoteId,
  customerName,
  customerContact,
  quoteDate,
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
  hasOrder = false,
}: {
  hasOrder?: boolean;
  quoteId: number;
  customerName: string;
  customerContact: string;
  quoteDate: string;
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
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<null | "product" | "labor" | "free" | "trial">(null);
  const [presetCat, setPresetCat] = useState("");
  const [presetLabor, setPresetLabor] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ghosts, setGhosts] = useState<{ key: string; name: string; maker: string; price: number }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const demoRef = useRef<HTMLInputElement>(null);

  /** 試打NO.欄に番号を入れて Enter（または欄を離れる）→ 台帳から引いて明細に入れる */
  function addDemo() {
    const v = (demoRef.current?.value ?? "").normalize("NFKC").trim();
    if (!v) return;
    const n = Number(v);
    if (demoRef.current) demoRef.current.value = "";
    setDemoMsg(null);
    run(
      async () => {
        const r = await addDemoLine(quoteId, n);
        if (!r.ok) setDemoMsg(r.message ?? "入れられませんでした");
        setTimeout(() => demoRef.current?.focus(), 300);
      },
      { name: `試打NO ${v}`, maker: "", price: 0 },
    );
  }
  const qRef = useRef<HTMLInputElement>(null);
  const catRef = useRef<HTMLSelectElement>(null);
  const toolRef = useRef<HTMLDivElement>(null);

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

  /** 行を足す道具を開く（空いている枠の「＋」からも来る） */
  function openTool(kind: "product" | "labor" | "free" | "trial", opts: { cat?: string; labor?: string } = {}) {
    setPresetCat(opts.cat ?? "");
    setPresetLabor(opts.labor ?? "");
    setAdding(kind);
    setTimeout(() => toolRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  // 「＋ 商品」を開いた時点で、まず棚を見せる。
  // キーワードを打つまで真っ白、では何が入っているのか分からない（2026-09-13 ユーザー報告）。
  useEffect(() => {
    if (adding !== "product") return;
    if (catRef.current) catRef.current.value = presetCat;
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, presetCat]);

  /** 工賃の固定枠は、押せばその工賃がその場で入る */
  function addLaborNow(code: string) {
    const hit = labor.find((l) => l.code === code);
    if (!hit) return openTool("labor", { labor: code });
    const fd = new FormData();
    fd.set("quote_id", String(quoteId));
    fd.set("labor_code", code);
    fd.set("price_kind", "price");
    run(() => addLaborLine(fd), { name: hit.name, maker: "", price: hit.price ?? 0 });
  }

  const items: PaperItem[] = [
    ...rows.map((r) => ({
      id: r.id,
      lineKind: r.lineKind,
      category: r.category,
      demoNo: r.demoNo,
      kind: r.kind,
      name: r.name,
      productName: r.productName,
      maker: r.maker,
      listPrice: r.listPrice,
      discount: r.discountAmount,
      qty: r.quantity,
      amount: r.amount,
      finishInch: r.finishInch,
    })),
    // 保存待ちの行（薄く出す）。商品の枠の最後に並ぶ
    ...ghosts.map((g, i) => ({
      id: -1 - i,
      lineKind: "product",
      category: null,
      demoNo: null,
      kind: "",
      name: `${g.name}（保存中…）`,
      productName: g.name,
      maker: g.maker,
      listPrice: g.price,
      discount: 0,
      qty: 1,
      amount: 0,
      finishInch: null,
    })),
  ];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const shafts = rows.filter((r) => r.isShaft);
  const finishSlots = Math.max(3, shafts.length);

  const pin =
    "w-full rounded-sm border border-dashed border-transparent bg-transparent px-0.5 outline-none hover:border-sky-400 focus:border-sky-600 focus:bg-sky-50";
  const plus = "no-print shrink-0 rounded border border-sky-300 bg-sky-50 px-1.5 text-[10px] leading-4 text-sky-700 hover:bg-sky-100";

  const emptySlot = (slot: PaperSlot, laborCode?: string) => {
    if (slot === "labor" && laborCode) {
      return (
        <button type="button" className={plus} onClick={() => addLaborNow(laborCode)} title="この工賃を入れる">
          ＋ 入れる
        </button>
      );
    }
    if (slot === "coating") {
      return (
        <button type="button" className={plus} onClick={() => openTool("labor", { labor: "hadras_head_dr" })}>
          ＋ 選ぶ
        </button>
      );
    }
    return (
      <button
        type="button"
        className={plus}
        onClick={() => openTool("product", { cat: slot === "grip" ? "グリップ" : "スリーブ" })}
      >
        ＋ 探す
      </button>
    );
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3 sm:p-6">
        <form action={updateItems} id="sheet-form" onChange={() => setDirty(true)} onSubmit={() => setDirty(false)}>
          <input type="hidden" name="quote_id" value={quoteId} />
          {/* Enter で送ったときは「保存」だけ（先頭の送信ボタンが既定になるので、印刷ボタンより前に置く） */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
            保存
          </button>

          <div className="mx-auto mb-3 min-w-[760px] max-w-[210mm]">
            <PrintButtons
              items={[
                { doc: "quote", label: "御見積書を印刷", primary: !hasOrder },
                ...(hasOrder ? [{ doc: "order" as const, label: "御注文書を印刷", primary: true }] : []),
              ]}
            />
          </div>

          <div className="mx-auto min-w-[760px] max-w-[210mm] bg-white p-8 text-black shadow-md">
            <QuotePaper
              doc="quote"
              customerName={customerName}
              contact={<input name="customer_contact" defaultValue={customerContact} placeholder="お電話・メール" className={pin} />}
              date={quoteDate}
              subject={<input name="subject" defaultValue={subject} className={`${pin} font-bold`} />}
              delivery={<input name="delivery_note" defaultValue={deliveryNote} className={pin} />}
              payment={<input name="payment_terms" defaultValue={paymentTerms} className={pin} />}
              validity={<input name="validity_note" defaultValue={validityNote} className={pin} />}
              staffName={staffName}
              total={totals.total}
              items={items}
              onEmptyDemo={
                <input
                  ref={demoRef}
                  inputMode="numeric"
                  placeholder="番号"
                  title="試打NOを入れて Enter で、シャフト名・メーカー・定価が入ります"
                  form="demo-no-form"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDemo();
                    }
                  }}
                  onBlur={addDemo}
                  className="w-full rounded-sm border border-dashed border-sky-400 bg-sky-50 px-0.5 text-center text-[9pt] outline-none placeholder:text-sky-400 focus:border-sky-600"
                />
              }
              onEmptyGoods={
                <button type="button" className={plus} onClick={() => openTool("product")}>
                  ＋ 商品を入れる
                </button>
              }
              edit={{
                name: (it) =>
                  it.id > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("quote_id", String(quoteId));
                        run(() => removeItem(it.id, fd));
                      }}
                      title="この行を消す"
                      className="no-print shrink-0 px-0.5 text-[11px] text-gray-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  ) : null,
                discount: (it) => {
                  const r = byId.get(it.id);
                  if (!r) return <Money v={it.discount} />;
                  return <DiscountCell r={r} discount={it.discount} />;
                },
                qty: (it) =>
                  byId.has(it.id) ? (
                    <input
                      name={`qty_${it.id}`}
                      defaultValue={it.qty}
                      // 数量も欄を離れたら保存して金額を出し直す（変わったときだけ）
                      onBlur={(e) => {
                        if (e.currentTarget.value !== String(it.qty)) e.currentTarget.form?.requestSubmit();
                      }}
                      inputMode="numeric"
                      className={`${pin} text-right tabular-nums`}
                    />
                  ) : (
                    it.qty
                  ),
                empty: emptySlot,
              }}
              bottom={
                <QuoteBottom
                  finish={Array.from({ length: finishSlots }, (_, i) => {
                    const s = shafts[i];
                    if (!s) return "";
                    return (
                      <span className="flex items-center gap-1">
                        <input
                          name={`finish_${s.id}`}
                          defaultValue={s.finishInch ?? ""}
                          inputMode="decimal"
                          placeholder="—"
                          className={`${pin.replace("w-full ", "")} w-16 shrink-0 text-right tabular-nums`}
                        />
                        <span className="no-print truncate text-[8pt] text-gray-400">{s.name}</span>
                      </span>
                    );
                  })}
                  totals={[
                    { label: "小計", value: <Money v={totals.subtotal} zero />, sums: sumsOf(items.filter((i) => i.id > 0)) },
                    { label: `消費税`, value: <Money v={totals.tax} zero /> },
                    {
                      label: "税別品",
                      value: (
                        <input
                          name="tax_free_amount"
                          defaultValue={taxFreeAmount || ""}
                          placeholder="0"
                          inputMode="numeric"
                          className={`${pin} text-right tabular-nums`}
                        />
                      ),
                    },
                    {
                      label: "返金",
                      value: refundAuto ? (
                        totals.refund ? (
                          <>▲¥{yen(totals.refund)}</>
                        ) : (
                          ""
                        )
                      ) : (
                        <input
                          name="refund_amount"
                          defaultValue={refundAmount || ""}
                          placeholder="0"
                          inputMode="numeric"
                          className={`${pin} text-right tabular-nums`}
                        />
                      ),
                    },
                    {
                      label: "前受金",
                      value: (
                        <input
                          name="prepaid_amount"
                          defaultValue={prepaidAmount || ""}
                          placeholder="0"
                          inputMode="numeric"
                          className={`${pin} text-right tabular-nums`}
                        />
                      ),
                    },
                    { label: "合計", value: <Money v={totals.total} zero />, strong: true },
                  ]}
                  note={
                    <textarea
                      name="note"
                      defaultValue={note}
                      rows={5}
                      className="h-[86pt] w-full resize-none bg-transparent leading-[17.2pt] outline-none focus:bg-sky-50/50"
                    />
                  }
                />
              }
            />
          </div>

          {/* ── 紙の外：行を足す道具・返金の設定・保存 ───────────── */}
          <div ref={toolRef} className="mx-auto mt-4 max-w-[210mm] min-w-[760px] space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) bg-white p-3">
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
                  onClick={() => (adding === key ? setAdding(null) : openTool(key))}
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
              <span className="text-xs text-(--color-dim)">／ 試打したシャフトは、紙の「試打NO.」欄に番号を入れて Enter でも入ります</span>
            </div>
            {demoMsg && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{demoMsg}</p>
            )}

          <div className="mt-3 space-y-3">
            {adding === "product" && (
              <div className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <div className="flex flex-wrap gap-2">
                  <select
                    ref={catRef}
                    defaultValue={presetCat}
                    onChange={() => void search()}
                    className="rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm"
                  >
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
                {hits.length >= 80 && (
                  <p className="mt-2 text-[11px] text-(--color-dim)">
                    先頭80件だけ出しています。区分を選ぶか、商品名・メーカーを打つと絞り込めます。
                  </p>
                )}
                <p className="mt-2 text-[11px] text-(--color-dim)">
                  定価は発注管理の商品マスタから、入れた瞬間の値を写し取ります（あとで値上げがあっても、この見積は動きません）。
                </p>
              </div>
            )}

            {adding === "labor" && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <select id="labor_code" key={presetLabor} defaultValue={presetLabor} className="w-72 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm">
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


            <div className="rounded-lg border border-(--color-line) bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="refund_auto" defaultChecked={refundAuto} />
                フィッティング料の返金を自動で計算する（消費税のあとに税込で差し引きます）
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
          </div>

          <div className="sticky bottom-0 z-20 mx-auto mt-4 flex max-w-[210mm] min-w-[760px] flex-wrap items-center gap-3 rounded-lg border border-(--color-line) bg-white/95 p-3 shadow-lg backdrop-blur">
            <button className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent) px-5 py-2.5 text-sm font-medium text-white hover:bg-(--color-accent-2)">
              保存する
            </button>
            <PrintButtons
              items={[
                { doc: "quote", label: "御見積書を印刷" },
                ...(hasOrder ? [{ doc: "order" as const, label: "御注文書を印刷" }] : []),
              ]}
            />
            {dirty ? (
              <span className="text-xs font-medium text-amber-700">直したところがまだ保存されていません</span>
            ) : (
              <span className="text-xs text-(--color-dim)">
                点線の欄は紙の上でそのまま直せます。数量・掛け率・仕上げ長さ・件名などを直したら【保存する】。行の追加と削除はその場で保存されます。
              </span>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

/**
 * 値引き欄。決まった掛け率のほかに「％を入力」「金額を入力」を選べる。
 * 2026-09-20 ユーザー依頼「任意の金額と割引率も入れれるように（スタッフ購入に対応していない）」
 * - ％を入力 … 何%OFFでも（例 37.5）
 * - 金額を入力 … 1本あたりの販売単価（税抜）をそのまま入れる。値引額は定価との差で自動
 */
function DiscountCell({ r, discount }: { r: SheetRow; discount: number }) {
  const initial = !r.manual ? "auto" : r.rate == null ? "yen" : isPreset(r.rate) ? String(r.rate) : "pct";
  const [mode, setMode] = useState(initial);
  const submit = (el: HTMLElement) => (el as HTMLInputElement).form?.requestSubmit();
  const commitOnBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.currentTarget.value !== e.currentTarget.defaultValue && e.currentTarget.value.trim() !== "") submit(e.currentTarget);
  };
  const pctDefault = r.manual && r.rate != null ? String(Math.round((1 - r.rate) * 1000) / 10) : "";
  const yenDefault = r.manual && r.rate == null ? String(r.listPrice + r.discountAmount) : "";
  const inputCls =
    "no-print w-full rounded-sm border border-sky-400 bg-sky-50 px-1 text-right text-[8pt] tabular-nums outline-none focus:border-sky-600";
  return (
    <div className="text-right">
      <select
        name={`rate_${r.id}`}
        value={mode}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setMode(v);
          // 入力欄が出るものは、数字を入れてから保存する
          if (v !== "pct" && v !== "yen") submit(e.currentTarget);
        }}
        title={r.discountReason || "掛け率"}
        className="no-print w-full rounded-sm border border-dashed border-transparent bg-transparent text-right text-[8pt] text-gray-600 outline-none hover:border-sky-400 focus:border-sky-600"
      >
        <option value="auto">自動 {r.manual ? "" : offLabel(r.rate)}</option>
        {RATE_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {offLabel(v)}
          </option>
        ))}
        <option value="pct">％を入力…</option>
        <option value="yen">金額を入力…</option>
      </select>
      {mode === "pct" && (
        <label className="no-print mt-0.5 flex items-center gap-0.5 text-[8pt] text-gray-500">
          <input
            name={`pct_${r.id}`}
            defaultValue={pctDefault}
            placeholder="例 37.5"
            inputMode="decimal"
            autoFocus={initial !== "pct"}
            onBlur={commitOnBlur}
            className={inputCls}
          />
          %OFF
        </label>
      )}
      {mode === "yen" && (
        <label className="no-print mt-0.5 flex items-center gap-0.5 text-[8pt] text-gray-500">
          単価
          <input
            name={`yen_${r.id}`}
            defaultValue={yenDefault}
            placeholder="税抜"
            inputMode="numeric"
            autoFocus={initial !== "yen"}
            onBlur={commitOnBlur}
            className={inputCls}
          />
          円
        </label>
      )}
      <div>
        <Money v={discount} />
      </div>
      {mode !== "auto" && (
        <input
          name={`reason_${r.id}`}
          defaultValue={r.reason ?? ""}
          placeholder="理由（例 スタッフ購入）"
          className="no-print mt-0.5 w-full rounded-sm border border-amber-300 bg-amber-50 px-1 text-[8pt] outline-none"
        />
      )}
    </div>
  );
}
