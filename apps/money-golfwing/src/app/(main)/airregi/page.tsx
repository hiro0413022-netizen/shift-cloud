import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore } from "@/lib/money";
import { monthRange } from "@/lib/money-util";
import { Panel, Badge, Empty, inputCls, btnCls, btnGhostCls, yen, PageHeader, Field, HowTo, SubTabs } from "@/components/ui";
import { buildReport, type ReportSale } from "@/lib/airregi-report";
import { ReportView } from "./report-view";
import { EXPENSE_CATEGORIES } from "@/lib/expense";
import {
  reconcile,
  matchCashOut,
  needsFill,
  lineKey,
  CHECK_MARK,
  type AirLine,
  type SaleLite,
  type AirCash,
  type ExpenseLite,
} from "@/lib/airregi";
import {
  uploadAirregi,
  addMissingSale,
  fixPay,
  fixAmount,
  fillSale,
  markChecked,
  unmarkChecked,
  addCashExpense,
} from "./actions";

/* Airレジと照合（0218）
   毎月 Airレジの CSV を取り込み、money-os の売上・経費と突き合わせて「確認すること」を出す。
   アラートは出すだけで終わらせず、その場で直せるボタンまで置く（[[alerts-must-be-fixable]]）。
   画面を開くたびに突き合わせ直す＝money-os 側を直せば、その行は自然に消える。 */

export const dynamic = "force-dynamic";

const CATEGORIES = ["利用料", "月会費(窓口)", "販売", "その他"];
const MEMBER_KINDS = ["会員", "ビジター", "スタッフ"];

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

type SaleRow = {
  id: string;
  sold_on: string;
  category: string;
  customer_name: string | null;
  member_kind: string | null;
  amount: number;
  pay_method: string | null;
  memo: string | null;
  detail: Record<string, unknown> | null;
};
type LineRow = {
  id: string; tx_no: string; orig_tx_no: string | null; line_no: number; kind: "会計" | "返品"; tx_date: string;
  tx_time: string | null; product_name: string; unit_price: number; qty: number; net: number; pay: string;
};
type CashRow = { id: string; occurred_at: string; biz_date: string; kind: "入金" | "出金"; amount: number; comment: string | null };
type CheckRow = { id: string; ref_kind: string; ref: string; note: string | null; checked_by: string | null; checked_at: string };

