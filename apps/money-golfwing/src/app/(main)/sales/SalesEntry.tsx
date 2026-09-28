"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { inputCls, btnCls, btnGhostCls, Field } from "@/components/ui";
import { createSale, createSales, type SaleInput, type SaveResult } from "./actions";
import ProductPicker, { invLabel, masterLabel, type InvPick } from "./ProductPicker";
import type { MasterProduct } from "./actions";
import CustomerPicker from "./CustomerPicker";

/** 定番ボタン1つ分。unitPrice は「1個あたりの定価」（合計金額ではない） */
export type Preset = { label: string; category: string; productName: string; unitPrice: number };

/**
 * 商品行。売上台帳Excelと同じ計算の流れで積み上げる:
 *   定価 + 割引額 = 売価 → 売価 × 個数 = 金額(税抜) → 金額×1.1切り捨て = 決済金額(税込)
 * 下流の欄を手で直したらそこから下の自動計算は止める（unitManual / amountManual / taxManual）。
 * pro は空文字なら「ヘッダーの既定プロ」を使う＝同じお客様・同じ商品でも行ごとにコーチを変えられる。
 */
type Line = {
  productName: string;
  invItemId: string | null;
  /** 種類（ボール / グリップ / 打席利用 …）。Excel E列 */
  itemType: string;
  /** メーカー名。Excel F列 */
  maker: string;
  /** 定価（税抜・1個あたり） */
  listPrice: string;
  /** 割引額（値引きはマイナス） */
  discount: string;
  /** 売価（＝定価+割引額の自動値。手入力すると固定される） */
  unitPrice: string;
  unitManual: boolean;
  qty: string;
  amount: string;
  amountManual: boolean;
  /** 決済金額（税込） */
  taxIncluded: string;
  taxManual: boolean;
  pro: string;
  memo: string;
};

const emptyLine = (): Line => ({
  productName: "", invItemId: null, itemType: "", maker: "", listPrice: "", discount: "",
  unitPrice: "", unitManual: false, qty: "1",
  amount: "", amountManual: false, taxIncluded: "", taxManual: false, pro: "", memo: "",
});

/**
 * 保存できなかった入力の退避先（この端末のブラウザだけ）。
 * ログイン切れ・通信切れで保存が失敗したとき、再読み込みしても入力をやり直さなくていいように残す。
 */
const DRAFT_KEY = "money-os:sales-draft";
type Draft = {
  savedAt: number;
  mode: "single" | "batch";
  soldOn: string; category: string; customerName: string; memberKind: string;
  payMethod: string; pro: string; seller: string;
  line: Line; lines: Line[];
};
const FAIL_MSG =
  "保存できませんでした（ログインが切れたか、通信が切れました）。入力内容はこの端末に残してあります。"
  + "画面を再読み込みしてログインし直し、下の明細に入っていないことを確かめてから、もう一度保存してください。";

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

