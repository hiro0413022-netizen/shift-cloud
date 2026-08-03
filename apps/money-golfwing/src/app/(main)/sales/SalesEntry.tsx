"use client";

import { useRef, useState, useTransition } from "react";
import { inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { createSale, createSales, type SaleInput } from "./actions";
import ProductPicker, { invLabel, type InvPick } from "./ProductPicker";

export type Preset = { label: string; category: string; productName: string; amount: number };

type Line = { productName: string; invItemId: string | null; amount: string; taxIncluded: string; taxManual: boolean; qty: string; memo: string };

const emptyLine = (): Line => ({ productName: "", invItemId: null, amount: "", taxIncluded: "", taxManual: false, qty: "", memo: "" });

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
  pros,
  invItems,
  productSuggestions,
  customerSuggestions,
  presets,
}: {
  today: string;
  categories: string[];
  payMethods: string[];
  pros: string[];
  invItems: InvPick[];
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
  const [pro, setPro] = useState("");

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  // 連続入力モードの1商品
  const [line, setLine] = useState<Line>(emptyLine());
  // まとめ入力モードの複数商品
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const productRef = useRef<HTMLInputElement>(null);

  const header = () => ({
    soldOn,
    category,
    customerName: customerName || undefined,
    memberKind: memberKind || undefined,
    payMethod: payMethod || undefined,
    pro: pro || undefined,
  });

  function lineToInput(l: Line): SaleInput {
    return {
      ...header(),
      productName: l.productName || undefined,
      invItemId: l.invItemId || undefined,
      amount: num(l.amount),
      taxIncluded: l.taxIncluded ? num(l.taxIncluded) : null,
      qty: l.qty ? num(l.qty) : undefined,
      memo: l.memo || undefined,
    };
  }

  // 在庫品番を選択: 品名・在庫リンク・（金額が空なら）定価を流し込み。区分も「販売」へ
  function pickInto(l: Line, it: InvPick): Line {
    const next: Line = { ...l, productName: invLabel(it), invItemId: it.id };
    if (!num(l.amount) && it.listPrice) {
      next.amount = String(Math.round(Number(it.listPrice)));
      if (!l.taxManual) next.taxIncluded = calcTax(next.amount);
    }
    return next;
  }
  function onPickAny(it: InvPick, apply: (f: (l: Line) => Line) => void) {
    if (category !== "販売") setCategory("販売");
    apply((l) => pickInto(l, it));
  }

  // 連続追加：1件保存 → 商品欄だけクリア、ヘッダーは保持、品名にフォーカス
  function addSingle() {
    if (num(line.amount) === 0) { setFlash("金額を入力してください"); return; }
    const input = lineToInput(line);
    startTransition(async () => {
      await createSale(input);
      setLine(emptyLine());
      setFlash(`追加しました：${input.productName ?? category} / ${input.amount.toLocaleString("ja-JP")}円${input.invItemId ? "（在庫を減らしました）" : ""}`);
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
      <datalist id="customer-suggestions">
        {customerSuggestions.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* ヘッダー（保持項目） */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
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
        <select value={pro} onChange={(e) => setPro(e.target.value)} className={inputCls}>
          <option value="">担当プロ</option>
          {pros.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {pros.length === 0 && (
        <p className="text-xs text-(--color-dim)">担当プロは「設定」からこの店舗に追加できます</p>
      )}

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
          <ProductPicker
            className="sm:col-span-2"
            value={line.productName}
            invItemId={line.invItemId}
            recent={productSuggestions}
            items={invItems}
            autoFocusRef={productRef}
            onChange={(name) => setLine({ ...line, productName: name, invItemId: null })}
            onPick={(it) => onPickAny(it, (f) => setLine((prev) => f(prev)))}
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
              <ProductPicker
                className="sm:col-span-4"
                value={l.productName}
                invItemId={l.invItemId}
                recent={productSuggestions}
                items={invItems}
                onChange={(name) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, productName: name, invItemId: null } : x))}
                onPick={(it) => onPickAny(it, (f) => setLines((prev) => prev.map((x, i) => i === idx ? f(x) : x)))}
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
