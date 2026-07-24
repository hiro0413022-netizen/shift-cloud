"use client";

import { useRef, useState, useTransition } from "react";
import { inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { createSale, createSales, type SaleInput } from "./actions";

export type Preset = { label: string; category: string; productName: string; amount: number };

type Line = { productName: string; amount: string; taxIncluded: string; taxManual: boolean; qty: string; memo: string };

const emptyLine = (): Line => ({ productName: "", amount: "", taxIncluded: "", taxManual: false, qty: "", memo: "" });

/** 税抜→税込（10%・円未満切り捨て）。空/非数値は空。 */
function calcTax(amountStr: string): string {
  const n = Number(String(amountStr).replace(/[",，\s]/g, ""));
  if (!Number.isFinite(n) || n === 0) return "";
  return String(Math.floor(n * 1.1));
}

function num(s: string): number {
  const n = Number(String(s).replace(/[",，\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function SalesEntry({
  today,
  categories,
  payMethods,
  productSuggestions,
  customerSuggestions,
  presets,
}: {
  today: string;
  categories: string[];
  payMethods: string[];
  productSuggestions: string[];
  customerSuggestions: string[];
  presets: Preset[];
}) {
  // 保持されるヘッダー項目
  const [soldOn, setSoldOn] = useState(today);
  const [category, setCategory] = useState(categories[0] ?? "利用料");
  const [customerName, setCustomerName] = useState("");
  const [memberKind, setMemberKind] = useState("");
  const [payMethod, setPayMethod] = useState(payMethods[0] ?? "現金");

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  // 連続入力モードの1商品
  const [line, setLine] = useState<Line>(emptyLine());
  // まとめ入力モードの複数商品
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const productRef = useRef<HTMLInputElement>(null);

  const header = () => ({ soldOn, category, customerName: customerName || undefined, memberKind: memberKind || undefined, payMethod: payMethod || undefined });

  function lineToInput(l: Line): SaleInput {
    return {
      ...header(),
      productName: l.productName || undefined,
      amount: num(l.amount),
      taxIncluded: l.taxIncluded ? num(l.taxIncluded) : null,
      qty: l.qty ? num(l.qty) : undefined,
      memo: l.memo || undefined,
    };
  }

  // 連続追加：1件保存 → 商品欄だけクリア、ヘッダーは保持、品名にフォーカス
  function addSingle() {
    if (num(line.amount) === 0) { setFlash("金額を入力してください"); return; }
    const input = lineToInput(line);
    startTransition(async () => {
      await createSale(input);
      setLine(emptyLine());
      setFlash(`追加しました：${input.productName ?? category} / ${input.amount.toLocaleString("ja-JP")}円`);
      productRef.current?.focus();
    });
  }

  // まとめ保存：全商品行を一括保存
  function saveBatch() {
    const valid = lines.filter((l) => num(l.amount) !== 0);
    if (valid.length === 0) { setFlash("金額のある商品行がありません"); return; }
    const inputs = valid.map(lineToInput);
    startTransition(async () => {
      await createSales(inputs);
      setLines([emptyLine()]);
      setFlash(`${inputs.length}件をまとめて追加しました（${customerName || "お客様名なし"}）`);
    });
  }

  // クイックボタン：現在のモードの入力欄に流し込む
  function applyPreset(p: Preset) {
    setCategory(p.category);
    if (mode === "single") {
      setLine({ ...emptyLine(), productName: p.productName, amount: String(p.amount), taxIncluded: calcTax(String(p.amount)) });
      productRef.current?.focus();
    } else {
      setLines((prev) => {
        const next = [...prev];
        const idx = next.length - 1;
        next[idx] = { ...emptyLine(), productName: p.productName, amount: String(p.amount), taxIncluded: calcTax(String(p.amount)) };
        return next;
      });
    }
  }

  // 金額変更時：税込を手動編集していなければ自動計算
  function withAmount(l: Line, amount: string): Line {
    const next = { ...l, amount };
    if (!l.taxManual) next.taxIncluded = calcTax(amount);
    return next;
  }

  return (
    <div className="space-y-3">
      {/* モード切替 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={mode === "single" ? btnCls : btnGhostCls}
        >連続入力</button>
        <button
          type="button"
          onClick={() => setMode("batch")}
          className={mode === "batch" ? btnCls : btnGhostCls}
        >まとめ入力</button>
        <span className="text-xs text-(--color-dim)">
          {mode === "single" ? "1件ずつ即保存。お客様・日付・支払は保持されます" : "お客様1人＋商品を複数行まとめて保存"}
        </span>
      </div>

      {/* 共通データリスト */}
      <datalist id="product-suggestions">
        {productSuggestions.map((p) => <option key={p} value={p} />)}
      </datalist>
      <datalist id="customer-suggestions">
        {customerSuggestions.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* ヘッダー（保持項目） */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input type="date" value={soldOn} onChange={(e) => setSoldOn(e.target.value)} className={inputCls} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input list="customer-suggestions" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="お客様名" className={inputCls} />
        <select value={memberKind} onChange={(e) => setMemberKind(e.target.value)} className={inputCls}>
          <option value="">会員区分</option>
          <option value="会員">会員</option>
          <option value="ビジター">ビジター</option>
        </select>
        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
          {payMethods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* クイックボタン */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-(--color-dim)">定番:</span>
          {presets.map((p, i) => (
            <button key={i} type="button" onClick={() => applyPreset(p)} className={`${btnGhostCls} py-1 text-xs`}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* 商品入力 */}
      {mode === "single" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input
            ref={productRef}
            list="product-suggestions"
            value={line.productName}
            onChange={(e) => setLine({ ...line, productName: e.target.value })}
            placeholder="品名・内容"
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            inputMode="numeric"
            value={line.amount}
            onChange={(e) => setLine(withAmount(line, e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
            placeholder="金額(税抜)"
            className={inputCls}
          />
          <input
            inputMode="numeric"
            value={line.taxIncluded}
            onChange={(e) => setLine({ ...line, taxIncluded: e.target.value, taxManual: true })}
            placeholder="税込(自動)"
            className={inputCls}
          />
          <input
            inputMode="numeric"
            value={line.qty}
            onChange={(e) => setLine({ ...line, qty: e.target.value })}
            placeholder="個数(任意)"
            className={inputCls}
          />
          <input
            value={line.memo}
            onChange={(e) => setLine({ ...line, memo: e.target.value })}
            placeholder="備考(任意)"
            className={`${inputCls} sm:col-span-4`}
          />
          <button type="button" onClick={addSingle} disabled={pending} className={`${btnCls} justify-center`}>
            {pending ? "..." : "追加"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-12">
              <input
                list="product-suggestions"
                value={l.productName}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, productName: e.target.value } : x))}
                placeholder="品名・内容"
                className={`${inputCls} sm:col-span-4`}
              />
              <input
                inputMode="numeric"
                value={l.amount}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? withAmount(x, e.target.value) : x))}
                placeholder="金額(税抜)"
                className={`${inputCls} sm:col-span-2`}
              />
              <input
                inputMode="numeric"
                value={l.taxIncluded}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, taxIncluded: e.target.value, taxManual: true } : x))}
                placeholder="税込(自動)"
                className={`${inputCls} sm:col-span-2`}
              />
              <input
                inputMode="numeric"
                value={l.qty}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))}
                placeholder="個数"
                className={`${inputCls} sm:col-span-1`}
              />
              <input
                value={l.memo}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, memo: e.target.value } : x))}
                placeholder="備考"
                className={`${inputCls} sm:col-span-2`}
              />
              <button
                type="button"
                onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                className="text-xs text-(--color-dim) hover:text-(--color-accent) sm:col-span-1"
                aria-label="この行を削除"
              >削除</button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className={btnGhostCls}>＋ 商品行を追加</button>
            <button type="button" onClick={saveBatch} disabled={pending} className={`${btnCls} justify-center`}>
              {pending ? "..." : `まとめて保存（${lines.filter((l) => num(l.amount) !== 0).length}件）`}
            </button>
          </div>
        </div>
      )}

      {flash && <p className="text-xs text-(--color-ok)">{flash}</p>}
    </div>
  );
}
