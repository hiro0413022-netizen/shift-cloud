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

/**
 * 会員ごとの残枚数をまとめて返す（#221）。
 *
 * 会員一覧に残枚数を出すため。1人ずつ ticketBalance を呼ぶと会員数ぶんの往復になるので、
 * 台帳を1回読んで数える（合計の出し方は ticketBalance と同じ＝画面ごとに違う数にならない）。
 */
export async function ticketBalances(adminClient: SupabaseAdminLike, memberIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (memberIds.length === 0) return out;
  const { data } = await db(adminClient)
    .from("frunk_lesson_tickets")
    .select("member_id, qty")
    .in("member_id", memberIds)
    .eq("status", "granted")
    .is("deleted_at", null)
    .limit(5000);
  for (const r of data ?? []) {
    const id = String(r.member_id ?? "");
    if (!id) continue;
    out.set(id, (out.get(id) ?? 0) + Number(r.qty ?? 0));
  }
  return out;
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


/**
 * チケットの代金（税抜）。まとめ買いの割引を大きい束から当てる（2026-09-19 ユーザー指摘:
 * 「4枚で9,900円（税込）のはずが11,000円になっている」＝1枚2,500円×4で計算していた）。
 *   例 unit=2500, packs=[{qty:4, price:9000}]
 *     1枚 2,500 ／ 4枚 9,000 ／ 5枚 9,000+2,500 ／ 8枚 18,000
 * 束の値段が単価×枚数より高い設定は使わない（お客様が損をしない）。
 */
export function ticketAmountExTax(qty: number, unitExTax: number, packs: { qty: number; price: number }[] = []): number {
  const want = Math.max(0, Math.floor(qty));
  const usable = packs
    .filter((p) => p.qty > 1 && p.price > 0 && p.price < unitExTax * p.qty)
    .sort((a, b) => b.qty - a.qty);

  /** 大きい束から当てる素直な計算 */
  const greedy = (n: number): number => {
    let rest = n;
    let total = 0;
    for (const p of usable) {
      const k = Math.floor(rest / p.qty);
      total += k * p.price;
      rest -= k * p.qty;
    }
    return total + rest * unitExTax;
  };

  // 「多く買うほうが安い」を起こさない（2026-09-25・8枚セットを足して発覚）。
  //   例 1枚2,500／4枚9,000／8枚16,000 のとき、素直に計算すると
  //   7枚＝9,000+2,500×3＝16,500 で、8枚の16,000より高くなる。
  //   束1つぶん先まで見て、いちばん安い買い方の金額にする（それ以上先は束が増えるだけなので見なくてよい）。
  const maxPack = usable.length > 0 ? usable[0].qty : 0;
  let best = greedy(want);
  for (let n = want + 1; n <= want + maxPack; n++) best = Math.min(best, greedy(n));
  return best;
}

/* ============================================================================
   レッスンの長さぶんのチケット・購入ぶんの判定（#328・2026-10-01）

   発端（林さんの報告・2026-10-01）:
     本田様のパーソナルを50分に変えたら「チケットは1枚しか減らないのに
     当日精算2,500円が出た」。確定済みの予約を保存し直すと、
     **既に1枚使っているのに、もう1枚引けず料金だけ復活していた**。

   決めごと（2026-10-01 ユーザー決定）:
     ・1枚＝25分。50分なら2枚（切り上げ）
     ・足りないときは**あるだけ使って、残りだけ当日精算**
     ・インセンティブは**購入チケット1枚につき1,000円**。無料付与は対象外
   ========================================================================== */

/** 購入チケット1枚が使われたときに担当へ出すインセンティブ（円・2026-10-01 ユーザー決定） */
export const TICKET_INCENTIVE_UNIT_PRICE = 1000;

/**
 * レッスンの長さに要るチケットの枚数。1枚＝ticketMinutes分、端数は切り上げ。
 *
 * ★ 切り上げる理由: 30分を1枚にすると、25分の方と同じ代金で5分多くなる。
 *   「1枚で何分か」を崩さないほうが、店頭でもお客様にも説明が1行で済む。
 */
export function ticketsForMinutes(minutes: number, ticketMinutes = 25): number {
  const m = Number(minutes);
  const unit = Number(ticketMinutes) > 0 ? Number(ticketMinutes) : 25;
  if (!Number.isFinite(m) || m <= 0) return 1;
  return Math.max(1, Math.ceil(m / unit));
}

/** 引き当て計算に渡す台帳の1行（必要な列だけ） */
export type TicketLedgerRow = {
  kind: "grant" | "purchase" | "use" | "refund";
  qty: number;
  created_at: string;
  /** 利用行だけ: そのうち購入ぶんだった枚数（インセンティブの対象枚数） */
  paid_qty?: number | null;
};

/**
 * これから使う need 枚のうち、**購入したチケット**が何枚含まれるか。
 *
 * ★ 引き当ては古い順（先入先出）
 *   どれから減るかを決めないと、同じ状況でインセンティブが出たり出なかったりする。
 *   古い順なら「先にもらったもの・先に買ったものから使う」で、お客様にもそう説明できる。
 *
 * ★ 無料付与（kind='grant'）は対象外
 *   入会キャンペーンや紹介特典で配ったぶんは店に入金が無いので、
 *   使われても担当へのインセンティブは出さない（2026-10-01 ユーザー決定）。
 *
 * @param ledger その会員の有効な台帳（status='granted'）。並び順は問わない
 * @param need   これから使う枚数
 */
export function paidQtyForUse(ledger: TicketLedgerRow[], need: number): number {
  const want = Math.max(0, Math.floor(Number(need) || 0));
  if (want === 0) return 0;

  // 増えた順に1枚ずつ並べる（購入かどうかの札を付けて）
  const queue: boolean[] = []; // true = 購入ぶん
  const plus = ledger
    .filter((r) => (r.kind === "grant" || r.kind === "purchase") && Number(r.qty) > 0)
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const r of plus) {
    for (let i = 0; i < Number(r.qty); i++) queue.push(r.kind === "purchase");
  }

  // すでに使った枚数ぶんは先に消えている
  const alreadyUsed = ledger
    .filter((r) => r.kind === "use")
    .reduce((n, r) => n + Math.abs(Number(r.qty) || 0), 0);

  let paid = 0;
  for (let i = alreadyUsed; i < alreadyUsed + want && i < queue.length; i++) {
    if (queue[i]) paid += 1;
  }
  return paid;
}
