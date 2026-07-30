import Link from "next/link";
import { requireInventoryActor } from "@/lib/auth";
import { listSessions, yen } from "@/lib/inventory";
import { jstYmd } from "@/lib/jst";
import { Panel, Badge, Empty, inputCls } from "@/components/ui";
import { startCount } from "./actions";

export const dynamic = "force-dynamic";

export default async function CountIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const actor = await requireInventoryActor();
  const sessions = await listSessions(actor.companyId, 24);
  const open = sessions.find((s) => s.status === "open");

  // 既定の基準日は「今日」。月末棚卸が主だが、実際は数日ずれて数えるので変更できるようにする
  const today = jstYmd();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-bold">棚卸</h1>
        <p className="text-sm text-(--color-dim)">
          保管場所ごとに歩きながら数えます。数が変わっていない品番は触らなくて構いません
        </p>
      </header>

      {error && <p className="rounded-lg bg-(--color-danger)/10 px-3 py-2 text-sm text-(--color-danger)">{error}</p>}

      {open ? (
        <Panel title="入力中の棚卸">
          <Link
            href={`/count/${open.id}`}
            className="flex items-center justify-between rounded-lg bg-(--color-accent) px-4 py-4 font-bold text-black"
          >
            <span>
              {open.counted_on} {open.label}
            </span>
            <span>続ける →</span>
          </Link>
        </Panel>
      ) : (
        <Panel title="棚卸をはじめる">
          <form action={startCount} className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-(--color-dim)">基準日</span>
              <input type="date" name="countedOn" defaultValue={today} className={inputCls} />
            </label>
            <button className="rounded-lg bg-(--color-accent) px-5 py-3 font-bold text-black">はじめる</button>
          </form>
          <p className="mt-3 text-xs text-(--color-dim)">
            基準日は「その時点の在庫」として記録される日付です。月末棚卸なら月末日を入れてください
          </p>
        </Panel>
      )}

      <Panel title="過去の棚卸">
        {sessions.length === 0 ? (
          <Empty>まだ棚卸がありません</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/count/${s.id}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{s.counted_on}</span>{" "}
                    <span className="text-(--color-dim)">{s.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums text-(--color-dim)">
                    {s.total_qty}点 / {yen(s.total_value)}
                    <Badge tone={s.status === "closed" ? "ok" : "warn"}>
                      {s.status === "closed" ? "確定" : "入力中"}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
