import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { activateWebJoin } from "@/lib/frank-join";
import { logEvent } from "@/lib/kernel";

/**
 * 入会申込の「本当に決済されたか」を Square に聞きに行く（#188）
 *
 * 経緯: /frunk の「承認して会員化」は、決済が済んでいるかどうかに関係なく押せた。
 * Web入会（#129）は入金Webhookで自動的に確定するので、そこに残っている pending は
 * 「まだ払っていない人」か「Webhookが届かなかった人」のどちらかで、**画面上は見分けが付かない**。
 * 見分けが付かないまま押せるので、未入金のまま会員番号が出る事故が起こりうる（2026-09-01 ユーザー指摘）。
 *
 * ここでやること: DBの billing_status を信じるのではなく、**Squareの取引そのもの**を見る。
 *  ① 決済リンク発行時に控えた注文ID（履歴も含む）を batch-retrieve
 *  ② 見つからなければ、申込メールで Square 顧客 → その顧客の完了注文を検索
 *     （#137 の実障害: サブスク付き決済リンクの入金は別の注文IDで届く）
 *
 * 見つかった入金は「金額」「日時」「注文ID」を返し、画面にそのまま出す。
 * スタッフは Square ダッシュボードの取引一覧と同じ数字を見て確認できる。
 */

const SQUARE_API = "https://connect.squareup.com/v2";

function accessToken(): string | null {
  const t = process.env.SQUARE_ACCESS_TOKEN;
  return t && t.trim().length > 10 ? t.trim() : null;
}

type SquareOrder = {
  id?: string;
  state?: string;
  total_money?: { amount?: number; currency?: string };
  closed_at?: string;
  created_at?: string;
};

export type JoinPaymentPayment = {
  orderId: string;
  amount: number;
  at: string | null;
  /** どの手がかりで見つけたか（画面で説明するため） */
  via: "order_id" | "email";
};

export type JoinPaymentStatus = {
  ok: boolean;
  /** Squareに問い合わせできたか（envが無い環境では false） */
  checked: boolean;
  /** 入金を1件以上見つけたか */
  paid: boolean;
  /** 見つけた入金 */
  payments: JoinPaymentPayment[];
  /** 決済リンク発行時に確定した請求予定額（税込・円）。0＝リンク未発行 */
  expected: number;
  /** 見つけた入金の合計が請求予定額と一致するか */
  amountMatches: boolean;
  memberNo: string | null;
  status: string;
  billingStatus: string;
  email: string | null;
  /** Squareダッシュボードで探すときの手がかり（画面にそのまま出す） */
  hint: string;
  error?: string;
};

async function squarePost(token: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${SQUARE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errs = (json.errors as Array<{ detail?: string; code?: string }> | undefined) ?? [];
    throw new Error(errs.map((e) => e.detail ?? e.code).join("; ") || `Square API error (${res.status})`);
  }
  return json;
}

/** 完了している注文だけを入金として扱う（OPEN のまま＝カード画面を開いただけ） */
function completed(orders: SquareOrder[], via: JoinPaymentPayment["via"]): JoinPaymentPayment[] {
  return orders
    .filter((o) => String(o.state ?? "") === "COMPLETED" && Number(o.total_money?.amount ?? 0) > 0)
    .map((o) => ({
      orderId: String(o.id ?? ""),
      amount: Number(o.total_money?.amount ?? 0), // JPYは最小単位＝円
      at: (o.closed_at as string | undefined) ?? (o.created_at as string | undefined) ?? null,
      via,
    }));
}

