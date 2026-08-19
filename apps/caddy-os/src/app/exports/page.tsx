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
 * 出すのは **確定した派遣だけ**。仮組みをゴルフ場に送ってしまう事故が構造的に起きない。
 * 書式はゴルフ場ごとに設定（cad_clients.csv_format）。ここでは一時的に切り替えて試せる。
 */
export default async function ExportsPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();

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

  const confirmed = board.dispatches.filter((d) => d.status === "confirmed" && d.kind !== "golfwing");
  const byClient = new Map<string, typeof confirmed>();
  for (const d of confirmed) {
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
            ゴルフ場ごとの月間派遣一覧。そのままメール添付できるCSV（Excelで文字化けしないBOM付き）で書き出せます。
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      {tentativeCount > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          この月には<b>仮のまま</b>の割当が {tentativeCount} 件あります。CSVには入りません。
          <Link href={`/calendar?ym=${ym}`} className="ml-1 underline">
            カレンダーで確定する
          </Link>
        </div>
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
                  rows={rows.map((r) => ({
                    date: r.dispatch_date,
                    client_name: c.name,
                    caddie_name: r.caddie_name,
                    memo: r.memo,
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
