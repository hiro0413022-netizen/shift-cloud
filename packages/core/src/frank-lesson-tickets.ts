/**
 * パーソナルレッスン(25分)チケット（#199・2026-09-03 / migration 0141）
 *
 * ★ 残枚数は「増減の台帳の合計」
 *   frunk_lesson_tickets に 付与(+2) / 購入(+1) / 利用(-1) が時系列で並ぶ。
 *   会員数のような別カラムを持たない＝**画面の数字と履歴が食い違わない**。
 *
 * ★ お支払いが済んでいない購入は数えない
 *   status='pending_payment'（カード未登録→店頭でお支払い）は残高に入れない。
 *
 * ★ 9月入会キャンペーンの入口は2つ
 *   店頭の承認（member-os /frunk）と Web入会の入金確定（genesis frank-join）。
 *   どちらから来ても同じ条件・同じ行になるよう、判定はこの1ファイルに置く。
 *   二重付与はDBの一意索引（member_id × campaign）が最後の砦。
 */

/** Supabase admin クライアント。SupabaseClient の型は巨大で、構造照合すると TS2589 で
 *  ビルドが落ちる。受け取るときは検査せず、使う直前に必要な形へキャストする
 *  （frank-corporate-members.ts と同じ方針）。 */
type SupabaseAdminLike = object;

type Row = Record<string, unknown>;
type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;
type SelectChain = {
  eq(col: string, val: unknown): SelectChain;
  in(col: string, vals: unknown[]): SelectChain;
  is(col: string, val: null): SelectChain;
  order(col: string, opts: { ascending: boolean }): SelectChain;
  limit(n: number): SelectChain;
  maybeSingle(): Res<Row | null>;
} & PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
type Admin = {
  from(table: string): {
    select(cols: string): SelectChain;
    insert(row: Row | Row[]): Res<null>;
  };
};
const db = (a: SupabaseAdminLike) => a as unknown as Admin;

/* ------------------------------------------------------------
   9月入会キャンペーン（2026-09-03 ユーザー指示）
   「9月入会でパーソナルチケット25分2枚プレゼント」
   期間を過ぎれば自動的に付かなくなる（コードを直しに行かなくていい）。
------------------------------------------------------------ */
export const JOIN_TICKET_CAMPAIGN = {
  code: "sep2026_join",
  label: "9月入会キャンペーン（パーソナルレッスン25分 2枚プレゼント）",
  from: "2026-09-01",
  to: "2026-09-30",
  qty: 2,
  minutes: 25,
} as const;

export type TicketRow = {
  id: string;
  kind: "grant" | "purchase" | "use" | "refund";
  qty: number;
  minutes: number;
  status: "granted" | "pending_payment" | "void";
  amount: number | null;
  payment_method: string | null;
  campaign: string | null;
  note: string | null;
  created_at: string;
};

/** 残枚数。status='granted' の行だけを足す（お支払い待ちは数えない）。 */
export async function ticketBalance(adminClient: SupabaseAdminLike, memberId: string): Promise<number> {
  const { data } = await db(adminClient)
    .from("frunk_lesson_tickets")
    .select("qty")
    .eq("member_id", memberId)
    .eq("status", "granted")
    .is("deleted_at", null);
  return (data ?? []).reduce((n, r) => n + Number(r.qty ?? 0), 0);
}

/** お支払い待ちの枚数（会員画面の「店頭でお支払いください」表示に使う）。 */
export async function pendingTicketCount(adminClient: SupabaseAdminLike, memberId: string): Promise<number> {
  const { data } = await db(adminClient)
    .from("frunk_lesson_tickets")
    .select("qty")
    .eq("member_id", memberId)
    .eq("status", "pending_payment")
    .is("deleted_at", null);
  return (data ?? []).reduce((n, r) => n + Number(r.qty ?? 0), 0);
}

/** 履歴（新しい順）。会員画面・スタッフの会員カードで同じものを見せる。 */
export async function listTickets(
  adminClient: SupabaseAdminLike,
  memberId: string,
  limit = 30
): Promise<TicketRow[]> {
  const { data } = await db(adminClient)
    .from("frunk_lesson_tickets")
    .select("id, kind, qty, minutes, status, amount, payment_method, campaign, note, created_at")
    .eq("member_id", memberId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as TicketRow[];
}

/** 履歴1行の日本語表示（会員にもスタッフにも同じ言葉で出す） */
export function ticketRowLabel(r: TicketRow): string {
  if (r.status === "void") return "取り消し";
  if (r.kind === "grant") return r.campaign === JOIN_TICKET_CAMPAIGN.code ? "9月入会プレゼント" : "店舗からの付与";
  if (r.kind === "purchase")
    return r.status === "pending_payment" ? "ご購入（店頭でお支払い待ち）" : "ご購入";
  if (r.kind === "refund") return "お戻し";
  return "レッスンでご利用";
}

/**
 * 9月入会キャンペーンのチケットを付ける（承認・入金確定のどちらからでも呼べる）。
 *
 * 付ける条件（ユーザー選択「一般プランのみ・9月中自動」）:
 *   ・入会日が期間内
 *   ・在籍中（active）
 *   ・一般に公開しているプラン（public_signup）で、法人プランではない
 *     ＝スタッフ・テスト・モニターには付けない
 *   ・法人の「ご利用者」行には付けない（corporate_parent_id が入っている行）
 *
 * 失敗しても呼び出し元（入会処理）は止めない。戻り値は付けた枚数（0=対象外/付与済み）。
 */
export async function grantJoinCampaignTickets(
  adminClient: SupabaseAdminLike,
  memberId: string
): Promise<number> {
  try {
    const admin = db(adminClient);
    const { data } = await admin
      .from("frunk_members")
      .select("id, company_id, store_id, status, join_date, corporate_parent_id, frunk_plans(public_signup, is_corporate)")
      .eq("id", memberId)
      .is("deleted_at", null)
      .maybeSingle();
    const m = data as Row | null;
    if (!m) return 0;

    const plan = (m.frunk_plans ?? null) as { public_signup?: boolean; is_corporate?: boolean } | null;
    const joinDate = m.join_date ? String(m.join_date).slice(0, 10) : "";
    const eligible =
      String(m.status) === "active" &&
      !m.corporate_parent_id &&
      plan?.public_signup === true &&
      plan?.is_corporate !== true &&
      joinDate >= JOIN_TICKET_CAMPAIGN.from &&
      joinDate <= JOIN_TICKET_CAMPAIGN.to;
    if (!eligible) return 0;

    // 既に付いていれば何もしない（一意索引もあるが、無駄なエラーを出さない）
    const { data: had } = await admin
      .from("frunk_lesson_tickets")
      .select("id")
      .eq("member_id", memberId)
      .eq("campaign", JOIN_TICKET_CAMPAIGN.code)
      .is("deleted_at", null)
      .maybeSingle();
    if (had) return 0;

    const { error } = await admin.from("frunk_lesson_tickets").insert({
      company_id: m.company_id,
      store_id: m.store_id ?? null,
      member_id: memberId,
      kind: "grant",
      qty: JOIN_TICKET_CAMPAIGN.qty,
      minutes: JOIN_TICKET_CAMPAIGN.minutes,
      status: "granted",
      payment_method: "free",
      campaign: JOIN_TICKET_CAMPAIGN.code,
      note: JOIN_TICKET_CAMPAIGN.label,
      source: "auto",
    });
    if (error) return 0; // 一意索引での衝突＝既に付いている。入会処理は止めない
    return JOIN_TICKET_CAMPAIGN.qty;
  } catch {
    return 0;
  }
}
