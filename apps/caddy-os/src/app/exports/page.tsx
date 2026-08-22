import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, getMonthBoard } from "@/lib/caddy";
import { CSV_FORMATS, type CsvFormat } from "@/lib/csv";
import { ExportPanel } from "./panel";

export const dynamic = "force-dynamic";

/**
 * ゴルフ場へ送る派遣日一覧（DECISIONS #140 / 小川さん依頼 4.）
 *
 * 既定は **確定した派遣だけ**。ただし「先に予定として送っておきたい」現場があるので（#145・
 * 小川さん依頼 2026-08-22）、チェックひとつで **仮も含める** ことができる。
 * 仮を混ぜたときは状態列・表題・注記の3か所で「予定」と明示する＝黙って混ざることはない。
 * 書式はゴルフ場ごとに設定（cad_clients.csv_format）。ここでは一時的に切り替えて試せる。
 */
export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; kari?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();
  const withTentative = sp.kari === "1";

  const admin = createAdmin();
  const [board, { data: clients }] = await Promise.all([
    getMonthBoard(actor.companyId, ym),
    admin
      .from("cad_clients")
      .select("id, name, csv_format, contact_name, contact_email")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name"),
  ]);

  const cs = (clients ?? []) as Array<{
    id: string;
    name: string;
    csv_format: CsvFormat;
    contact_name: string | null;
    contact_email: string | null;
  }>;

  // 自社ゴルフウィング勤務は提出対象外。取消も当然出さない
  const target = board.dispatches.filter(
    (d) => d.kind !== "golfwing" && (withTentative ? d.status !== "cancelled" : d.status === "confirmed")
  );
  const byClient = new Map<string, typeof target>();
  for (const d of target) {
    if (!d.client_id) continue;
    const cur = byClient.get(d.client_id) ?? [];
    cur.push(d);
    byClient.set(d.client_id, cur);
  }

  const tentativeCount = board.dispatches.filter((d) => d.status === "tentative").length;

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">ゴルフ場提出</h1>
          <p className="mt-1 text-sm text-(--color-dim)">
            ゴルフ場ごとの月間派遣一覧。そのままメール添付できる <b>CSV</b>（Excelで文字化けしないBOM付き）と{" "}
            <b>PDF</b>（印刷・回覧用）で書き出せます。
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
          />
          <label className="flex items-center gap-1.5 rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm">
            <input type="checkbox" name="kari" value="1" defaultChecked={withTentative} />
            仮も含めて出す
          </label>
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      {tentativeCount > 0 ? (
        withTentative ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <b>仮の割当 {tentativeCount} 件を含めて</b>出しています。
            <b>提出するCSV・PDFに「仮」の印は入りません</b>（ゴルフ場からは通常の予定として見えます。
            表題とファイル名だけ「予定」になります）。下の「内容を見る」では社内確認用に仮を表示しています。
            確定後にもう一度送り直してください。
            <Link href={`/exports?ym=${ym}`} className="ml-1 underline">
              確定分だけに戻す
            </Link>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            この月には<b>仮のまま</b>の割当が {tentativeCount} 件あります。いまの設定では入りません。
            <Link href={`/exports?ym=${ym}&kari=1`} className="ml-1 underline">
              仮も含めて出す
            </Link>
            <span className="mx-1">／</span>
            <Link href={`/calendar?ym=${ym}`} className="underline">
              カレンダーで確定する
            </Link>
          </div>
        )
      ) : null}

      <section className={cardCls}>
        {cs.length === 0 ? (
          <p className="text-sm text-(--color-dim)">ゴルフ場（取引先）を設定画面で登録してください</p>
        ) : (
          <div className="space-y-4">
            {cs.map((c) => {
              const rows = (byClient.get(c.id) ?? []).slice().sort((a, b) =>
                a.dispatch_date === b.dispatch_date
                  ? a.caddie_name.localeCompare(b.caddie_name, "ja")
                  : a.dispatch_date < b.dispatch_date
                    ? -1
                    : 1
              );
              return (
                <ExportPanel
                  key={c.id}
                  ym={ym}
                  client={c}
                  withTentative={withTentative}
                  rows={rows.map((r) => ({
                    date: r.dispatch_date,
                    client_name: c.name,
                    caddie_name: r.caddie_name,
                    memo: r.memo,
                    status: r.status,
                  }))}
                />
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-(--color-dim)">
        書式はゴルフ場ごとに設定画面で保存できます（{CSV_FORMATS.map((f) => f.label).join(" / ")}）。
        新しい書式が必要になったら <code>src/lib/csv.ts</code> に1つ足すだけで、画面もAPIも無改修で増えます。
      </p>
    </main>
  );
}
