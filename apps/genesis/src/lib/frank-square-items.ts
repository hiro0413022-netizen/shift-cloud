import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import { itemsMemo, squareLineItems, type SaleItem, type SquareLineItem } from "@/lib/frank-pos-pure";

/**
 * Squareの店頭決済に「何を売ったか」を付ける（#277）
 *
 * 経緯: 店頭のレジ打ち（打席利用・レッスン・物販…）は Webhook では支払いしか来ないので、
 * mon_sales には「Square店頭決済」「利用料」としか残っていなかった。
 * Money OS の売上分析で「どんな商品が売れているか」を見たい（2026-09-25 ユーザー要望）。
 *
 * - 新しい決済: Webhook で支払いの order_id から注文明細を引き、detail.items と memo に入れる（fetchOrderItems）
 * - 過去の決済: 毎日の cron で、明細の無い Square 行を Orders API の検索でまとめて埋める（runFrankSquareItemsBackfill）
 *
 * 金額・カテゴリ・日付は一切変えない（売上の数字は動かない）。付け足すのは detail.items と memo だけ。
 * Squareに聞けなかったとき（env無し・API失敗）は何もしないで終わる＝記帳そのものは止めない。
 */

const SQUARE_API = "https://connect.squareup.com/v2";

function token(): string | null {
  const t = process.env.SQUARE_ACCESS_TOKEN;
  return t && t.trim().length > 10 ? t.trim() : null;
}

async function squarePost(t: string, path: string, body: Record<string, unknown>, timeoutMs = 8000): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SQUARE_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", "Square-Version": "2025-01-23" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[frank-square-items] ${path} ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn(`[frank-square-items] ${path} failed: ${String(e)}`);
    return null;
  }
}

type SquareOrder = {
  id?: string;
  line_items?: SquareLineItem[];
  tenders?: Array<{ payment_id?: string | null }>;
};

/** 注文IDから品目リストを引く。聞けなかった・明細が無いときは空配列 */
export async function fetchOrderItems(orderId: string | null | undefined): Promise<SaleItem[]> {
  const t = token();
  if (!t || !orderId) return [];
  const j = await squarePost(t, "/orders/batch-retrieve", { order_ids: [orderId] }, 5000);
  const order = ((j?.orders as SquareOrder[] | undefined) ?? [])[0];
  return squareLineItems(order?.line_items);
}

type SaleRow = { id: string; sold_on: string; memo: string | null; detail: Record<string, unknown> | null };

/**
 * 明細の無い Square 行を埋める（毎日のcron）。
 * Orders API の検索で期間内の完了注文をまとめて取り、tenders[].payment_id で行と突き合わせる。
 * 見つからなかった行には detail.items_checked=true を付けて、翌日から探し直さない。
 */
export async function runFrankSquareItemsBackfill(opts: { days?: number; maxRows?: number } = {}) {
  const t = token();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!t || !locationId) return { ok: false, skipped: "square_env_missing" as const };

  const admin = createAdmin();
  const days = opts.days ?? 180;
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const { data } = await admin
    .from("mon_sales")
    .select("id, sold_on, memo, detail")
    .eq("store_id", FRANK_STORE_ID)
    .eq("source", "square")
    .in("category", ["利用料", "販売"])
    .is("deleted_at", null)
    .gte("sold_on", since)
    .not("detail->>square_payment_id", "is", null)
    .is("detail->items", null)
    .is("detail->items_checked", null)
    .order("sold_on", { ascending: true })
    .limit(opts.maxRows ?? 300);
  const rows = (data ?? []) as SaleRow[];
  if (!rows.length) return { ok: true, updated: 0, checked: 0 };

  // 対象期間の完了注文を全部取る（payment_id → 品目）
  const from = `${rows[0].sold_on}T00:00:00+09:00`;
  const byPayment = new Map<string, SaleItem[]>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const j = await squarePost(t, "/orders/search", {
      location_ids: [locationId],
      limit: 500,
      ...(cursor ? { cursor } : {}),
      query: {
        filter: {
          state_filter: { states: ["COMPLETED"] },
          date_time_filter: { closed_at: { start_at: from } },
        },
        sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
      },
    });
    if (!j) return { ok: false, error: "orders_search_failed", updated: 0 };
    for (const o of (j.orders as SquareOrder[] | undefined) ?? []) {
      const items = squareLineItems(o.line_items);
      if (!items.length) continue;
      for (const tn of o.tenders ?? []) if (tn.payment_id) byPayment.set(tn.payment_id, items);
    }
    cursor = typeof j.cursor === "string" ? j.cursor : undefined;
    if (!cursor) break;
  }

  let updated = 0;
  let checked = 0;
  for (const r of rows) {
    const pid = String(r.detail?.square_payment_id ?? "");
    const items = byPayment.get(pid);
    const detail = { ...(r.detail ?? {}) };
    const patch: Record<string, unknown> = {};
    if (items?.length) {
      detail.items = items;
      patch.detail = detail;
      // 手がかりの無い既定メモだけ置き換える（スタッフが書いたメモは残す）
      if (!r.memo || r.memo === "Square店頭決済") patch.memo = itemsMemo(items);
      updated++;
    } else {
      detail.items_checked = true;
      patch.detail = detail;
      checked++;
    }
    await admin.from("mon_sales").update(patch).eq("id", r.id);
  }
  return { ok: true, updated, checked };
}
