import Link from "next/link";
import type { FullQuote } from "@/lib/craft";
import { acceptOrder, markPaid, presentQuote } from "@/app/q/[id]/flow-actions";
import { OrderButton } from "@/components/order-button";
import { GOLFWING_POOL_URL } from "@/lib/links";

/**
 * 伝票の流れ（2026-09-18 ユーザーの運用に合わせて作った）:
 *   ① 見積をつくる → ② お客様に見積を見せる → ③ ご注文（注文書を印刷）→ ④ お支払い ／ ⑤ 発注（発注管理のオーダー用紙へ）
 *   → ⑥ 到着 → ⑦ 組立 → ⑧ お渡し
 * いま何をすればいいかを1つだけ大きく出す。④と⑤はどちらが先でもよい（その場でお支払い→発注、が多い）。
 * 見積書を出さずに注文書だけで済ませる伝票もある（ユーザー判断 2026-09-13）ので、②は飛ばせる。
 */
export function FlowBar({ full, poCount }: { full: FullQuote; poCount: number }) {
  const q = full.quote;
  const w = full.work;
  const id = q.id;
  const hasItems = full.items.length > 0;
  const orderable = full.items.some((it) => ["product", "grip", "sleeve", "coating", "free"].includes(it.line_kind ?? ""));
  const presented = Boolean(q.quote_issued_at) || ["presented", "accepted", "ordered"].includes(q.status) || Boolean(w);
  const ordered = Boolean(w?.ordered_on) || poCount > 0;

  const steps = [
    { label: "見積をつくる", done: hasItems },
    { label: "お客様に見せる", done: presented, skip: !q.quote_issued_at && Boolean(w) },
    { label: "ご注文（注文書）", done: Boolean(w) },
    { label: "お支払い", done: Boolean(w?.paid_on) },
    { label: "発注", done: ordered, skip: Boolean(w) && !orderable },
    { label: "到着", done: Boolean(w?.arrived_on) },
    { label: "組立", done: Boolean(w?.assembled_on) },
    { label: "お渡し", done: Boolean(w?.delivered_on) },
  ];
  const current = steps.findIndex((s) => !s.done && !s.skip);

  const big =
    "inline-flex items-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-accent-2) disabled:opacity-50";
  const ghost =
    "inline-flex items-center gap-2 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm font-medium text-(--color-dim) hover:text-(--color-txt)";

  return (
    <section className="no-print mb-5 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                s.done
                  ? "bg-emerald-50 text-emerald-700"
                  : s.skip
                    ? "bg-(--color-panel-2) text-(--color-dim) line-through"
                    : i === current
                      ? "bg-(--color-accent) font-bold text-white"
                      : "bg-(--color-panel-2) text-(--color-dim)"
              }`}
            >
              <span>{s.done ? "✓" : i + 1}</span>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-(--color-dim)">›</span>}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        {!w && (
          <>
            <form action={presentQuote}>
              <input type="hidden" name="quote_id" value={id} />
              <button className={presented ? ghost : big} disabled={!hasItems}>
                {presented ? "御見積書をもう一度印刷" : "② お客様に見積を見せる（御見積書を印刷）"}
              </button>
            </form>
            <form action={acceptOrder}>
              <input type="hidden" name="quote_id" value={id} />
              <button className={presented ? big : ghost} disabled={!hasItems}>
                ③ ご注文いただいた（注文書をつくって印刷）
              </button>
            </form>
          </>
        )}

        {w && (
          <>
            <Link href={`/print/order/${id}`} className={ghost}>
              御注文書を印刷
            </Link>
            {!w.paid_on ? (
              <form action={markPaid}>
                <input type="hidden" name="quote_id" value={id} />
                <button className={big}>④ お支払い済みにする</button>
              </form>
            ) : (
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                お支払い済み（{w.paid_on.replace(/-/g, "/")}）
              </span>
            )}
            {orderable &&
              (ordered ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    発注済み{w.ordered_on ? `（${w.ordered_on.replace(/-/g, "/")}）` : ""}
                  </span>
                  <OrderButton quoteId={id} label="発注管理で開く" className={ghost} />
                </span>
              ) : (
                <OrderButton quoteId={id} label="⑤ 発注する（発注管理のオーダー用紙へ）" />
              ))}
            {/* 2026-09-19 ユーザー指摘「押しても反応しない」: 注文書タブにいると同じURLで何も起きなかった → 組立指示書まで飛ぶ */}
            <Link href={`/q/${id}/work#koubou`} className={ghost}>
              工房（到着・組立・お渡し）↓
            </Link>
          </>
        )}
      </div>
      {w && orderable && !ordered && (
        <p className="mt-2 text-xs text-(--color-dim)">
          【発注する】で、仕入先ごとに発注管理の
          <a href={GOLFWING_POOL_URL} target="_blank" rel="noreferrer" className="underline">
            発注プール
          </a>
          に入り、そのオーダー用紙が別タブで開きます。仕入先へ送るのはいつもどおり発注管理から。入荷登録をすると「到着」が自動で入ります。
        </p>
      )}
    </section>
  );
}