/** 申込1件について、Squareの入金を探す */
export async function lookupJoinPayment(memberId: string): Promise<JoinPaymentStatus> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_members")
    .select(
      "id, name, member_no, status, billing_status, email, square_customer_id, square_checkout_order_id, square_checkout_order_ids, square_checkout_breakdown",
    )
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();

  const base: JoinPaymentStatus = {
    ok: false,
    checked: false,
    paid: false,
    payments: [],
    expected: 0,
    amountMatches: false,
    memberNo: null,
    status: "",
    billingStatus: "",
    email: null,
    hint: "",
  };
  if (!data) return { ...base, error: "会員が見つかりません" };

  const row = data as Record<string, unknown>;
  const email = (row.email as string | null) ?? null;
  const bd = (row.square_checkout_breakdown ?? null) as { total?: number } | null;
  const expected = Number(bd?.total ?? 0);
  const ids = Array.from(
    new Set(
      [
        String(row.square_checkout_order_id ?? ""),
        ...((Array.isArray(row.square_checkout_order_ids) ? row.square_checkout_order_ids : []) as unknown[]).map(String),
      ].filter((s) => s && s !== "null"),
    ),
  );

  const out: JoinPaymentStatus = {
    ...base,
    ok: true,
    expected,
    memberNo: (row.member_no as string | null) ?? null,
    status: String(row.status ?? ""),
    billingStatus: String(row.billing_status ?? ""),
    email,
    hint: email
      ? `Square ダッシュボード → 取引 で「${email}」を検索すると同じ決済が出ます`
      : "Square ダッシュボード → 取引 で、申込日のカード決済をご確認ください",
  };

  const token = accessToken();
  if (!token) {
    return { ...out, hint: "Squareの照会設定がこの環境にありません。Squareダッシュボードの「取引」でご確認ください" };
  }
  out.checked = true;

  try {
    // ① 決済リンクの注文IDで引く
    if (ids.length > 0) {
      const j = (await squarePost(token, "/orders/batch-retrieve", { order_ids: ids.slice(0, 100) })) as {
        orders?: SquareOrder[];
      };
      out.payments.push(...completed(j.orders ?? [], "order_id"));
    }

    // ② 見つからなければメールから顧客をたどる（#137: 入金は別の注文IDで届くことがある）
    if (out.payments.length === 0 && email) {
      const locationId = process.env.SQUARE_LOCATION_ID;
      const c = (await squarePost(token, "/customers/search", {
        limit: 10,
        query: { filter: { email_address: { exact: email } } },
      })) as { customers?: Array<{ id?: string }> };
      const customerIds = (c.customers ?? []).map((x) => String(x.id ?? "")).filter(Boolean);
      if (customerIds.length > 0 && locationId) {
        const o = (await squarePost(token, "/orders/search", {
          location_ids: [locationId],
          limit: 20,
          query: {
            filter: {
              customer_filter: { customer_ids: customerIds },
              state_filter: { states: ["COMPLETED"] },
            },
            sort: { sort_field: "CLOSED_AT", sort_order: "DESC" },
          },
        })) as { orders?: SquareOrder[] };
        out.payments.push(...completed(o.orders ?? [], "email"));
      }
    }
  } catch (e) {
    console.error("[frank-join-payment] square lookup failed:", e);
    return { ...out, error: String(e instanceof Error ? e.message : e) };
  }

  out.paid = out.payments.length > 0;
  const total = out.payments.reduce((a, p) => a + p.amount, 0);
  out.amountMatches = expected > 0 && total === expected;
  return out;
}

/**
 * 入金が確認できた pending 会員を、Web入会と同じ手順で確定する（救済）。
 *
 * 「入金は来ているのに Webhook が届かなかった」ケースは /frunk の手動承認で救っていたが、
 * 手動承認では **会員番号のメールしか出ない**（控えPDF・カルテ・キャンペーン判定は activateWebJoin にしかない）。
 * 入金を確かめたうえで正規の確定処理を通せば、Webhookが届いた人とまったく同じ状態になる。
 */
export async function confirmJoinByPayment(
  memberId: string,
): Promise<{ ok: boolean; memberNo?: string | null; error?: string; status: JoinPaymentStatus }> {
  const status = await lookupJoinPayment(memberId);
  if (!status.ok) return { ok: false, error: status.error ?? "照会できませんでした", status };
  if (!status.paid) return { ok: false, error: "Squareで入金を確認できませんでした", status };
  if (status.status !== "pending") return { ok: false, error: "この申込はすでに処理済みです", status };
  const admin = createAdmin();
  const { data: who } = await admin.from("frunk_members").select("company_id, name").eq("id", memberId).maybeSingle();
  const memberNo = await activateWebJoin(admin, memberId);
  if (!memberNo) return { ok: false, error: "入会の確定に失敗しました（会員番号の採番）", status };

  // Webhookが届いていれば自動で済んでいたはずの後始末（サブスクの価格上書き解除・前取り分のスキップ）は
  // ここでは触らない。触ると二重に効く危険があるので、**人が Square で確かめる**ように記録だけ残す（#137）。
  if (who?.company_id) {
    await logEvent(String(who.company_id), {
      event_type: "frunk.join_confirmed_manually",
      title: `入金を確認して入会を確定: ${String(who.name ?? "")}様（${memberNo}）Squareのサブスク設定を要確認`.slice(0, 120),
      source: "frank_billing",
      source_type: "system",
      severity: "notice",
    });
  }
  return { ok: true, memberNo, status };
}
