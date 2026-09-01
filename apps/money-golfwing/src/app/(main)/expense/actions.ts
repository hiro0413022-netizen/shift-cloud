"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, canWriteStore, latestCashBalance, rebalanceCashLedger, toNum } from "@/lib/money";
import { expenseEffect, expenseInputError, payMethodLabel } from "@/lib/expense";

/* 経費の支出をスタッフが入力する（#191）
 *
 * ユーザー確定（2026-09-01）: 承認は挟まず**入力したら即計上**。
 * そのぶん「何が起きるか」を画面に出し、あとで直せるようにしてある（編集・削除つき）。
 *
 * ⚠ 二重計上の急所（SYSTEM.md §4-5 / [[expense-settlement]]）
 *   PLの経費 = mon_expense（発生）＋ mon_bank_txn の確定出金（支払）。
 *   「掛け」と「立替を振込で精算」は銀行CSVからも入るので、消込（settled_txn_id）で必ず結ぶ。
 *   「店の現金」は銀行に出てこないので消込は不要。そのかわり現金出納に出金を書かないとレジが合わない。
 */

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const orNull = (v: FormDataEntryValue | null) => str(v) || null;

/** 画面に一言返して戻る。redirect は例外で流れを止めるので、呼んだ先はそこで終わる */
function back(msg: string, err = false): never {
  redirect(`/expense?${err ? "err" : "msg"}=${encodeURIComponent(msg)}`);
}

/** 現金出納に「出金」を1行足す（店の現金で払ったとき）。残高は直近＋入−出で積む */
async function writeCashOut(
  admin: ReturnType<typeof createAdmin>,
  actor: { companyId: string; name: string },
  store: { id: string; segmentId: string | null },
  e: { id: string; spent_on: string; item: string | null; payee: string | null; amount: number; category: string | null },
): Promise<void> {
  const prev = await latestCashBalance(actor.companyId, store.id);
  await admin.from("mon_cash_ledger").insert({
    company_id: actor.companyId,
    store_id: store.id,
    segment_id: store.segmentId,
    entry_date: e.spent_on,
    summary: e.category ?? "経費",
    description: e.item ?? "経費の支払い",
    counterpart: e.payee,
    in_amount: 0,
    out_amount: e.amount,
    balance: prev - e.amount,
    memo: "経費入力から自動連携",
    entered_by: actor.name,
    source: "expense",
    source_ref: e.id,
  });
}

