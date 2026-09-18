import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { laneOf, listWorkBoard, WORK_LANES, type WorkBoardCard } from "@/lib/craft";
import { dateShort, range } from "@/lib/format";
import { TopNav } from "@/components/nav";
import { todayJst } from "@/lib/work-status";
import { markWorkStep } from "./actions";
import { AddTasksButton } from "@/components/add-tasks-button";

export const dynamic = "force-dynamic";

/**
 * 工房ボード（2026-09-19 ユーザー要望「上のタブに工房作業用のやつを出しておいて」）。
 * 注文書（gw_work_orders）を 発注待ち → 入荷待ち → 組立待ち → お渡し待ち → お渡し済み の段に並べる。
 * 段は日付から決まる（手で動かさない）。カードの【到着した】などを押すと今日の日付が入って次の段へ進む。
 * 組立に要る目標（振動数・バランス・長さ・総重量・ヘッド）はカードに出し、紙は【組立指示書】で刷る。
 */
export default async function WorkBoardPage() {
  const actor = await requireActor();
  const cards = await listWorkBoard(actor);
  const today = todayJst();
  const byLane = new Map<string, WorkBoardCard[]>();
  for (const c of cards) {
    const k = laneOf(c.work);
    byLane.set(k, [...(byLane.get(k) ?? []), c]);
  }

  return (
    <main className="mx-auto max-w-[1400px] p-6">
      <header className="mb-6">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
        <h1 className="text-2xl font-bold tracking-widest">Craft OS</h1>
        <p className="mt-1 text-sm text-(--color-dim)">工房 — 注文書ごとの作業の進み具合</p>
      </header>

      <TopNav active="work" />

      {cards.length === 0 ? (
        <p className="rounded-xl border border-(--color-line) bg-(--color-panel) p-10 text-center text-sm text-(--color-dim)">
          工房の作業はまだありません。伝票で【ご注文いただいた】を押すと、ここに並びます。
        </p>
      ) : (
        <div className="grid gap-4 overflow-x-auto pb-4 md:grid-cols-5">
          {WORK_LANES.map((lane) => {
            const list = byLane.get(lane.key) ?? [];
            return (
              <section key={lane.key} className="min-w-[240px] rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold">{lane.label}</h2>
                  <span className="text-xs text-(--color-dim)">{list.length}件</span>
                </div>
                <p className="mb-3 text-[11px] text-(--color-dim)">{lane.hint}</p>
                <div className="space-y-3">
                  {list.map((c) => (
                    <Card key={c.work.id} card={c} lane={lane.key} today={today} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Card({ card, lane, today }: { card: WorkBoardCard; lane: string; today: string }) {
  const { work: w, quote: q, specs } = card;
  const late = w.due_date && !w.delivered_on && w.due_date < today;
  const unpaid = w.delivered_on && !w.paid_on;
  const step =
    lane === "arrive"
      ? { key: "arrived_on", label: "到着した" }
      : lane === "assemble"
        ? { key: "assembled_on", label: "組み上がった" }
        : lane === "handover"
          ? { key: "delivered_on", label: "お渡しした" }
          : lane === "done" && !w.paid_on
            ? { key: "paid_on", label: "お支払いを受けた" }
            : null;

  return (
    <article className={`rounded-lg border bg-white p-3 shadow-sm ${late || unpaid ? "border-red-300" : "border-(--color-line)"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/q/${q.id}/work#koubou`} className="font-bold hover:underline">
          {q.customer_name} 様
        </Link>
        <span className="shrink-0 text-[11px] text-(--color-dim)">{w.order_no}</span>
      </div>
      <p className={`mt-0.5 text-xs ${late ? "font-bold text-red-600" : "text-(--color-dim)"}`}>
        仕上げ期日 {w.due_date ? dateShort(w.due_date) : "未定"}
        {late ? "（過ぎています）" : ""}
        {w.assembled_by_name ? `／担当 ${w.assembled_by_name}` : ""}
      </p>

      {specs.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-(--color-line) pt-2">
          {specs.map((s) => (
            <li key={s.id} className="text-xs leading-snug">
              <div className="font-medium">
                {s.clubType ? <span className="mr-1 rounded bg-(--color-panel-2) px-1 text-[10px]">{s.clubType}</span> : null}
                {s.shaft ?? "（シャフト未設定）"}
              </div>
              <div className="text-(--color-dim)">
                {[
                  s.head_name && `ヘッド ${s.head_name}`,
                  range(s.cpm_min, s.cpm_max, "cpm"),
                  range(s.balance_min, s.balance_max),
                  range(s.length_min, s.length_max, "inch"),
                  range(s.weight_min, s.weight_max, "g"),
                ]
                  .filter(Boolean)
                  .join("・") || "目標未入力"}
              </div>
            </li>
          ))}
        </ul>
      )}

      {unpaid && <p className="mt-2 text-xs font-bold text-red-600">お支払い未記録</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {step && (
          <form action={markWorkStep}>
            <input type="hidden" name="quote_id" value={q.id} />
            <input type="hidden" name="step" value={step.key} />
            <button className="rounded-lg bg-(--color-accent) px-2.5 py-1 text-xs font-medium text-white hover:bg-(--color-accent-2)">
              {step.label}（今日）
            </button>
          </form>
        )}
        {lane === "order" && (
          <Link href={`/q/${q.id}/work`} className="rounded-lg bg-(--color-accent) px-2.5 py-1 text-xs font-medium text-white">
            発注する
          </Link>
        )}
        {lane !== "done" && <AddTasksButton quoteId={q.id} small />}
        {(lane === "handover" || lane === "done") && (
          <Link href={`/q/${q.id}/work#assembly`} className="rounded-lg border border-(--color-line) px-2.5 py-1 text-xs">
            組立データ・お礼状
          </Link>
        )}
        <Link href={`/print/spec/${q.id}`} className="rounded-lg border border-(--color-line) px-2.5 py-1 text-xs">
          組立指示書
        </Link>
        <Link href={`/q/${q.id}/work#koubou`} className="rounded-lg border border-(--color-line) px-2.5 py-1 text-xs">
          開く
        </Link>
      </div>
    </article>
  );
}
