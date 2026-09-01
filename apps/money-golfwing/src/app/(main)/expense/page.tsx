import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore } from "@/lib/money";
import { monthRange } from "@/lib/money-util";
import { Panel, Badge, Empty, inputCls, btnCls, btnGhostCls, yen } from "@/components/ui";
import { EXPENSE_CATEGORIES, payMethodLabel, isCategoryUnset } from "@/lib/expense";
import { ExpenseEntry } from "./ExpenseEntry";
import { updateExpense, deleteExpense, reimburseByCash } from "./actions";

/* 経費の支出をスタッフが入力する（#191）
   ユーザー確定: 承認は挟まず即計上。そのぶん「あとで本部がやること」を画面に残す。 */

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  spent_on: string;
  item: string | null;
  payee: string | null;
  amount: number;
  method: string | null;
  category: string | null;
  doc_no: string | null;
  memo: string | null;
  paid_by: string | null;
  reimbursed_on: string | null;
  settled_txn_id: string | null;
  entered_by: string | null;
};

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default async function ExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; msg?: string; err?: string }>;
}) {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const admin = createAdmin();
  const sp = await searchParams;

  const ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "") ? (sp.ym as string) : jstToday().slice(0, 7);
  const { from, to } = monthRange(ym);

  const base = admin
    .from("mon_expense")
    .select("id, spent_on, item, payee, amount, method, category, doc_no, memo, paid_by, reimbursed_on, settled_txn_id, entered_by")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);

  const [{ data: monthRows }, { data: openRows }, { data: payeeRows }] = await Promise.all([
    // その月の入力ぶん（店舗を選んでいれば自店舗だけ）
    (store ? base.eq("store_id", store.id) : base)
      .gte("spent_on", from)
      .lte("spent_on", to)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
    // 月をまたいで残る「あとで本部がやること」＝掛けの未消込・立替の未精算
    admin
      .from("mon_expense")
      .select("id, spent_on, item, payee, amount, method, category, doc_no, memo, paid_by, reimbursed_on, settled_txn_id, entered_by")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .eq("source", "app")
      .in("method", ["credit", "advance"])
      .is("settled_txn_id", null)
      .order("spent_on", { ascending: true }),
    // 支払先の入力補助（最近使ったもの）
    admin
      .from("mon_expense")
      .select("payee")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .not("payee", "is", null)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const rows = (monthRows ?? []) as Row[];
  const open = ((openRows ?? []) as Row[]).filter((r) => !(r.method === "advance" && r.reimbursed_on));
  const recentPayees = Array.from(new Set(((payeeRows ?? []) as { payee: string | null }[]).map((p) => String(p.payee)))).slice(0, 20);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const unset = rows.filter((r) => isCategoryUnset(r.category)).length;

  const shiftMonth = (n: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">経費の入力</h1>
          <p className="text-xs text-(--color-dim)">
            納品書・レシートを見ながら、買ったものと払い方を入れてください。{store ? `（${store.name}）` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/expense?ym=${shiftMonth(-1)}`} className={btnGhostCls}>← 前の月</Link>
          <span className="tabular-nums font-semibold">{ym.replace("-", "年")}月</span>
          <Link href={`/expense?ym=${shiftMonth(1)}`} className={btnGhostCls}>次の月 →</Link>
        </div>
      </header>

      {sp.msg && <p className="rounded-lg border border-(--color-ok) bg-(--color-ok)/10 px-3 py-2 text-sm">{sp.msg}</p>}
      {sp.err && <p className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">{sp.err}</p>}

      <Panel title="経費を入力する">
        <ExpenseEntry today={jstToday()} defaultPaidBy={actor.name} recentPayees={recentPayees} />
      </Panel>

      {/* あとで本部がやること。ここが溜まると数字がズレるので、月を切り替えても常に出す */}
      {open.length > 0 && (
        <Panel title={`あとで支払い・精算するもの　${open.length}件`}>
          <p className="mb-2 text-xs leading-relaxed text-(--color-dim)">
            「掛け」は<strong className="text-(--color-txt)">振込が済んだら消込</strong>が要ります（結ばないと支払いが二重に計上されます）。
            「立替」は<strong className="text-(--color-txt)">お返ししたら精算</strong>を押してください。
            {actor.canManageAll && (
              <>
                {" "}
                <Link href="/import" className="underline">カード・口座取込 ＞ 支払の消込へ</Link>
              </>
            )}
          </p>
          <div className="space-y-2">
            {open.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) px-3 py-2 text-sm">
                <Badge tone={r.method === "credit" ? "gold" : "accent"}>{payMethodLabel(r.method)}</Badge>
                <span className="tabular-nums text-(--color-dim)">{r.spent_on}</span>
                <span className="font-medium">{r.item}</span>
                <span className="text-(--color-dim)">{r.payee ?? ""}{r.paid_by ? `／立替: ${r.paid_by}` : ""}</span>
                <span className="ml-auto font-semibold tabular-nums">{yen(Number(r.amount))}円</span>
                {r.method === "advance" && (
                  <form action={reimburseByCash}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className={btnGhostCls}>現金で精算した</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        title={`${ym.replace("-", "年")}月の入力　${rows.length}件　合計 ${yen(total)}円${unset > 0 ? `　／　科目未設定 ${unset}件` : ""}`}
      >
        {rows.length === 0 ? (
          <Empty>この月の入力はまだありません</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <form key={r.id} action={updateExpense} className="rounded-lg border border-(--color-line) p-3">
                <input type="hidden" name="id" value={r.id} />
                <div className="grid gap-2 sm:grid-cols-6">
                  <input type="date" name="spent_on" defaultValue={r.spent_on} className={inputCls} />
                  <input name="item" defaultValue={r.item ?? ""} placeholder="品名" className={`${inputCls} sm:col-span-2`} />
                  <input name="payee" defaultValue={r.payee ?? ""} placeholder="支払先" className={inputCls} />
                  <select name="category" defaultValue={r.category ?? ""} className={inputCls}>
                    <option value="">（未設定・本部が入れる）</option>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.value}</option>
                    ))}
                    {/* 既存データにしか無い科目も消さずに残す */}
                    {r.category && !EXPENSE_CATEGORIES.some((c) => c.value === r.category) && (
                      <option value={r.category}>{r.category}</option>
                    )}
                  </select>
                  <input
                    name="amount"
                    inputMode="numeric"
                    defaultValue={String(Number(r.amount))}
                    className={`${inputCls} text-right tabular-nums`}
                  />
                  <input name="doc_no" defaultValue={r.doc_no ?? ""} placeholder="伝票番号" className={inputCls} />
                  <input name="memo" defaultValue={r.memo ?? ""} placeholder="メモ" className={`${inputCls} sm:col-span-3`} />
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <button className={btnCls}>保存</button>
                    <button formAction={deleteExpense} className={btnGhostCls}>削除</button>
                  </div>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-(--color-dim)">
                  <Badge>{payMethodLabel(r.method)}</Badge>
                  {isCategoryUnset(r.category) && <Badge tone="gold">科目未設定</Badge>}
                  {r.method === "credit" && !r.settled_txn_id && <Badge tone="gold">振込の消込まち</Badge>}
                  {r.method === "advance" && !r.reimbursed_on && !r.settled_txn_id && <Badge tone="accent">立替の精算まち</Badge>}
                  {r.method === "advance" && r.reimbursed_on && <Badge tone="ok">精算済 {r.reimbursed_on}</Badge>}
                  {r.paid_by ? `立替: ${r.paid_by}` : ""}
                  {r.entered_by ? `入力: ${r.entered_by}` : ""}
                </p>
              </form>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
