import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { monthRange } from "@/lib/money-util";
import { Panel, Badge, Empty, inputCls, btnCls, btnGhostCls, yen } from "@/components/ui";
import { uploadReceipt, updateReceipt, deleteReceipt } from "./actions";

/* 経理証憑（請求書・見積・領収書・レシート）— mon_receipts / DECISIONS #29a・#41
   電子帳簿保存法対応の保管＋金額突合の土台。契約書はLegal OS（別担当）。 */

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  invoice: "請求書",
  quote: "見積書",
  receipt: "領収書・レシート",
  delivery: "納品書",
  other: "その他",
};

const STATUS_LABEL: Record<string, string> = {
  unmatched: "未突合",
  matched: "突合済",
  archived: "保管のみ",
};

type ReceiptRow = {
  id: string;
  kind: string;
  issue_date: string | null;
  counterparty: string | null;
  amount: number | null;
  memo: string | null;
  status: string;
  storage_path: string;
  file_name: string;
  mon_expense_id: string | null;
  leg_document_id: string | null;
};

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; kind?: string }>;
}) {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const sp = await searchParams;

  const ym = sp.ym ?? new Date().toISOString().slice(0, 7);
  const { from, to } = monthRange(ym);

  let q = admin
    .from("mon_receipts")
    .select("id, kind, issue_date, counterparty, amount, memo, status, storage_path, file_name, mon_expense_id, leg_document_id")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  // 発行日が入っている行は月で絞る。未入力(null)の行は常に表示（入力促し）
  q = q.or(`issue_date.is.null,and(issue_date.gte.${from},issue_date.lt.${to})`);
  if (sp.kind) q = q.eq("kind", sp.kind);
  const { data } = await q;
  const rows = (data ?? []) as unknown as ReceiptRow[];

  // 閲覧用の署名付きURL（1時間有効）
  const signed = new Map<string, string>();
  if (rows.length > 0) {
    const { data: urls } = await admin.storage
      .from("mon-receipts")
      .createSignedUrls(rows.map((r) => r.storage_path), 3600);
    (urls ?? []).forEach((u, i) => {
      if (u.signedUrl) signed.set(rows[i].id, u.signedUrl);
    });
  }

  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">証憑（請求書・領収書・レシート）</h1>
          <p className="text-sm text-[--color-dim]">
            電子帳簿保存法の保管＋経費突合の土台。契約書はLegal OSへ（こちらは経理系のみ）
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="month" name="ym" defaultValue={ym} className={inputCls} />
          <select name="kind" defaultValue={sp.kind ?? ""} className={inputCls}>
            <option value="">全種別</option>
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className={btnGhostCls}>表示</button>
        </form>
      </div>

      <Panel title="＋ 証憑を登録（撮影した画像 / PDF）">
        <form action={uploadReceipt} className="grid gap-3 md:grid-cols-6">
          <input type="file" name="file" required accept="application/pdf,image/*" className={`${inputCls} md:col-span-2`} />
          <select name="kind" defaultValue="receipt" className={inputCls}>
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input type="date" name="issue_date" className={inputCls} />
          <input name="counterparty" placeholder="発行元（店名・会社名）" className={inputCls} />
          <input name="amount" inputMode="numeric" placeholder="金額（税込・円）" className={inputCls} />
          <input name="memo" placeholder="メモ（任意）" className={`${inputCls} md:col-span-5`} />
          <button className={btnCls}>登録</button>
        </form>
        <p className="mt-2 text-xs text-[--color-dim]">
          日付・金額は後から編集できます。まず撮って登録→あとで整えるでOK（OCR自動読み取りは経理AIフェーズで追加予定）
        </p>
      </Panel>

      <Panel title={`${ym} の証憑 ${rows.length}件${total > 0 ? `（金額計 ${yen(total)}）` : ""}`}>
        {rows.length === 0 ? (
          <Empty>この条件の証憑はありません</Empty>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <details key={r.id} className="rounded-xl border border-[--color-line] bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-3">
                  <Badge tone={r.status === "matched" ? "ok" : r.status === "archived" ? "dim" : "accent"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                  <span className="text-sm tabular-nums text-[--color-dim]">{r.issue_date ?? "日付未入力"}</span>
                  <span className="text-sm">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.counterparty ?? r.file_name}</span>
                  <span className="text-sm font-semibold tabular-nums">{r.amount != null ? yen(Number(r.amount)) : "-"}</span>
                  {signed.get(r.id) && (
                    <a
                      href={signed.get(r.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[--color-accent] underline"
                    >
                      📄開く
                    </a>
                  )}
                </summary>
                <div className="border-t border-[--color-line] p-3">
                  <form action={updateReceipt} className="grid gap-3 md:grid-cols-6">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="kind" defaultValue={r.kind} className={inputCls}>
                      {Object.entries(KIND_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <input type="date" name="issue_date" defaultValue={r.issue_date ?? ""} className={inputCls} />
                    <input name="counterparty" defaultValue={r.counterparty ?? ""} placeholder="発行元" className={inputCls} />
                    <input name="amount" inputMode="numeric" defaultValue={r.amount != null ? String(r.amount) : ""} placeholder="金額" className={inputCls} />
                    <select name="status" defaultValue={r.status} className={inputCls}>
                      {Object.entries(STATUS_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button className={btnCls}>保存</button>
                    <input name="memo" defaultValue={r.memo ?? ""} placeholder="メモ" className={`${inputCls} md:col-span-6`} />
                  </form>
                  <div className="mt-2 flex items-center justify-between text-xs text-[--color-dim]">
                    <span>
                      {r.file_name}
                      {r.mon_expense_id ? "・経費行と突合済" : ""}
                      {r.leg_document_id ? "・契約と紐付済" : ""}
                    </span>
                    <form action={deleteReceipt}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-[--color-danger] hover:underline">削除（台帳から除外）</button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
