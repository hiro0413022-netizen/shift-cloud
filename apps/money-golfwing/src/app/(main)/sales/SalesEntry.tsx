"use client";

import { useRef, useState, useTransition } from "react";
import { inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { createSale, createSales, type SaleInput } from "./actions";
import ProductPicker, { invLabel, type InvPick } from "./ProductPicker";

export type Preset = { label: string; category: string; productName: string; amount: number };

/**
 * 商品行。金額は「単価 × 個数」で自動計算する（手で金額を直したら amountManual=true で自動計算を止める）。
 * pro は空文字なら「ヘッダーの既定プロ」を使う＝同じお客様・同じ商品でも行ごとにコーチを変えられる。
 */
type Line = {
  productName: string;
  invItemId: string | null;
  unitPrice: string;
  qty: string;
  amount: string;
  amountManual: boolean;
  taxIncluded: string;
  taxManual: boolean;
  pro: string;
  memo: string;
};

const emptyLine = (): Line => ({
  productName: "", invItemId: null, unitPrice: "", qty: "1",
  amount: "", amountManual: false, taxIncluded: "", taxManual: false, pro: "", memo: "",
});

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

/** 単価×個数→金額→税込 を再計算（手動で直した欄は上書きしない） */
function recalc(l: Line): Line {
  const next = { ...l };
  if (!next.amountManual) {
    const total = num(next.unitPrice) * num(next.qty);
    next.amount = total ? String(Math.round(total)) : "";
  }
  if (!next.taxManual) next.taxIncluded = calcTax(next.amount);
  return next;
}

/** 行を部分更新して再計算 */
function patch(l: Line, p: Partial<Line>): Line {
  return recalc({ ...l, ...p });
}

export default function SalesEntry({
  today,
  categories,
  memberKinds,
  payMethods,
  pros,
  invItems,
  productSuggestions,
  customerSuggestions,
  presets,
}: {
  today: string;
  categories: string[];
  memberKinds: string[];
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
  });

  function lineToInput(l: Line): SaleInput {
    return {
      ...header(),
      productName: l.productName || undefined,
      invItemId: l.invItemId || undefined,
      amount: num(l.amount),
      taxIncluded: l.taxIncluded ? num(l.taxIncluded) : null,
      qty: num(l.qty) || 1,
      // 行の担当プロが空ならヘッダーの既定プロ
      pro: (l.pro || pro) || undefined,
      memo: l.memo || undefined,
    };
  }

  /** 入力チェック: 金額と個数（個数は必須・1以上） */
  function invalidReason(l: Line): string | null {
    if (num(l.amount) === 0) return "金額を入力してください（単価と個数を入れると自動で計算されます）";
    if (num(l.qty) < 1) return "個数を入力してください（1以上）";
    return null;
  }

  // 在庫品番を選択: 品名・在庫リンク・（単価が空なら）定価を流し込み。区分も「販売」へ
  function pickInto(l: Line, it: InvPick): Line {
    const next: Partial<Line> = { productName: invLabel(it), invItemId: it.id };
    if (!num(l.unitPrice) && it.listPrice) next.unitPrice = String(Math.round(Number(it.listPrice)));
    return patch(l, next);
  }
  function onPickAny(it: InvPick, apply: (f: (l: Line) => Line) => void) {
    if (category !== "販売") setCategory("販売");
    apply((l) => pickInto(l, it));
  }

  // 連続追加：1件保存 → 商品欄だけクリア、ヘッダーは保持、品名にフォーカス
  function addSingle() {
    const bad = invalidReason(line);
    if (bad) { setFlash(bad); return; }
    const input = lineToInput(line);
    startTransition(async () => {
      await createSale(input);
      setLine(emptyLine());
      setFlash(`追加しました：${input.productName ?? category} ${input.qty}個 / ${input.amount.toLocaleString("ja-JP")}円${input.pro ? `（担当 ${input.pro}）` : ""}${input.invItemId ? "（在庫を減らしました）" : ""}`);
      productRef.current?.focus();
    });
  }

  // まとめ保存：全商品行を一括保存
  function saveBatch() {
    const valid = lines.filter((l) => num(l.amount) !== 0);
    if (valid.length === 0) { setFlash("金額のある商品行がありません"); return; }
    const badIdx = valid.findIndex((l) => invalidReason(l) !== null);
    if (badIdx >= 0) { setFlash(`${badIdx + 1}行目: ${invalidReason(valid[badIdx])}`); return; }
    const inputs = valid.map(lineToInput);
    startTransition(async () => {
      await createSales(inputs);
      setLines([emptyLine()]);
      setFlash(`${inputs.length}件をまとめて追加しました（${customerName || "お客様名なし"}）`);
    });
  }

  // クイックボタン：現在のモードの入力欄に流し込む（金額は単価として扱い、個数1）
  function applyPreset(p: Preset) {
    setCategory(p.category);
    const filled = patch(emptyLine(), { productName: p.productName, unitPrice: String(p.amount) });
    if (mode === "single") {
      setLine(filled);
      productRef.current?.focus();
    } else {
      setLines((prev) => {
        const next = [...prev];
        next[next.length - 1] = filled;
        return next;
      });
    }
  }

  /** 行の担当プロ select（空＝ヘッダーの既定） */
  function proSelect(value: string, onChange: (v: string) => void, className = "") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`}>
        <option value="">{pro ? `担当: ${pro}（既定）` : "担当プロ"}</option>
        {pros.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    );
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
          {mode === "single" ? "1件ずつ即保存。お客様・日付・支払は保持されます" : "お客様1人＋商品を複数行まとめて保存（行ごとに担当プロを変えられます）"}
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
          {memberKinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
          {payMethods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={pro} onChange={(e) => setPro(e.target.value)} className={inputCls}>
          <option value="">担当プロ（既定）</option>
          {pros.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <p className="text-xs text-(--color-dim)">
        {pros.length === 0
          ? "担当プロは「設定」からこの店舗に追加できます"
          : "ヘッダーの担当プロは既定値です。商品行ごとに別のコーチを選べます"}
      </p>

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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <ProductPicker
            className="sm:col-span-2"
            value={line.productName}
            invItemId={line.invItemId}
            recent={productSuggestions}
            items={invItems}
            autoFocusRef={productRef}
            onChange={(name) => setLine((prev) => ({ ...prev, productName: name, invItemId: null }))}
            onPick={(it) => onPickAny(it, (f) => setLine((prev) => f(prev)))}
          />
          <input
            inputMode="numeric"
            value={line.unitPrice}
            onChange={(e) => setLine((prev) => patch(prev, { unitPrice: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
            placeholder="単価(税抜)"
            className={inputCls}
          />
          <input
            type="number"
            min={1}
            step={1}
            required
            value={line.qty}
            onChange={(e) => setLine((prev) => patch(prev, { qty: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
            placeholder="個数(必須)"
            className={inputCls}
            aria-label="個数（必須）"
          />
          <input
            inputMode="numeric"
            value={line.amount}
            onChange={(e) => setLine((prev) => patch(prev, { amount: e.target.value, amountManual: true }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
            placeholder="金額(税抜・自動)"
            className={inputCls}
          />
          <input
            inputMode="numeric"
            value={line.taxIncluded}
            onChange={(e) => setLine((prev) => ({ ...prev, taxIncluded: e.target.value, taxManual: true }))}
            placeholder="税込(自動)"
            className={inputCls}
          />
          {proSelect(line.pro, (v) => setLine((prev) => ({ ...prev, pro: v })))}
          <input
            value={line.memo}
            onChange={(e) => setLine((prev) => ({ ...prev, memo: e.target.value }))}
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
            <div key={idx} className="grid grid-cols-2 gap-2 rounded-md border border-(--color-line) p-2 sm:grid-cols-12">
              <ProductPicker
                className="sm:col-span-3"
                value={l.productName}
                invItemId={l.invItemId}
                recent={productSuggestions}
                items={invItems}
                onChange={(name) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, productName: name, invItemId: null } : x))}
                onPick={(it) => onPickAny(it, (f) => setLines((prev) => prev.map((x, i) => i === idx ? f(x) : x)))}
              />
              <input
                inputMode="numeric"
                value={l.unitPrice}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? patch(x, { unitPrice: e.target.value }) : x))}
                placeholder="単価(税抜)"
                className={`${inputCls} sm:col-span-2`}
              />
              <input
                type="number"
                min={1}
                step={1}
                required
                value={l.qty}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? patch(x, { qty: e.target.value }) : x))}
                placeholder="個数"
                className={`${inputCls} sm:col-span-1`}
                aria-label="個数（必須）"
              />
              <input
                inputMode="numeric"
                value={l.amount}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? patch(x, { amount: e.target.value, amountManual: true }) : x))}
                placeholder="金額(自動)"
                className={`${inputCls} sm:col-span-2`}
              />
              <input
                inputMode="numeric"
                value={l.taxIncluded}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, taxIncluded: e.target.value, taxManual: true } : x))}
                placeholder="税込(自動)"
                className={`${inputCls} sm:col-span-2`}
              />
              {proSelect(
                l.pro,
                (v) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, pro: v } : x)),
                "sm:col-span-2",
              )}
              <input
                value={l.memo}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, memo: e.target.value } : x))}
                placeholder="備考"
                className={`${inputCls} sm:col-span-10`}
              />
              <button
                type="button"
                onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)}
                className="text-xs text-(--color-dim) hover:text-(--color-accent) sm:col-span-2"
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