/** その経費に紐づく現金出納の行（あれば） */
async function cashRowOf(admin: ReturnType<typeof createAdmin>, companyId: string, expenseId: string) {
  const { data } = await admin
    .from("mon_cash_ledger")
    .select("id")
    .eq("company_id", companyId)
    .eq("source", "expense")
    .eq("source_ref", expenseId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? String(data.id) : null;
}

export async function addExpense(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  if (!store || !store.segmentId || !canWriteStore(actor, store.id)) back("この店舗には入力できません", true);

  const spentOn = str(formData.get("spent_on"));
  const amount = toNum(formData.get("amount"));
  const item = str(formData.get("item"));
  const method = str(formData.get("method"));
  const paidBy = str(formData.get("paid_by"));

  // 画面でも同じ関数を通しているが、画面を経由しない送信を通さないためここでも検査する
  const bad = expenseInputError({ spentOn, amount, item, method, paidBy });
  if (bad) back(bad, true);

  const { data: inserted, error } = await admin
    .from("mon_expense")
    .insert({
      company_id: actor.companyId,
      store_id: store.id,
      segment_id: store.segmentId,
      spent_on: spentOn,
      item,
      payee: orNull(formData.get("payee")),
      amount,
      method,
      // 「わからない」は空で入れる＝集計では other_expense に落ち、一覧で拾って本部が直す
      category: orNull(formData.get("category")),
      doc_no: orNull(formData.get("doc_no")),
      memo: orNull(formData.get("memo")),
      paid_by: method === "advance" ? paidBy : null,
      entered_by: actor.name,
      source: "app",
    })
    .select("id, spent_on, item, payee, amount, category")
    .single();
  if (error || !inserted) back(`保存できませんでした: ${error?.message ?? "unknown"}`, true);

  const effect = expenseEffect(method);
  if (effect.writeCashOut) {
    await writeCashOut(admin, actor, store, {
      id: String(inserted.id),
      spent_on: String(inserted.spent_on),
      item: (inserted.item as string | null) ?? null,
      payee: (inserted.payee as string | null) ?? null,
      amount: Number(inserted.amount),
      category: (inserted.category as string | null) ?? null,
    });
  }

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/expense");
  revalidatePath("/cash");
  revalidatePath("/");
  back(`${item} ${amount.toLocaleString()}円を登録しました（${payMethodLabel(method)}）。${effect.note}`);
}

/** 金額・科目・支払先などの修正。現金連携の行も合わせて直す */
export async function updateExpense(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: cur } = await admin
    .from("mon_expense")
    .select("id, store_id, segment_id, method, amount, spent_on")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cur) back("対象が見つかりません", true);
  if (cur.store_id && !canWriteStore(actor, String(cur.store_id))) back("この店舗の行は編集できません", true);

  const spentOn = str(formData.get("spent_on"));
  const amount = toNum(formData.get("amount"));
  const item = str(formData.get("item"));
  const bad = expenseInputError({ spentOn, amount, item, method: cur.method, paidBy: str(formData.get("paid_by")) || "-" });
  if (bad) back(bad, true);

  await admin
    .from("mon_expense")
    .update({
      spent_on: spentOn,
      item,
      payee: orNull(formData.get("payee")),
      amount,
      category: orNull(formData.get("category")),
      doc_no: orNull(formData.get("doc_no")),
      memo: orNull(formData.get("memo")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  // 現金で払った行は、出納の金額・日付も合わせて直さないとレジの残高がずれる
  const cashId = await cashRowOf(admin, actor.companyId, id);
  if (cashId) {
    await admin
      .from("mon_cash_ledger")
      .update({
        entry_date: spentOn,
        description: item,
        counterpart: orNull(formData.get("payee")),
        summary: orNull(formData.get("category")) ?? "経費",
        out_amount: amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cashId);
    if (cur.store_id) await rebalanceCashLedger(actor.companyId, String(cur.store_id));
  }

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/expense");
  revalidatePath("/cash");
  back("修正しました");
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: cur } = await admin
    .from("mon_expense")
    .select("id, store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .maybeSingle();
  if (!cur) back("対象が見つかりません", true);
  if (cur.store_id && !canWriteStore(actor, String(cur.store_id))) back("この店舗の行は削除できません", true);

  const now = new Date().toISOString();
  await admin.from("mon_expense").update({ deleted_at: now }).eq("id", id).eq("company_id", actor.companyId);

  // 連携で作った現金出納の行も一緒に消す（残さないと出金だけが残ってレジが合わなくなる）
  const cashId = await cashRowOf(admin, actor.companyId, id);
  if (cashId) {
    await admin.from("mon_cash_ledger").update({ deleted_at: now }).eq("id", cashId);
    if (cur.store_id) await rebalanceCashLedger(actor.companyId, String(cur.store_id));
  }

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/expense");
  revalidatePath("/cash");
  back("削除しました");
}

/**
 * 立替を「店の現金で返した」ときの精算。
 * 経費そのものは既に計上済みなので**もう一度計上しない**。動くのは現金出納だけ（レジからお金が出た）。
 * 振込で返した場合はここではなく「カード・口座取込 ＞ 支払の消込」で結ぶ（銀行側の二重計上を消すため）。
 */
export async function reimburseByCash(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const on = str(formData.get("reimbursed_on")) || new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (!id) return;

  const { data: e } = await admin
    .from("mon_expense")
    .select("id, store_id, segment_id, method, amount, item, payee, paid_by, reimbursed_on")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!e) back("対象が見つかりません", true);
  if (String(e.method) !== "advance") back("立替の行ではありません", true);
  if (e.reimbursed_on) back("すでに精算済みです", true);
  if (!e.store_id || !canWriteStore(actor, String(e.store_id))) back("この店舗の行は操作できません", true);

  const prev = await latestCashBalance(actor.companyId, String(e.store_id));
  const amount = Number(e.amount);
  await admin.from("mon_cash_ledger").insert({
    company_id: actor.companyId,
    store_id: e.store_id,
    segment_id: e.segment_id,
    entry_date: on,
    summary: "立替の精算",
    description: `${String(e.paid_by ?? "")}へ立替分をお返し（${String(e.item ?? "")}）`.trim(),
    counterpart: orNull(formData.get("paid_by")) ?? (e.paid_by as string | null),
    in_amount: 0,
    out_amount: amount,
    balance: prev - amount,
    memo: "経費入力から自動連携（立替の精算・経費は計上済みなので二重計上しません）",
    entered_by: actor.name,
    // source_ref は経費と同じIDだが source を分ける＝支払い本体の行と取り違えない
    source: "expense_reimburse",
    source_ref: id,
  });

  await admin.from("mon_expense").update({ reimbursed_on: on, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/expense");
  revalidatePath("/cash");
  back(`立替 ${amount.toLocaleString()}円を現金で精算しました（経費は計上済みのため二重計上しません）`);
}