export default async function AirregiPage({ searchParams }: { searchParams: Promise<{ ym?: string; msg?: string; err?: string; view?: string }> }) {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const admin = createAdmin();
  const sp = await searchParams;

  if (!store) {
    return <Empty>店舗が選ばれていません。上の店舗切替で選んでください。</Empty>;
  }

  // 月の既定＝いちばん新しく取り込んだ月（無ければ今月）
  let ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "") ? (sp.ym as string) : "";
  if (!ym) {
    const { data: latest } = await admin
      .from("mon_airregi_lines").select("tx_date").eq("store_id", store.id)
      .order("tx_date", { ascending: false }).limit(1);
    ym = String(latest?.[0]?.tx_date ?? jstToday()).slice(0, 7);
  }
  const { from, to } = monthRange(ym); // to は翌月初（含まない）
  const last = addDays(to, -1);
  const inMonth = (d: string) => d >= from && d < to;
  // 月末の会計が翌月1日に入力された、などを拾うため前後3日まで読んで突き合わせ、表示は当月分だけにする
  const wFrom = addDays(from, -3);
  const wTo = addDays(last, 3);

  const [linesRes, salesRes, checksRes, cashRes, expRes] = await Promise.all([
    admin.from("mon_airregi_lines")
      .select("id, tx_no, orig_tx_no, line_no, kind, tx_date, tx_time, product_name, unit_price, qty, net, pay")
      .eq("store_id", store.id).gte("tx_date", wFrom).lte("tx_date", wTo)
      .order("tx_date").order("tx_no").order("line_no").limit(5000),
    admin.from("mon_sales")
      .select("id, sold_on, category, customer_name, member_kind, amount, pay_method, memo, detail")
      .eq("store_id", store.id).eq("source", "app").is("deleted_at", null)
      .gte("sold_on", wFrom).lte("sold_on", wTo).order("sold_on").order("created_at").limit(5000),
    admin.from("mon_airregi_checks").select("id, ref_kind, ref, note, checked_by, checked_at").eq("store_id", store.id),
    admin.from("mon_airregi_cash").select("id, occurred_at, biz_date, kind, amount, comment")
      .eq("store_id", store.id).gte("biz_date", from).lte("biz_date", last).order("occurred_at"),
    admin.from("mon_expense").select("id, spent_on, amount, method, item")
      .eq("store_id", store.id).is("deleted_at", null).gte("spent_on", wFrom).lte("spent_on", wTo),
  ]);

  let lineRows = (linesRes.data ?? []) as LineRow[];
  // 後の月に返品された会計も打ち消せるように、元取引Noで返品を追加で読む
  const txNos = Array.from(new Set(lineRows.filter((l) => l.kind === "会計").map((l) => l.tx_no)));
  if (txNos.length > 0) {
    const { data: rets } = await admin.from("mon_airregi_lines")
      .select("id, tx_no, orig_tx_no, line_no, kind, tx_date, tx_time, product_name, unit_price, qty, net, pay")
      .eq("store_id", store.id).eq("kind", "返品").in("orig_tx_no", txNos.slice(0, 900));
    const have = new Set(lineRows.map((l) => l.id));
    lineRows = lineRows.concat(((rets ?? []) as LineRow[]).filter((r) => !have.has(r.id)));
  }
  const lineIdByKey = new Map(lineRows.map((l) => [`${l.tx_no}#${l.line_no}`, l.id]));
  const lines: AirLine[] = lineRows.map((l) => ({
    txNo: l.tx_no, origTxNo: l.orig_tx_no, lineNo: Number(l.line_no), kind: l.kind, txDate: l.tx_date,
    txTime: l.tx_time ?? "", productName: l.product_name, unitPrice: Number(l.unit_price), qty: Number(l.qty),
    net: Number(l.net), pay: l.pay,
  }));

  const saleRows = (salesRes.data ?? []) as SaleRow[];
  const saleById = new Map(saleRows.map((s) => [s.id, s]));
  const sales: SaleLite[] = saleRows.map((s) => {
    const d = s.detail ?? {};
    return {
      id: s.id, soldOn: s.sold_on, amount: Number(s.amount), payMethod: s.pay_method,
      productName: d.product_name == null ? null : String(d.product_name),
      qty: d.qty == null ? null : Number(d.qty),
      listPrice: d.list_price == null ? null : Number(d.list_price),
      discount: d.discount == null ? null : Number(d.discount),
      customerName: s.customer_name,
    };
  });

  const hasAir = lines.some((l) => inMonth(l.txDate));
  const r = reconcile(lines, sales);
  const checks = (checksRes.data ?? []) as CheckRow[];
  // 下の「確認済み」一覧はこの月に関係するものだけ出す
  const monthChecks = checks.filter((c) => {
    if (c.ref_kind === "air_line") {
      const [tx, no] = c.ref.split("#");
      const l = lineRows.find((x) => x.tx_no === tx && String(x.line_no) === no);
      return !!l && inMonth(l.tx_date);
    }
    if (c.ref_kind === "cash") return inMonth(c.ref.slice(0, 10));
    const s = saleById.get(c.ref);
    return !!s && inMonth(s.sold_on);
  });
  const checkOf = (kind: string, ref: string) => checks.find((c) => c.ref_kind === kind && c.ref === ref) ?? null;

  const missing = r.missing.filter((l) => inMonth(l.txDate));
  const extra = r.extra.filter((s) => inMonth(s.soldOn));
  const payDiff = r.pairs.filter((p) => !p.payOk && p.amountOk && (inMonth(p.air.txDate) || inMonth(p.sale.soldOn)));
  const amtDiff = r.pairs.filter((p) => !p.amountOk && (inMonth(p.air.txDate) || inMonth(p.sale.soldOn)));

  const cashRows = (cashRes.data ?? []) as CashRow[];
  const cashMoves: (AirCash & { id: string })[] = cashRows.map((c) => ({
    id: c.id, occurredAt: c.occurred_at, bizDate: c.biz_date, kind: c.kind, amount: Number(c.amount), comment: c.comment ?? "",
  }));
  const expenses: ExpenseLite[] = ((expRes.data ?? []) as { id: string; spent_on: string; amount: number; method: string | null; item: string | null }[])
    .filter((e) => e.method === "cash")
    .map((e) => ({ id: e.id, spentOn: e.spent_on, amount: Number(e.amount), method: e.method, item: e.item }));
  const cashOut = matchCashOut(cashMoves, expenses).map((x) => ({ ...x, id: (x.move as AirCash & { id: string }).id }));
  const cashKey = (m: AirCash) => `${m.occurredAt}|${m.amount}`;

  // 文章型レポート（照合画面と同じ判定を使う）
  const view = sp.view === "report" ? "report" : "fix";
  const report = buildReport({
    storeName: store.name,
    ym,
    lines,
    sales: sales.map((x): ReportSale => {
      const row = saleById.get(x.id);
      const d = row?.detail ?? {};
      return {
        ...x,
        category: row?.category ?? "",
        memberKind: row?.member_kind ?? null,
        itemType: d.item_type == null ? null : String(d.item_type),
        maker: d.maker == null ? null : String(d.maker),
        memo: row?.memo ?? null,
      };
    }),
    cashMoves,
    expenses: ((expRes.data ?? []) as { id: string; spent_on: string; amount: number; method: string | null; item: string | null }[]).map((e) => ({
      id: e.id, spentOn: e.spent_on, amount: Number(e.amount), method: e.method, item: e.item,
    })),
    checks: new Map(((checksRes.data ?? []) as CheckRow[]).map((c) => [`${c.ref_kind}:${c.ref}`, c.note ?? ""])),
  });

  // 確認済みで分ける
  const open = {
    missing: missing.filter((l) => !checkOf("air_line", lineKey(l))),
    extra: extra.filter((s) => !checkOf("sale", s.id)),
    pay: payDiff.filter((p) => !checkOf("pay", p.sale.id)),
    amount: amtDiff.filter((p) => !checkOf("amount", p.sale.id)),
    cash: cashOut.filter((c) => !c.expense && !checkOf("cash", cashKey(c.move))),
  };
  const fill = saleRows
    .filter((s) => inMonth(s.sold_on))
    .map((s) => ({ s, why: needsFill({ customerName: s.customer_name, memberKind: s.member_kind, productName: s.detail?.product_name == null ? null : String(s.detail.product_name), memo: s.memo }) }))
    .filter((x) => x.why.length > 0);
  const openCount = open.missing.length + open.extra.length + open.pay.length + open.amount.length + open.cash.length + fill.length;

  const monthAir = lines.filter((l) => inMonth(l.txDate));
  const cancelledKeysInMonth = new Set(r.cancelled.map(lineKey));
  const airTotal = monthAir.filter((l) => l.kind === "会計" && !cancelledKeysInMonth.has(lineKey(l))).reduce((t, l) => t + l.net, 0);
  const moneyTotal = saleRows.filter((s) => inMonth(s.sold_on)).reduce((t, s) => t + Number(s.amount), 0);

  const shiftMonth = (n: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const ymLabel = `${ym.replace("-", "年")}月`;
  const Hidden = () => <input type="hidden" name="ym" value={ym} />;

  /** 「確認済み」にするフォーム（理由必須） */
  const CheckForm = ({ kind, refKey, placeholder }: { kind: string; refKey: string; placeholder: string }) => (
    <details className="w-full">
      <summary className="cursor-pointer text-xs text-(--color-dim) underline">直さずに「確認済み」にする</summary>
      <form action={markChecked} className="mt-2 flex flex-wrap items-end gap-2">
        <Hidden />
        <input type="hidden" name="ref_kind" value={kind} />
        <input type="hidden" name="ref" value={refKey} />
        <input name="note" required placeholder={placeholder} className={`${inputCls} flex-1`} />
        <button className={btnGhostCls}>確認済みにする</button>
      </form>
    </details>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Airレジと照合"
        store={store.name}
        lead="Airレジ（実際の会計）と money-os（お客様・商品の記録）を突き合わせて、入れ忘れ・打ち間違いを見つけて直します。"
      />

      {sp.msg && <p className="rounded-lg border border-(--color-ok) bg-(--color-ok)/10 px-3 py-2 text-sm">{sp.msg}</p>}
      {sp.err && <p className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600">{sp.err}</p>}

      <HowTo
        steps={[
          <>Airレジの管理画面で<strong>「ジャーナル履歴」</strong>と<strong>「入出金履歴」</strong>をCSVで出す（1か月分）</>,
          <>下で2つまとめて選んで<strong>「取り込む」</strong>（同じ月を何回上げても大丈夫）</>,
          <>「確認すること」を上から順に直す。直すと一覧から消えます</>,
        ]}
      />

      <Panel title="CSVを取り込む" hint="Shift_JIS のままで大丈夫です。ファイルは2つ同時に選べます。">
        <form action={uploadAirregi} className="flex flex-wrap items-end gap-3">
          <Hidden />
          <Field label="Airレジの CSV（ジャーナル履歴・入出金履歴）" className="min-w-64 flex-1">
            <input type="file" name="files" accept=".csv,text/csv" multiple required className={inputCls} />
          </Field>
          <button className={btnCls}>取り込む</button>
        </form>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/airregi?ym=${shiftMonth(-1)}${view === "report" ? "&view=report" : ""}`} className={btnGhostCls}>← 前の月</Link>
        <span className="min-w-28 text-center text-lg font-bold tabular-nums">{ymLabel}</span>
        <Link href={`/airregi?ym=${shiftMonth(1)}${view === "report" ? "&view=report" : ""}`} className={btnGhostCls}>次の月 →</Link>
      </div>

      <SubTabs
        current={view}
        items={[
          { key: "fix", href: `/airregi?ym=${ym}`, label: "確認して直す" },
          { key: "report", href: `/airregi?ym=${ym}&view=report`, label: "文章レポート" },
        ]}
      />

      {!hasAir ? (
        <Panel>
          <Empty>{ymLabel}の Airレジのデータはまだ取り込まれていません。上で CSV を取り込んでください。</Empty>
        </Panel>
      ) : view === "report" ? (
        <ReportView report={report} fixHref={`/airregi?ym=${ym}`} />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <Tile label="Airレジ 売上（税抜）" value={`${yen(airTotal)}円`} />
            <Tile label="money-os 売上（税抜）" value={`${yen(moneyTotal)}円`} />
            <Tile label="差（money-os − Airレジ）" value={`${yen(moneyTotal - airTotal)}円`} tone={moneyTotal === airTotal ? "ok" : "warn"} />
            <Tile label="確認すること" value={`${openCount}件`} tone={openCount === 0 ? "ok" : "warn"} />
          </section>
          {r.cancelled.some((l) => inMonth(l.txDate)) && (
            <p className="text-xs text-(--color-dim)">
              ※ Airレジで返品（取消）された会計 {r.cancelled.filter((l) => inMonth(l.txDate)).length}件は、両方とも数えていません
              （{r.cancelled.filter((l) => inMonth(l.txDate)).map((l) => `${l.txDate.slice(5)} ${l.productName} ${yen(l.net)}円`).join("、")}）。
            </p>
          )}
          {openCount === 0 && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800">
              {ymLabel}は Airレジと money-os がすべて合っています。
            </p>
          )}

          {open.missing.length > 0 && (
            <Panel
              title={`① money-os に入っていない会計　${open.missing.length}件`}
              hint="Airレジでは会計したのに、money-os の売上に入っていません。「追加」を押すと【要確認】つきで売上に入るので、そのあと⑥でお客様名などを記入してください。"
            >
              <div className="space-y-2">
                {open.missing.map((l) => (
                  <div key={lineKey(l)} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) px-3 py-2 text-sm">
                    <span className="tabular-nums text-(--color-dim)">{l.txDate.slice(5)} {l.txTime.slice(0, 5)}</span>
                    <span className="font-medium">{l.productName}</span>
                    <span className="text-(--color-dim)">×{l.qty}</span>
                    <Badge>{l.pay || "支払不明"}</Badge>
                    <span className="ml-auto font-semibold tabular-nums">{yen(l.net)}円</span>
                    <form action={addMissingSale}>
                      <Hidden />
                      <input type="hidden" name="line_id" value={lineIdByKey.get(lineKey(l)) ?? ""} />
                      <button className={btnCls}>money-os に追加</button>
                    </form>
                    <CheckForm kind="air_line" refKey={lineKey(l)} placeholder="理由（例: 別の日にまとめて入力済み）" />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {open.amount.length > 0 && (
            <Panel title={`② 個数・金額が違う　${open.amount.length}件`} hint="同じ会計と思われますが、個数か金額が違います。ふつうは Airレジが正しいです。">
              <div className="space-y-2">
                {open.amount.map((p) => {
                  const s = saleById.get(p.sale.id);
                  return (
                    <div key={p.sale.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) px-3 py-2 text-sm">
                      <span className="tabular-nums text-(--color-dim)">{p.air.txDate.slice(5)}</span>
                      <span className="font-medium">{s?.customer_name ?? "（お客様名なし）"}</span>
                      <span>{p.sale.productName ?? p.air.productName}</span>
                      <span className="text-(--color-dim)">
                        Airレジ <strong className="text-(--color-txt)">{p.air.qty}個 {yen(p.air.net)}円</strong> ／ money-os {p.sale.qty ?? 1}個 {yen(p.sale.amount)}円
                      </span>
                      <form action={fixAmount} className="ml-auto">
                        <Hidden />
                        <input type="hidden" name="sale_id" value={p.sale.id} />
                        <input type="hidden" name="qty" value={p.air.qty} />
                        <input type="hidden" name="net" value={p.air.net} />
                        <button className={btnCls}>Airレジに合わせる</button>
                      </form>
                      <CheckForm kind="amount" refKey={p.sale.id} placeholder="理由（例: money-os が正しい・Airレジの打ち間違い）" />
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {open.pay.length > 0 && (
            <Panel title={`③ 支払方法が違う　${open.pay.length}件`} hint="金額は合っていますが、支払方法が違います。現金がからむとレジのお金が合わなくなります。">
              <div className="space-y-2">
                {open.pay.map((p) => {
                  const s = saleById.get(p.sale.id);
                  const target = p.air.pay.split("/")[0];
                  return (
                    <div key={p.sale.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) px-3 py-2 text-sm">
                      <span className="tabular-nums text-(--color-dim)">{p.sale.soldOn.slice(5)}</span>
                      <span className="font-medium">{s?.customer_name ?? "（お客様名なし）"}</span>
                      <span>{p.sale.productName ?? p.air.productName}</span>
                      <span className="tabular-nums">{yen(p.sale.amount)}円</span>
                      <span className="text-(--color-dim)">
                        Airレジ <strong className="text-(--color-txt)">{p.air.pay}</strong> ／ money-os {p.sale.payMethod ?? "（空）"}
                      </span>
                      <form action={fixPay} className="ml-auto">
                        <Hidden />
                        <input type="hidden" name="sale_id" value={p.sale.id} />
                        <input type="hidden" name="pay" value={target} />
                        <button className={btnCls}>{target} に直す</button>
                      </form>
                      <CheckForm kind="pay" refKey={p.sale.id} placeholder="理由（例: money-os が正しい）" />
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {open.extra.length > 0 && (
            <Panel
              title={`④ Airレジに無い売上　${open.extra.length}件`}
              hint="money-os にはあるのに Airレジに会計がありません。Square端末だけで決済した・二重入力した、などが考えられます。二重入力なら「売上を入れる」で消してください。"
            >
              <div className="space-y-2">
                {open.extra.map((x) => {
                  const s = saleById.get(x.id);
                  return (
                    <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) px-3 py-2 text-sm">
                      <span className="tabular-nums text-(--color-dim)">{x.soldOn.slice(5)}</span>
                      <span className="font-medium">{x.customerName ?? "（お客様名なし）"}</span>
                      <span>{x.productName ?? s?.category}</span>
                      <Badge>{x.payMethod ?? "支払不明"}</Badge>
                      <span className="ml-auto font-semibold tabular-nums">{yen(x.amount)}円</span>
                      <Link href={`/sales?month=${ym}`} className={btnGhostCls}>売上を開く</Link>
                      <CheckForm kind="sale" refKey={x.id} placeholder="理由（例: Square端末だけで決済・入金確認済み）" />
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {open.cash.length > 0 && (
            <Panel
              title={`⑤ レジから出したお金が経費に入っていない　${open.cash.length}件`}
              hint="Airレジの「出金」です。お店の買い物なら「経費に入れる」を押してください（レジのお金の記録にも自動で入ります）。"
            >
              <div className="space-y-2">
                {open.cash.map((c) => (
                  <div key={c.id} className="rounded-lg border border-(--color-line) px-3 py-2 text-sm">
                    <form action={addCashExpense} className="grid items-end gap-2 sm:grid-cols-6">
                      <Hidden />
                      <input type="hidden" name="cash_id" value={c.id} />
                      <div className="text-(--color-dim) tabular-nums">
                        {c.move.occurredAt.slice(5, 16)}
                        <div className="text-base font-semibold text-(--color-txt)">{yen(Math.abs(c.move.amount))}円</div>
                      </div>
                      <Field label="品名" className="sm:col-span-3">
                        <input name="item" defaultValue={c.move.comment} className={inputCls} />
                      </Field>
                      <Field label="科目">
                        <select name="category" defaultValue="" className={inputCls}>
                          <option value="">（わからない）</option>
                          {EXPENSE_CATEGORIES.map((k) => <option key={k.value} value={k.value}>{k.value}</option>)}
                        </select>
                      </Field>
                      <button className={btnCls}>経費に入れる</button>
                    </form>
                    <div className="mt-1">
                      <CheckForm kind="cash" refKey={cashKey(c.move)} placeholder="理由（例: 両替・お釣りの補充）" />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {fill.length > 0 && (
            <Panel
              title={`⑥ 記入まち（お客様名・商品名など）　${fill.length}件`}
              hint={`空欄を埋めて「保存」。中身を確かめたら「確認できた」を押すと${CHECK_MARK}が外れます。`}
            >
              <div className="space-y-2">
                {fill.map(({ s, why }) => (
                  <form key={s.id} action={fillSale} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                    <Hidden />
                    <input type="hidden" name="sale_id" value={s.id} />
                    <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular-nums text-(--color-dim)">{s.sold_on.slice(5)}</span>
                      <span className="font-semibold tabular-nums">{yen(Number(s.amount))}円</span>
                      <Badge>{s.pay_method ?? "支払不明"}</Badge>
                      {why.map((w) => <Badge key={w} tone="warn">{w}</Badge>)}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-6">
                      <Field label="お客様名" className="sm:col-span-2">
                        <input name="customer_name" defaultValue={s.customer_name ?? ""} className={inputCls} />
                      </Field>
                      <Field label="会員区分">
                        <select name="member_kind" defaultValue={s.member_kind ?? ""} className={inputCls}>
                          <option value="">（未選択）</option>
                          {MEMBER_KINDS.map((k) => <option key={k}>{k}</option>)}
                        </select>
                      </Field>
                      <Field label="区分">
                        <select name="category" defaultValue={s.category} className={inputCls}>
                          {CATEGORIES.map((k) => <option key={k}>{k}</option>)}
                          {!CATEGORIES.includes(s.category) && <option>{s.category}</option>}
                        </select>
                      </Field>
                      <Field label="商品名" className="sm:col-span-2">
                        <input name="product_name" defaultValue={s.detail?.product_name == null ? "" : String(s.detail.product_name)} className={inputCls} />
                      </Field>
                      <Field label="メモ" className="sm:col-span-4">
                        <input name="memo" defaultValue={s.memo ?? ""} className={inputCls} />
                      </Field>
                      <div className="flex items-end gap-2 sm:col-span-2">
                        <button className={btnGhostCls}>保存</button>
                        <button name="resolved" value="1" className={btnCls}>確認できた</button>
                      </div>
                    </div>
                  </form>
                ))}
              </div>
            </Panel>
          )}

          {monthChecks.length > 0 && (
            <details className="rounded-xl border border-(--color-line) bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold">「確認済み」にしたもの（{monthChecks.length}件）</summary>
              <div className="mt-2 space-y-1">
                {monthChecks.map((c) => (
                  <form key={c.id} action={unmarkChecked} className="flex flex-wrap items-center gap-2 text-sm">
                    <Hidden />
                    <input type="hidden" name="id" value={c.id} />
                    <Badge>{CHECK_LABEL[c.ref_kind] ?? c.ref_kind}</Badge>
                    <span>{describeCheck(c, saleById, lineRows)}</span>
                    <span className="text-(--color-dim)">— {c.note}（{c.checked_by}）</span>
                    <button className="ml-auto text-xs text-(--color-dim) underline">取り消す</button>
                  </form>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

const CHECK_LABEL: Record<string, string> = {
  air_line: "入っていない会計",
  amount: "個数・金額",
  pay: "支払方法",
  sale: "Airレジに無い売上",
  cash: "レジの出金",
};

function describeCheck(c: CheckRow, saleById: Map<string, SaleRow>, lines: LineRow[]): string {
  if (c.ref_kind === "air_line") {
    const [tx, no] = c.ref.split("#");
    const l = lines.find((x) => x.tx_no === tx && String(x.line_no) === no);
    return l ? `${l.tx_date.slice(5)} ${l.product_name} ${yen(Number(l.net))}円` : "（別の月の会計）";
  }
  if (c.ref_kind === "cash") {
    const [at, amt] = c.ref.split("|");
    return `${at.slice(5, 16)} ${yen(Math.abs(Number(amt)))}円`;
  }
  const s = saleById.get(c.ref);
  return s ? `${s.sold_on.slice(5)} ${s.customer_name ?? ""} ${yen(Number(s.amount))}円` : "（別の月の売上）";
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const c = tone === "ok" ? "border-emerald-200 bg-emerald-50" : tone === "warn" ? "border-amber-200 bg-amber-50" : "border-(--color-line) bg-white";
  return (
    <div className={`rounded-xl border px-4 py-3 ${c}`}>
      <div className="text-xs text-(--color-dim)">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