/** 定価+割引額→売価→金額→決済金額 を再計算（手動で直した欄より下だけ動かす） */
function recalc(l: Line): Line {
  const next = { ...l };
  // 定価を飛ばして「売価だけ入れてから割引額」を打つ人がいる。
  // その場合は今出ている売価を定価とみなす（そうしないと割引額が効かない）
  if (!next.unitManual && next.listPrice === "" && next.discount !== "" && next.unitPrice !== "") {
    next.listPrice = next.unitPrice;
  }
  if (!next.unitManual && next.listPrice !== "") {
    const unit = num(next.listPrice) + num(next.discount);
    next.unitPrice = unit ? String(Math.round(unit)) : "";
  }
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
  itemTypeSuggestions,
  makerSuggestions,
  sellerSuggestions,
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
  itemTypeSuggestions: string[];
  makerSuggestions: string[];
  sellerSuggestions: string[];
  presets: Preset[];
}) {
  // 保持されるヘッダー項目
  const [soldOn, setSoldOn] = useState(today);
  const [category, setCategory] = useState(categories[0] ?? "利用料");
  const [customerName, setCustomerName] = useState("");
  const [memberKind, setMemberKind] = useState("");
  const [payMethod, setPayMethod] = useState(payMethods[0] ?? "現金");
  const [pro, setPro] = useState("");
  /** 販売者（Excel Q列）。レジに立つ人は日中変わらないのでヘッダーで保持 */
  const [seller, setSeller] = useState("");

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [flashError, setFlashError] = useState(false);
  /** 前回保存できなかった入力（再読み込み後に「戻す」を出す） */
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const ok = (m: string) => { setFlash(m); setFlashError(false); };
  const ng = (m: string) => { setFlash(m); setFlashError(true); };

  // 連続入力モードの1商品
  const [line, setLine] = useState<Line>(emptyLine());
  // まとめ入力モードの複数商品
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const productRef = useRef<HTMLInputElement>(null);

  // 前回保存できなかった入力があれば知らせる（24時間以内のものだけ）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (!d?.savedAt || Date.now() - d.savedAt > 24 * 3600 * 1000) { localStorage.removeItem(DRAFT_KEY); return; }
      setPendingDraft(d);
    } catch { /* 使えないブラウザでは何もしない */ }
  }, []);

  function keepDraft() {
    const d: Draft = { savedAt: Date.now(), mode, soldOn, category, customerName, memberKind, payMethod, pro, seller, line, lines };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setPendingDraft(null);
  }
  function restoreDraft(d: Draft) {
    setMode(d.mode); setSoldOn(d.soldOn); setCategory(d.category); setCustomerName(d.customerName);
    setMemberKind(d.memberKind); setPayMethod(d.payMethod); setPro(d.pro); setSeller(d.seller);
    setLine(d.line ?? emptyLine());
    setLines(d.lines?.length ? d.lines : [emptyLine()]);
    clearDraft();
    ok("前回保存できなかった入力を戻しました。下の明細に入っていないことを確かめてから保存してください");
  }

  /**
   * サーバーへ保存。失敗しても白い画面にしない（例外をここで受け止める）。
   * 例外＝ログイン切れ（401）・通信切れ。このときは入力を消さずに退避する。
   */
  async function save(run: () => Promise<SaveResult>): Promise<SaveResult | null> {
    try {
      const r = await run();
      if (!r.ok) ng(r.error);
      return r;
    } catch (e) {
      console.error("[money-os] 売上の保存に失敗", e);
      keepDraft();
      ng(FAIL_MSG);
      return null;
    }
  }

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
      itemType: l.itemType || undefined,
      maker: l.maker || undefined,
      seller: seller || undefined,
      invItemId: l.invItemId || undefined,
      listPrice: l.listPrice ? num(l.listPrice) : null,
      discount: l.discount ? num(l.discount) : null,
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
    if (num(l.amount) === 0) return "金額を入力してください（定価・割引額・個数を入れると自動で計算されます）";
    if (num(l.qty) < 1) return "個数を入力してください（1以上）";
    // パーソナルは担当プロの件数がそのまま給与（手当）に入る（#286）。担当なしだと誰の給与にも入らない
    if (/パーソナル/.test(l.productName.normalize("NFKC")) && !(l.pro || pro)) {
      return "パーソナルレッスンは担当プロを選んでください（担当の給与に入ります）";
    }
    return null;
  }

  // 在庫品番を選択: 品名・在庫リンク・種類・メーカー・（定価が空なら）在庫マスタの定価を流し込み。区分も「販売」へ
  function pickInto(l: Line, it: InvPick): Line {
    const next: Partial<Line> = { productName: invLabel(it), invItemId: it.id };
    if (!l.itemType && it.category) next.itemType = it.category;
    if (!l.maker && it.maker) next.maker = it.maker;
    if (!num(l.listPrice) && it.listPrice) next.listPrice = String(Math.round(Number(it.listPrice)));
    return patch(l, next);
  }
  function onPickAny(it: InvPick, apply: (f: (l: Line) => Line) => void) {
    if (category !== "販売") setCategory("販売");
    apply((l) => pickInto(l, it));
  }

  // 商品マスタ（発注管理）を選んだ: 品名・種類・メーカー・定価を写す。在庫リンクは付けない
  function pickMasterInto(l: Line, p: MasterProduct): Line {
    const next: Partial<Line> = { productName: masterLabel(p), invItemId: null };
    if (p.category) next.itemType = p.category;
    if (p.maker) next.maker = p.maker;
    if (!num(l.listPrice) && p.listPrice) next.listPrice = String(Math.round(p.listPrice));
    return patch(l, next);
  }
  function onPickMasterAny(p: MasterProduct, apply: (f: (l: Line) => Line) => void) {
    if (category !== "販売") setCategory("販売");
    apply((l) => pickMasterInto(l, p));
  }

  // 連続追加：1件保存 → 商品欄だけクリア、ヘッダーは保持、品名にフォーカス
  function addSingle() {
    const bad = invalidReason(line);
    if (bad) { ng(bad); return; }
    const input = lineToInput(line);
    startTransition(async () => {
      const r = await save(() => createSale(input));
      if (!r?.ok) return;
      setLine(emptyLine());
      clearDraft();
      ok(`追加しました：${input.productName ?? category} ${input.qty}個 / ${input.amount.toLocaleString("ja-JP")}円${input.pro ? `（担当 ${input.pro}）` : ""}${input.invItemId ? "（在庫を減らしました）" : ""}`);
      productRef.current?.focus();
    });
  }

  // まとめ保存：全商品行を一括保存
  function saveBatch() {
    const valid = lines.filter((l) => num(l.amount) !== 0);
    if (valid.length === 0) { ng("金額のある商品行がありません"); return; }
    const badIdx = valid.findIndex((l) => invalidReason(l) !== null);
    if (badIdx >= 0) { ng(`${badIdx + 1}行目: ${invalidReason(valid[badIdx])}`); return; }
    const inputs = valid.map(lineToInput);
    startTransition(async () => {
      const r = await save(() => createSales(inputs));
      if (!r) return;
      if (!r.ok) {
        // 途中まで入った場合は、入った行を画面から外す（もう一度押して二重にならないように）
        const m = /^(\d+)件は保存しました/.exec(r.error);
        const done = m ? Number(m[1]) : 0;
        if (done > 0) setLines(valid.slice(done));
        return;
      }
      setLines([emptyLine()]);
      clearDraft();
      ok(`${r.saved}件をまとめて追加しました（${customerName || "お客様名なし"}）`);
    });
  }

  // 定番ボタン：現在のモードの入力欄に流し込む（単価を定価に入れ、個数は1から）
  function applyPreset(p: Preset) {
    setCategory(p.category);
    const filled = patch(emptyLine(), { productName: p.productName, listPrice: String(p.unitPrice) });
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
    <div className="space-y-5">
      {pendingDraft && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-gold) px-3 py-2 text-sm">
          <span>
            保存できなかった入力が残っています（{new Date(pendingDraft.savedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}・
            {pendingDraft.mode === "batch"
              ? `まとめ入力 ${pendingDraft.lines.filter((l) => num(l.amount) !== 0).length}行`
              : pendingDraft.line.productName || "1件"}）
          </span>
          <button type="button" onClick={() => restoreDraft(pendingDraft)} className={btnCls}>入力を戻す</button>
          <button type="button" onClick={clearDraft} className={btnGhostCls}>捨てる</button>
        </div>
      )}
      {/* 共通データリスト */}
      <datalist id="item-type-suggestions">
        {itemTypeSuggestions.map((t) => <option key={t} value={t} />)}
      </datalist>
      <datalist id="maker-suggestions">
        {makerSuggestions.map((m) => <option key={m} value={m} />)}
      </datalist>
      <datalist id="seller-suggestions">
        {sellerSuggestions.map((s) => <option key={s} value={s} />)}
      </datalist>

      {/* 2026-09-28 作り直し: 上から順に埋めれば終わる並びにした（以前は7列＋11欄が見出しなしで並んでいた）。
          日付・お客様・払い方・担当は「保持」＝次の1件でもそのまま使う（連続入力のため） */}
      <Step n={1} title="いつ・どなたに">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="日付">
            <input type="date" value={soldOn} onChange={(e) => setSoldOn(e.target.value)} className={inputCls} />
          </Field>
          <Field label="お客様" hint="名前の一部で探せます。空でも保存できます">
            <CustomerPicker value={customerName} onPick={setCustomerName} onMemberKind={setMemberKind} recent={customerSuggestions} />
          </Field>
          <Field label="担当プロ" hint={pros.length === 0 ? "「担当プロの設定」で追加できます" : "レッスン・フィッティングの担当"}>
            <select value={pro} onChange={(e) => setPro(e.target.value)} className={inputCls}>
              <option value="">（なし）</option>
              {pros.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <p className="mb-1 text-sm font-medium">会員かどうか</p>
          <Chips options={memberKinds} value={memberKind} onChange={setMemberKind} allowEmpty />
        </div>
      </Step>

      <Step n={2} title="払い方">
        <Chips options={payMethods} value={payMethod} onChange={setPayMethod} />
        {payMethod === "現金" && <p className="mt-2 text-xs text-(--color-dim)">現金はレジのお金（出し入れの記録）にも自動で入ります</p>}
      </Step>

      <Step n={3} title="何を売りましたか">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">区分</p>
            <Chips options={categories} value={category} onChange={setCategory} />
          </div>

          {presets.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">よく売れるもの <span className="font-normal text-(--color-dim)">（押すと商品と金額が入ります）</span></p>
              <div className="flex flex-wrap gap-2">
                {presets.map((p, i) => (
                  <button key={i} type="button" onClick={() => applyPreset(p)} className="rounded-full border border-(--color-line) bg-white px-3 py-2 text-sm hover:border-(--color-gold) hover:bg-(--color-gold-soft)">
                    {p.label}円
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-(--color-panel-2) p-1 text-sm">
            <button type="button" onClick={() => setMode("single")} className={`flex-1 rounded-md px-3 py-2 font-semibold ${mode === "single" ? "bg-white shadow-sm" : "text-(--color-dim)"}`}>
              1つずつ入れる
            </button>
            <button type="button" onClick={() => setMode("batch")} className={`flex-1 rounded-md px-3 py-2 font-semibold ${mode === "batch" ? "bg-white shadow-sm" : "text-(--color-dim)"}`}>
              まとめて入れる（1人が何点も買った）
            </button>
          </div>

      {/* 商品入力 */}
      {mode === "single" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-6">
            <Field label="商品・内容" className="col-span-2 sm:col-span-3" hint="在庫から選ぶと種類・メーカー・定価も入ります">
              <ProductPicker
                value={line.productName}
                invItemId={line.invItemId}
                recent={productSuggestions}
                items={invItems}
                autoFocusRef={productRef}
                onChange={(name) => setLine((prev) => ({ ...prev, productName: name, invItemId: null }))}
                onPick={(it) => onPickAny(it, (f) => setLine((prev) => f(prev)))}
                onPickMaster={(p) => onPickMasterAny(p, (f) => setLine((prev) => f(prev)))}
              />
            </Field>
            <Field label="定価（税抜・1つ）">
              <input
                inputMode="numeric"
                value={line.listPrice}
                onChange={(e) => setLine((prev) => patch(prev, { listPrice: e.target.value, unitManual: false }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
                placeholder="例 1500"
                className={inputCls}
              />
            </Field>
            <Field label="値引き" hint="値引きはマイナス（例 -300）">
              <input
                inputMode="numeric"
                value={line.discount}
                onChange={(e) => setLine((prev) => patch(prev, { discount: e.target.value, unitManual: false }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
                placeholder="なし"
                className={inputCls}
              />
            </Field>
            <Field label="個数" required>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={line.qty}
                onChange={(e) => setLine((prev) => patch(prev, { qty: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
                className={inputCls}
              />
            </Field>
          </div>

          {/* 自動計算の結果。手で直すとそこから先の自動計算は止まる（値引きの端数調整など） */}
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 rounded-xl bg-(--color-panel-2) p-3 sm:grid-cols-3">
            <Field label="1つの売価（自動）">
              <input
                inputMode="numeric"
                value={line.unitPrice}
                onChange={(e) => setLine((prev) => patch(prev, { unitPrice: e.target.value, unitManual: true }))}
                className={`${inputCls} bg-white`}
              />
            </Field>
            <Field label="金額（税抜・自動）">
              <input
                inputMode="numeric"
                value={line.amount}
                onChange={(e) => setLine((prev) => patch(prev, { amount: e.target.value, amountManual: true }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
                className={`${inputCls} bg-white font-semibold`}
              />
            </Field>
            <Field label="お支払い額（税込・自動）" className="col-span-2 sm:col-span-1">
              <input
                inputMode="numeric"
                value={line.taxIncluded}
                onChange={(e) => setLine((prev) => ({ ...prev, taxIncluded: e.target.value, taxManual: true }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSingle(); } }}
                className={`${inputCls} bg-white text-lg font-bold`}
              />
            </Field>
          </div>

          <details className="rounded-lg border border-(--color-line) px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-(--color-dim)">くわしく入れる（種類・メーカー・販売者・メモ／任意）</summary>
            <div className="mt-3 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-4">
              <Field label="種類" hint="ボール・グリップ・打席利用など">
                <input list="item-type-suggestions" value={line.itemType} onChange={(e) => setLine((prev) => ({ ...prev, itemType: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="メーカー">
                <input list="maker-suggestions" value={line.maker} onChange={(e) => setLine((prev) => ({ ...prev, maker: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="販売者" hint="次の1件にも残ります">
                <input list="seller-suggestions" value={seller} onChange={(e) => setSeller(e.target.value)} className={inputCls} />
              </Field>
              <Field label="この商品だけ担当を変える">
                {proSelect(line.pro, (v) => setLine((prev) => ({ ...prev, pro: v })))}
              </Field>
              <Field label="メモ" className="col-span-2 sm:col-span-4">
                <input value={line.memo} onChange={(e) => setLine((prev) => ({ ...prev, memo: e.target.value }))} className={inputCls} />
              </Field>
            </div>
          </details>

          <button type="button" onClick={addSingle} disabled={pending} className={`${btnCls} w-full py-3.5 text-lg`}>
            {pending ? "保存しています…" : `この売上を追加${num(line.taxIncluded) ? `（お支払い ${num(line.taxIncluded).toLocaleString("ja-JP")}円）` : ""}`}
          </button>
          <p className="text-center text-xs text-(--color-dim)">追加すると、日付・お客様・払い方はそのまま残ります。続けて次の商品を入れられます</p>
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
                onPickMaster={(p) => onPickMasterAny(p, (f) => setLines((prev) => prev.map((x, i) => i === idx ? f(x) : x)))}
              />
              <input
                list="item-type-suggestions"
                value={l.itemType}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, itemType: e.target.value } : x))}
                placeholder="種類"
                className={`${inputCls} sm:col-span-2`}
                aria-label="種類（ボール・グリップ・打席利用など）"
              />
              <input
                list="maker-suggestions"
                value={l.maker}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, maker: e.target.value } : x))}
                placeholder="メーカー名"
                className={`${inputCls} sm:col-span-2`}
                aria-label="メーカー名"
              />
              <input
                inputMode="numeric"
                value={l.listPrice}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? patch(x, { listPrice: e.target.value, unitManual: false }) : x))}
                placeholder="定価(税抜)"
                className={`${inputCls} sm:col-span-2`}
                aria-label="定価（税抜）"
              />
              <input
                inputMode="numeric"
                value={l.discount}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? patch(x, { discount: e.target.value, unitManual: false }) : x))}
                placeholder="割引額(-)"
                className={`${inputCls} sm:col-span-2`}
                aria-label="割引額（値引きはマイナス）"
              />
              <input
                inputMode="numeric"
                value={l.unitPrice}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? patch(x, { unitPrice: e.target.value, unitManual: true }) : x))}
                placeholder="売価(自動)"
                className={`${inputCls} sm:col-span-2`}
                aria-label="売価（税抜・自動）"
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
                placeholder="金額(税抜・自動)"
                className={`${inputCls} sm:col-span-2`}
                aria-label="金額（税抜・自動）"
              />
              <input
                inputMode="numeric"
                value={l.taxIncluded}
                onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, taxIncluded: e.target.value, taxManual: true } : x))}
                placeholder="決済金額(税込)"
                className={`${inputCls} sm:col-span-2`}
                aria-label="決済金額（税込）"
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
                className={`${inputCls} sm:col-span-6`}
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
        </div>
      </Step>

      {flash && (
        <p role={flashError ? "alert" : "status"}
          className={flashError
            ? "rounded-lg border border-(--color-accent) px-3 py-2 text-sm font-medium text-(--color-accent)"
            : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"}>
          {flash}
        </p>
      )}
    </div>
  );
}


/** 番号つきの区切り（上から順に埋めれば終わる、を見た目で示す） */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className={n > 1 ? "border-t border-(--color-line) pt-5" : ""}>
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--color-gold) text-sm text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** 押して選ぶボタン（プルダウンより速く、何が選べるかが一目で分かる） */
function Chips({
  options, value, onChange, allowEmpty = false,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(allowEmpty && on ? "" : o)}
            className={`min-h-11 rounded-lg border px-4 py-2 text-[15px] font-medium ${
              on ? "border-(--color-gold) bg-(--color-gold) text-white" : "border-(--color-line) bg-white hover:border-(--color-gold)"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
