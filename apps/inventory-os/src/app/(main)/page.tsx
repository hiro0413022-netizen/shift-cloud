import Link from "next/link";
import { requireInventoryActor } from "@/lib/auth";
import { listStock, listSessions, yen, groupByLocation, storeScopeOf, scopeLabel } from "@/lib/inventory";
import { Panel, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireInventoryActor();
  // 店舗スコープを必ず通す（#134）。以前は companyId だけで inv_stock 全件＝両店合算だった
  const scope = storeScopeOf(actor);
  const [stock, sessions] = await Promise.all([
    listStock(actor.companyId, { scope }),
    listSessions(actor.companyId, scope, 8),
  ]);

  const totalQty = stock.reduce((s, r) => s + r.qty, 0);
  const totalValue = stock.reduce((s, r) => s + r.value, 0);
  const zero = stock.filter((r) => r.qty === 0);
  const reorder = stock.filter((r) => r.needs_reorder && r.qty > 0);
  const noLocation = stock.filter((r) => !r.location1);
  const closed = sessions.filter((s) => s.status === "closed");
  const openSession = sessions.find((s) => s.status === "open");
  const latest = closed[0];
  // 直近の棚卸で数えられなかった品番。前回以前の数量がそのまま理論在庫になっているので明示する
  const stale = latest ? stock.filter((r) => r.base_on !== null && r.base_on !== latest.counted_on) : [];
  const neverCounted = stock.filter((r) => r.base_on === null);

  // 死蔵在庫: 直近2回の確定棚卸で数量が動いていない かつ 在庫金額が大きいもの
  const groups = groupByLocation(stock);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            在庫状況
            {/* どの範囲の数字かを必ず出す（#134。オーナーだけ「全店」になる） */}
            <Badge tone={actor.isOwner ? "ok" : "default"}>{scopeLabel(actor)}</Badge>
          </h1>
          <p className="text-sm text-(--color-dim)">
            理論在庫＝直近の確定棚卸（{latest ? latest.counted_on : "—"}）＋それ以降の入出庫
          </p>
        </div>
        {openSession ? (
          <Link
            href={`/count/${openSession.id}`}
            className="rounded-lg bg-(--color-accent) px-4 py-2.5 text-sm font-bold text-black"
          >
            棚卸中（{openSession.counted_on}）を続ける →
          </Link>
        ) : (
          <Link href="/count" className="rounded-lg border border-(--color-line) px-4 py-2.5 text-sm">
            棚卸をはじめる
          </Link>
        )}
      </header>

      {/* 原因を名指しし、その場で直せる導線まで出す（#122の方針） */}
      {!actor.isOwner && actor.stores.length === 0 && (
        <p className="rounded-lg border border-(--color-danger)/40 bg-(--color-danger)/5 px-3 py-2 text-sm text-(--color-danger)">
          あなたに配属店舗が設定されていないため、在庫を表示できません（#134）。
          Shift Cloud のスタッフ設定で店舗を配属してください。
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="品番数（有効）" value={stock.length.toLocaleString("ja-JP")} sub={`うち在庫ゼロ ${zero.length}`} />
        <Stat label="在庫点数" value={totalQty.toLocaleString("ja-JP")} sub="理論在庫の合計" />
        <Stat label="在庫金額" value={yen(totalValue)} sub="仕入単価ベース" />
        <Stat
          label="発注候補"
          value={reorder.length.toLocaleString("ja-JP")}
          sub={reorder.length ? "適正在庫を割っています" : "適正在庫は満たしています"}
          tone={reorder.length ? "warn" : "ok"}
        />
      </div>

      {(stale.length > 0 || neverCounted.length > 0) && (
        <p className="rounded-lg border border-(--color-warn)/40 bg-(--color-warn)/5 px-3 py-2 text-sm text-(--color-warn)">
          {stale.length > 0 && (
            <>
              直近の棚卸（{latest?.counted_on}）で数えられていない品番が <b>{stale.length}</b> 件あります。
              それより前の棚卸の数量をそのまま在庫として扱っています。
            </>
          )}
          {neverCounted.length > 0 && <> 一度も数えられていない品番が {neverCounted.length} 件あります。</>}
        </p>
      )}

      {reorder.length > 0 && (
        <Panel title="適正在庫を割っている品番">
          <ul className="divide-y divide-(--color-line)">
            {reorder.slice(0, 12).map((r) => (
              <li key={r.item_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-(--color-dim)">{r.code}</span>{" "}
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {r.qty}
                  {r.unit} <span className="text-(--color-dim)">/ 適正 {r.reorder_point}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="保管場所ごとの在庫">
          {groups.length === 0 ? (
            <Empty>品番がまだ登録されていません</Empty>
          ) : (
            <ul className="divide-y divide-(--color-line)">
              {groups.map((g) => {
                const q = g.rows.reduce((s, r) => s + r.qty, 0);
                const v = g.rows.reduce((s, r) => s + r.value, 0);
                return (
                  <li key={g.location} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{g.location}</span>
                    <span className="shrink-0 text-(--color-dim) tabular-nums">
                      {g.rows.length}品番 / {q}点 / {yen(v)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {noLocation.length > 0 && (
            <p className="mt-3 text-xs text-amber-400">
              保管場所が未設定の品番が {noLocation.length} 件あります。設定すると棚卸で「歩きながら数える」順に並べられます
            </p>
          )}
        </Panel>

        <Panel title="棚卸の履歴">
          {sessions.length === 0 ? (
            <Empty>まだ棚卸がありません</Empty>
          ) : (
            <ul className="divide-y divide-(--color-line)">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/count/${s.id}`} className="min-w-0 truncate hover:text-(--color-accent)">
                    {s.counted_on} <span className="text-(--color-dim)">{s.label}</span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-(--color-dim)">
                      {s.total_qty}点 / {yen(s.total_value)}
                    </span>
                    <Badge tone={s.status === "closed" ? "ok" : "warn"}>
                      {s.status === "closed" ? "確定" : "入力中"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {zero.length > 0 && (
        <Panel title={`在庫ゼロが続いている品番（${zero.length}件）`}>
          <p className="mb-2 text-xs text-(--color-dim)">
            扱いをやめたものは品番マスタで「廃番」にすると、棚卸画面に出なくなります
          </p>
          <div className="flex flex-wrap gap-1.5">
            {zero.slice(0, 60).map((r) => (
              <Link
                key={r.item_id}
                href={`/items/${r.item_id}`}
                className="rounded border border-(--color-line) px-2 py-1 text-xs text-(--color-dim) hover:text-(--color-txt)"
              >
                {r.code}
              </Link>
            ))}
            {zero.length > 60 && <span className="px-2 py-1 text-xs text-(--color-dim)">ほか {zero.length - 60} 件</span>}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "ok" | "warn";
}) {
  const color = tone === "warn" ? "text-(--color-warn)" : tone === "ok" ? "text-(--color-ok)" : "";
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-xs text-(--color-dim)">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-(--color-dim)">{sub}</p>}
    </div>
  );
}
