import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank, FRANK_STORE_ID } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { NameFields } from "@/components/name-fields";
import { AddressFields } from "@/components/address-fields";
import { BirthDateInput } from "@/components/birth-date-input";
import { FRUNK_STATUS_LABEL, FRUNK_STATUS_TONE, FRUNK_PAYMENT_METHODS, FRUNK_PAYMENT_LABEL, yen } from "@/lib/frunk";
import { OCCUPATIONS, CONTACT_METHODS, GENDER_LABEL, GENDERS } from "@/lib/walkin";
import { jstYmd } from "@/lib/jst";
import { BOOKING_STATUS_LABEL, CUSTOMER_KIND_LABEL, PAYMENT_STATUS_LABEL, outstanding } from "@yozan/core/frank-booking";
import {
  leaveDateOptions,
  suspendStartOptions,
  monthEndLabel,
  monthFromLabel,
  leaveApplyDeadline,
  suspendApplyDeadline,
  mdLabel,
} from "@yozan/core/frank-membership";
import { corporateSpec, corporateSeats, memberDisplayName, openSlots, slotUsageLabel } from "@yozan/core/frank-corporate";
import { ticketBalance, listTickets, ticketRowLabel } from "@yozan/core/frank-lesson-tickets";
import { loadMemberSales, saleLabel } from "@/lib/frank-receipt";
import {
  setMemberStatus,
  changePlan,
  cancelScheduledChange,
  stopSquareBilling,
  addCorporateUser,
  removeCorporateUser,
  resendApprovalMail,
  saveAlertNote,
  updateMemberProfile,
  receiveTicketPaid,
  grantTicketsManual,
  useTicketManual,
  openJoinCheckout,
} from "../actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * FRANK GOLF 会員カード（#139・2026-08-18）
 *
 * ★ 1人ぶんを「これ1枚で分かる」ようにする画面。
 *   店頭で聞かれるのは たいてい この4つ:
 *     ①いまのプランと月会費 ②月会費が止まっていないか（Square） ③予約の履歴 ④注意事項
 *   一覧に戻らずここで 休会/復帰/退会・プラン変更・連絡先の修正まで完結させる。
 *
 * ★ 操作系は /frunk のサーバーアクションを共用する（同じ処理を2つ書かない）。
 *   hidden の back=/frunk/<id> を付けると、実行後この画面に戻ってメッセージが出る。
 */

const LESSON_OS_URL = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";

function taxIncluded(n: unknown): string {
  const v = Number(n ?? 0);
  return v > 0 ? `${yen(Math.round(v * 1.1))}（税込）` : "—";
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-(--color-line)/60 py-1.5 text-sm last:border-0">
      <span className="w-28 shrink-0 text-xs text-(--color-dim)">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

export default async function FrunkMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; msg?: string; paid?: string }>;
}) {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) notFound(); // 店舗またぎ廃止（#134）
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) notFound();

  // 来店（#154 のチェックイン台帳）。予約の有無に関わらず「実際に来た日」が1日1行で入る。
  const adminVisits = createAdmin();
  const todayYmd = jstYmd();
  const monthStart = `${todayYmd.slice(0, 7)}-01`;
  const [{ data: visitRows }, { count: visitTotal }, { count: visitThisMonth }] = await Promise.all([
    adminVisits.from("frunk_checkins")
      .select("id, visited_on, checked_in_at, checked_out_at, source, frunk_bays(name)")
      .eq("member_id", id).is("deleted_at", null)
      .order("visited_on", { ascending: false }).limit(12),
    adminVisits.from("frunk_checkins").select("id", { count: "exact", head: true })
      .eq("member_id", id).is("deleted_at", null),
    adminVisits.from("frunk_checkins").select("id", { count: "exact", head: true })
      .eq("member_id", id).gte("visited_on", monthStart).is("deleted_at", null),
  ]);
  const visits = (visitRows ?? []) as Array<Record<string, unknown>>;
  const lastVisit = visits[0] ? String(visits[0].visited_on) : null;
  const daysSinceVisit = lastVisit
    ? Math.round(
        (Date.UTC(+todayYmd.slice(0, 4), +todayYmd.slice(5, 7) - 1, +todayYmd.slice(8, 10)) -
          Date.UTC(+lastVisit.slice(0, 4), +lastVisit.slice(5, 7) - 1, +lastVisit.slice(8, 10))) / 86400000,
      )
    : null;

  const admin = createAdmin();
  const { data: member } = await admin
    .from("frunk_members")
    .select("*, frunk_plans(id, name, monthly_price, joining_fee, max_bookings_per_day, max_bookings_per_week, is_corporate, max_users, max_open_slots, companion_free)")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID) // 店舗スコープ（#134）
    .is("deleted_at", null)
    .maybeSingle();
  if (!member) notFound();

  const m = member as Row;
  const plan = (m.frunk_plans ?? null) as Row | null;
  const memberNo = m.member_no ? String(m.member_no) : "";

  const [{ data: plans }, { data: bookings }, { data: student }] = await Promise.all([
    admin
      .from("frunk_plans")
      .select("id, name, monthly_price, active")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("sort_order"),
    admin
      .from("frunk_bookings")
      .select("id, booked_date, start_time, end_time, status, customer_kind, amount, paid_amount, payment_status, frunk_bays(name)")
      .eq("company_id", actor.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .eq("member_id", id)
      .is("deleted_at", null)
      .order("booked_date", { ascending: false })
      .limit(50),
    // レッスンカルテ（Lesson OS）。会員番号で紐づく（#129）
    memberNo
      ? admin
          .from("lsn_students")
          .select("id, lsn_share_tokens(token, revoked_at)")
          .eq("company_id", actor.companyId)
          .eq("member_code", memberNo)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const planList = (plans ?? []) as Row[];
  const bookingList = (bookings ?? []) as Row[];
  const today = jstYmd();

  // 法人プラン（#195）。利用者の行から開いたときは契約者をたどる
  const corpSpec = corporateSpec(plan as never);
  const corpParentId = m.corporate_parent_id ? String(m.corporate_parent_id) : "";
  const corpRootId = corpParentId || id;
  const { data: corpRows } = corpSpec.isCorporate
    ? await admin
        .from("frunk_members")
        .select("id, name, member_no, phone, status")
        .eq("company_id", actor.companyId)
        .eq("corporate_parent_id", corpRootId)
        .is("deleted_at", null)
        .order("member_no")
    : { data: [] };
  const corpUsers = (corpRows ?? []).filter((u) => String((u as Row).status) !== "left") as Row[];
  // 人数は「ご利用者＋ご担当者ご自身（corporate_self_use）」で数える（#206）。
  // 上限は max_users。法人プレミアムは null = 無制限
  const corpSelfUse = !!m.corporate_self_use;
  const corpSeats = corporateSeats({
    maxUsers: corpSpec.maxUsers,
    registered: corpUsers.length,
    selfUse: corpSelfUse,
  });

  // 御社名義で今いくつ押さえているか（#206）。
  // 法人は登録者全員で枠を分け合うので、店頭で「取れません」と言う前にここを見る
  let corpUsage: { used: number; label: ReturnType<typeof slotUsageLabel> } | null = null;
  if (corpSpec.isCorporate) {
    const holderIds = [corpRootId, ...corpUsers.map((u) => String(u.id))];
    const { data: openRows } = await admin
      .from("frunk_bookings")
      .select("booked_date, start_time, end_time, status")
      .in("member_id", holderIds)
      .gte("booked_date", today)
      .neq("status", "cancelled")
      .is("deleted_at", null);
    const hm = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
    const nowHm = new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16);
    const usedSlots = openSlots(
      (openRows ?? []).map((b) => ({
        date: String(b.booked_date),
        endTime: String(b.end_time),
        minutes: hm(String(b.end_time)) - hm(String(b.start_time)),
        status: String(b.status ?? ""),
      })),
      today, nowHm,
    );
    corpUsage = { used: usedSlots, label: slotUsageLabel({ used: usedSlots, limit: corpSpec.maxOpenSlots, corporate: true }) };
  }

  // 退会・休会の受付ルール（#192）。選択肢の生成も検証もサーバーアクションと同じ関数を通す
  const leaveOpts = leaveDateOptions(today);
  const suspendOpts = suspendStartOptions(today);
  const scheduledLeave = m.scheduled_leave_date ? String(m.scheduled_leave_date) : "";
  const scheduledSuspend = m.scheduled_suspend_start ? String(m.scheduled_suspend_start) : "";

  const live = bookingList.filter((b) => b.status !== "cancelled");
  const visited = bookingList.filter((b) => b.status === "visited").length;
  const noShow = bookingList.filter((b) => b.status === "no_show").length;
  const upcoming = live.filter((b) => String(b.booked_date) >= today);
  const unpaid = bookingList
    .map((b) => outstanding(b.amount as number | null, b.paid_amount as number | null, String(b.payment_status)))
    .reduce((s, v) => s + v, 0);

  const shareToken = (() => {
    const st = (student ?? null) as unknown as Row | null;
    const tokens = (st?.lsn_share_tokens ?? []) as Array<{ token: string; revoked_at: string | null }>;
    const live0 = tokens.find((t) => !t.revoked_at);
    return live0?.token ?? null;
  })();

  // レッスンチケット（#199）。残枚数は台帳の合計＝画面と履歴が食い違わない
  const [ticketCount, ticketRows] = await Promise.all([
    ticketBalance(admin, id),
    listTickets(admin, id, 20),
  ]);
  const ticketPending = ticketRows.filter((t) => t.status === "pending_payment");

  // 領収書（#222）。金額はここで読んだ入金の行からしか作れない（人が打ち込む欄は無い）
  const sales = await loadMemberSales(id, actor.companyId);

  const status = String(m.status ?? "");
  const inMinTerm = m.min_term_until != null && String(m.min_term_until) > today;
  const back = `/frunk/${id}`;

  return (
    <div className="space-y-4">
      <p className="reveal text-sm">
        <Link href="/frunk" className="text-(--color-dim) underline hover:text-(--color-txt)">
          ← 会員一覧へ戻る
        </Link>
      </p>

      <header className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 法人の方は「会社名＋お名前」（#206） */}
            <h1 className="text-2xl font-bold tracking-tight">{memberDisplayName(m as never) || "（氏名未入力）"}</h1>
            {m.name_kana ? <span className="text-sm text-(--color-dim)">{String(m.name_kana)}</span> : null}
            <Badge tone={FRUNK_STATUS_TONE[status] ?? "default"}>{FRUNK_STATUS_LABEL[status] ?? status}</Badge>
            {scheduledLeave ? <Badge tone="warn">{monthEndLabel(scheduledLeave)}で退会予定</Badge> : null}
            {scheduledSuspend ? <Badge tone="warn">{monthFromLabel(scheduledSuspend)}休会予定</Badge> : null}
            {inMinTerm ? <Badge tone="warn">継続期間 {String(m.min_term_until)}まで</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-(--color-dim)">
            {memberNo || "会員番号 未発行"}　{plan?.name ? String(plan.name) : "プラン未設定"}
            {m.join_date ? `　入会 ${String(m.join_date)}` : ""}
            {m.leave_date ? `　退会 ${String(m.leave_date)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* コーチが書く側のカルテ。/m/<会員番号> がカルテIDに解決する（2026-08-22） */}
          {memberNo && (
            <a href={`${LESSON_OS_URL}/m/${encodeURIComponent(String(memberNo))}`} target="_blank" rel="noreferrer" className={btnGhostCls}>
              レッスンカルテ ↗
            </a>
          )}
          {/* 生徒本人に送っているURL（見え方の確認用）。カルテ本体とは別物なのでラベルを分ける */}
          {shareToken && (
            <a href={`${LESSON_OS_URL}/s/${shareToken}`} target="_blank" rel="noreferrer" className={btnGhostCls}>
              生徒の共有ページ ↗
            </a>
          )}
          <Link href={`/reservations?date=${today}`} className={btnGhostCls}>
            予約管理 →
          </Link>
        </div>
      </header>

      {sp.err && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sp.err}</p>}
      {sp.msg && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sp.msg}</p>}
      {/* 後日決済から戻ってきたとき（#217）。反映は入金Webhook待ちなので、その場の見え方まで書く */}
      {sp.paid === "1" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          お支払いのお手続きが終わりました。カードの登録は数十秒で「自動課金 稼働中」に変わります。
          変わらないときは、この画面を開き直すか、入会申込一覧の「Squareで入金を確認」をお使いください。
        </p>
      )}

      {/* 重要説明事項（カレンダーの⚠と同じもの） */}
      <Panel title="重要説明事項（入力するとカレンダーの予約に⚠が付きます）" className="d1">
        <form action={saveAlertNote} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          <span className={`text-lg ${m.alert_note ? "" : "opacity-30"}`}>⚠</span>
          <input
            name="alert_note"
            defaultValue={String(m.alert_note ?? "")}
            placeholder="例: 左打ち・腰痛のため強度注意・未収あり"
            className={`${inputCls} min-w-56 flex-1`}
          />
          <button className={btnCls}>保存</button>
        </form>
      </Panel>

      {/* レッスンチケット（#199）。お支払い待ちはここで受領する。
          #221: 一覧の🎫からここへ飛べるよう id を付けた（「付与がどこにあるか分からない」への対応） */}
      <Panel id="tickets" title={`🎫 レッスンチケット（付与・購入受付）　残り ${ticketCount} 枚`} className="d1">
        {ticketPending.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-800">店頭でのお支払い待ち</p>
            <p className="mt-0.5 text-xs text-amber-700">
              受け取ってから【受領】を押してください。押すまでお客様の残枚数には入りません。
            </p>
            <div className="mt-2 space-y-2">
              {ticketPending.map((t) => (
                <form key={t.id} action={receiveTicketPaid} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="ticket_id" value={t.id} />
                  <input type="hidden" name="back" value={back} />
                  <span>
                    {String(t.created_at).slice(0, 10)}　{t.qty}枚　
                    {t.amount ? `${t.amount.toLocaleString("ja-JP")}円（税込）` : ""}
                  </span>
                  <button className={btnCls}>受領（お支払い済みにする）</button>
                </form>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <form action={grantTicketsManual} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={back} />
            <Field label="付与する枚数">
              <input name="qty" defaultValue="1" inputMode="numeric" className={`${inputCls} w-20`} />
            </Field>
            <Field label="理由（履歴に残ります）">
              <input name="note" placeholder="例: キャンペーン・お詫び" className={`${inputCls} min-w-48`} />
            </Field>
            <button className={btnGhostCls}>付与する</button>
          </form>
          <form action={useTicketManual} className="flex items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={back} />
            <button className={btnGhostCls} disabled={ticketCount < 1}>
              1枚使う（店頭でレッスン）
            </button>
          </form>
        </div>

        {ticketRows.length === 0 ? (
          <Empty>まだ記録はありません</Empty>
        ) : (
          <ul className="mt-3 divide-y divide-(--color-line) text-sm">
            {ticketRows.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className={t.status === "void" ? "text-(--color-dim) line-through" : ""}>
                  {String(t.created_at).slice(0, 10)}　{ticketRowLabel(t)}
                  {t.note ? <span className="ml-2 text-xs text-(--color-dim)">{t.note}</span> : null}
                </span>
                <span className={`shrink-0 font-semibold ${t.status === "void" ? "text-(--color-dim) line-through" : t.qty > 0 ? "text-emerald-600" : ""}`}>
                  {t.qty > 0 ? `＋${t.qty}` : t.qty}枚
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 会員情報 */}
        <Panel title="会員情報" className="d1">
          <Info label="会員番号">{memberNo || "—"}</Info>
          <Info label="お名前">
            {memberDisplayName(m as never) || "—"}
            {m.name_kana ? <span className="ml-2 text-xs text-(--color-dim)">{String(m.name_kana)}</span> : null}
          </Info>
          <Info label="生年月日">{m.birth_date ? String(m.birth_date) : "—"}</Info>
          <Info label="性別">{m.gender ? (GENDER_LABEL[String(m.gender)] ?? String(m.gender)) : "—"}</Info>
          <Info label="電話">
            {m.phone ? (
              <a href={`tel:${String(m.phone)}`} className="text-indigo-600 underline">
                {String(m.phone)}
              </a>
            ) : (
              "—"
            )}
          </Info>
          <Info label="メール">{m.email ? String(m.email) : "—"}</Info>
          <Info label="住所">
            {[m.postal_code ? `〒${String(m.postal_code)}` : "", m.address1 ? String(m.address1) : ""]
              .filter(Boolean)
              .join(" ") || "—"}
          </Info>
          <Info label="ご職業">{m.occupation ? String(m.occupation) : "—"}</Info>
          <Info label="連絡方法">{m.contact_method ? String(m.contact_method) : "—"}</Info>
          <Info label="支払方法">{m.payment_method ? (FRUNK_PAYMENT_LABEL[String(m.payment_method)] ?? String(m.payment_method)) : "—"}</Info>
          <Info label="スタッフメモ">{m.note ? String(m.note) : "—"}</Info>
        </Panel>

        {/* プラン・請求 */}
        <Panel title="プラン・請求" className="d2">
          <Info label="プラン">{plan?.name ? String(plan.name) : "—"}</Info>
          <Info label="月会費">{taxIncluded(plan?.monthly_price)}</Info>
          <Info label="入会金">
            {m.joining_fee_waived ? "無料（キャンペーン）" : taxIncluded(plan?.joining_fee)}
            {m.joining_fee_charged_at ? <span className="ml-2 text-xs text-(--color-dim)">請求済</span> : null}
          </Info>
          <Info label="予約上限">
            {[
              plan?.max_bookings_per_day != null ? `1日 ${String(plan.max_bookings_per_day)}件` : null,
              plan?.max_bookings_per_week != null ? `週 ${String(plan.max_bookings_per_week)}件` : null,
            ]
              .filter(Boolean)
              .join("・") || "制限なし"}
          </Info>
          <Info label="自動課金">
            {m.square_subscription_id ? (
              <>
                <Badge tone={status === "suspended" ? "warn" : "ok"}>
                  {status === "suspended" ? "一時停止中（休会）" : "稼働中"}
                </Badge>
                <span className="ml-2 text-xs text-(--color-dim)">Square サブスクリプション</span>
                {/* 退会もプラン変更もせず「引き落としだけ止めたい」ときの出口（#192）。
                    0円プランに切り替えたのにサブスクだけ残っている、という状態を画面から潰せるようにする。 */}
                <form action={stopSquareBilling} className="mt-1">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <button className="text-xs text-(--color-dim) underline hover:text-rose-600">
                    自動課金を解約する
                  </button>
                </form>
              </>
            ) : (
              <>
                <Badge tone="default">未登録（店頭払い）</Badge>
                {/* 後日決済（#217）。カードを持ってきていない方は、その場では登録できない。
                    後日ご来店のときに **この会員の行に紐づいた決済ページ** をこのiPadで開く。
                    HPの入会フォームからやり直すと申込が二重になるので、入口をここに置く。 */}
                <form action={openJoinCheckout} className="mt-1">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <button className={btnGhostCls}>💳 このiPadで決済ページを開く（後日決済）</button>
                </form>
                <p className="mt-1 text-xs text-(--color-dim)">
                  お客様にこのiPadをお渡しして、カード情報をご入力いただきます。
                  終わるとこの画面に戻ります（入金の反映まで数十秒かかることがあります）。
                </p>
              </>
            )}
          </Info>
          <Info label="キャンペーン">
            {m.join_campaign ? String(m.join_campaign) : "—"}
            {inMinTerm ? <span className="ml-2 text-amber-700">6か月継続 {String(m.min_term_until)}まで</span> : null}
          </Info>

          <div className="mt-3 space-y-2 border-t border-(--color-line) pt-3">
            {status === "active" && planList.length > 1 && (
              <form action={changePlan} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="back" value={back} />
                <select name="plan_id" defaultValue="" className={`${inputCls} !w-auto`}>
                  <option value="" disabled>
                    プランを変更…
                  </option>
                  {/* 0円プラン（スタッフ・モニター）もここに出す。以前は monthly_price>0 で弾いていたため、
                      作って保存したのに変更先に出てこなかった（2026-09-01 ユーザー指摘・#192）。 */}
                  {planList
                    .filter((p) => p.active !== false && p.id !== m.plan_id)
                    .map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {String(p.name)}（{Number(p.monthly_price ?? 0) > 0 ? yen(p.monthly_price as number | null) : "月会費なし"}）
                      </option>
                    ))}
                </select>
                <button className={btnGhostCls}>変更する</button>
                <span className="text-xs text-(--color-dim)">
                  当月は週割の差額をカードに請求／翌月から新プラン
                </span>
              </form>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {memberNo && m.email ? (
                <form action={resendApprovalMail}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <button className={btnGhostCls} title={`会員番号とカード登録の案内を ${String(m.email)} へ送り直します`}>
                    会員番号メール再送
                  </button>
                </form>
              ) : null}
              {status === "suspended" && (
                <form action={setMemberStatus}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="to" value="active" />
                  <button className={btnCls}>復帰させる</button>
                </form>
              )}
            </div>

            {/* 退会・休会は「いつから」を選んで受け付ける（#192・2026-09-01 ユーザー確定）
                退会=月末・申し出の翌月末から／休会=月初・10日までなら翌月から。
                受付と同時に Square の自動課金も同じ日付で止める。 */}
            {status !== "left" && (
              <div className="mt-3 space-y-2 border-t border-(--color-line) pt-3">
                {scheduledLeave ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-rose-700">{monthEndLabel(scheduledLeave)}で退会予定</span>
                    <span className="text-xs text-(--color-dim)">その日までは通常どおりご利用いただけます</span>
                    <form action={cancelScheduledChange}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="kind" value="leave" />
                      <button className={btnGhostCls}>退会予約を取り消す</button>
                    </form>
                  </div>
                ) : scheduledSuspend ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-amber-800">{monthFromLabel(scheduledSuspend)}休会予定</span>
                    <span className="text-xs text-(--color-dim)">休会費 2,200円（税込）は店頭で申し受けます</span>
                    <form action={cancelScheduledChange}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="kind" value="suspend" />
                      <button className={btnGhostCls}>休会予約を取り消す</button>
                    </form>
                  </div>
                ) : (
                  <>
                    {status !== "suspended" && (
                      <form action={setMemberStatus} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="to" value="suspended" />
                        <span className="text-sm">休会</span>
                        <select name="suspend_start" defaultValue={suspendOpts[0]} className={`${inputCls} !w-auto`}>
                          {suspendOpts.map((d) => (
                            <option key={d} value={d}>
                              {monthFromLabel(d)}
                            </option>
                          ))}
                        </select>
                        <button className={btnGhostCls}>休会を受け付ける</button>
                        <span className="text-xs text-(--color-dim)">
                          10日までの申し出で翌月から（{monthFromLabel(suspendOpts[0])}なら {mdLabel(suspendApplyDeadline(suspendOpts[0]))}まで）
                        </span>
                      </form>
                    )}
                    <form action={setMemberStatus} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="to" value="left" />
                      <span className="text-sm">退会</span>
                      <select name="leave_date" defaultValue={leaveOpts[0]} className={`${inputCls} !w-auto`}>
                        {leaveOpts.map((d) => (
                          <option key={d} value={d}>
                            {monthEndLabel(d)}
                          </option>
                        ))}
                      </select>
                      <button className="rounded-lg border border-(--color-line) px-3 py-2 text-sm text-(--color-dim) hover:text-rose-600">
                        退会を受け付ける
                      </button>
                      <span className="text-xs text-(--color-dim)">
                        退会は月末・申し出の翌月末から（{monthEndLabel(leaveOpts[0])}なら {mdLabel(leaveApplyDeadline(leaveOpts[0]))}まで）
                      </span>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* 領収書（#222）。5万円以上でも電子交付なら収入印紙が要らない＝紙で出さない */}
      <Panel id="receipt" title="🧾 領収書（月会費・入会金）" className="d2">
        {sales.length === 0 ? (
          <p className="text-sm text-(--color-dim)">
            カードでの入金がまだ記録されていません。現金・振込でお受けした分はここには出ません。
          </p>
        ) : (
          <form action={`/frunk/${id}/receipt`} method="get" target="_blank" className="space-y-3">
            <div className="space-y-1.5">
              {sales.map((sale, i) => (
                <label
                  key={sale.id}
                  className="flex items-center gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm"
                >
                  <input type="checkbox" name="sale" value={sale.id} defaultChecked={i === 0} />
                  <span className="tabular-nums text-(--color-dim)">{sale.sold_on.replaceAll("-", "/")}</span>
                  <span className="flex-1">{saleLabel(sale, plan?.name ? String(plan.name) : null)}</span>
                  <span className="font-semibold tabular-nums">{yen(sale.amount_inc_tax)}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="宛名（空欄ならお名前）">
                <input
                  name="to_name"
                  placeholder={`${String(m.company_name || m.name || "")} 様`}
                  className={inputCls}
                  maxLength={80}
                />
              </Field>
              <Field label="但し書き（空欄なら「月会費として」）">
                <input name="note" placeholder="月会費として" className={inputCls} maxLength={80} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className={btnCls}>領収書を開く（PDF）</button>
              <span className="text-xs text-(--color-dim)">
                新しいタブで開きます。そのままお見せする・保存する・印刷する、のどれでもお使いいただけます。
                電子交付のため収入印紙は不要です。
              </span>
            </div>
          </form>
        )}
      </Panel>

      {/* ===== 法人プラン（#195） =====
          契約者の会員カードにご利用者を並べる。人は入れ替わるので、店頭で足したり外したりできる。
          月会費のサブスクを持つのは契約者だけなので、ここで人を足しても請求は増えない。 */}
      {corpSpec.isCorporate && (
        <Panel
          title={`法人プラン　${m.company_name ? String(m.company_name) : "（会社名未登録）"}　ご利用者 ${
            corpSeats.limit === null ? `${corpSeats.used}名（人数制限なし）` : `${corpSeats.used}/${corpSeats.limit}名`
          }`}
          className="d2"
        >
          {corpParentId ? (
            <div className="space-y-2 text-sm">
              <p>
                この方は法人プランの<span className="font-semibold">ご利用者</span>です。ご契約・お支払い・ご利用者の入れ替えは契約者の会員カードで行います。
              </p>
              <Link href={`/frunk/${corpParentId}`} className="text-indigo-600 underline">
                契約者の会員カードを開く →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-1 text-sm sm:grid-cols-2">
                <Info label="会社名">{m.company_name ? String(m.company_name) : "—"}</Info>
                <Info label="ご担当者">
                  {String(m.name ?? "")}
                  <span className={corpSelfUse ? "ml-2 text-emerald-700" : "ml-2 text-(--color-dim)"}>
                    {corpSelfUse ? "（ご自身もご利用者として登録済み）" : "（お支払いのみ・この番号では予約できません）"}
                  </span>
                </Info>
                <Info label="請求先メール">{m.billing_email ? String(m.billing_email) : `${m.email ? String(m.email) : "—"}（ご担当者）`}</Info>
                <Info label="請求先住所">
                  {[m.billing_postal_code, m.billing_address1].filter(Boolean).join(" ") || "—（ご担当者の住所へ）"}
                </Info>
                <Info label="打席のご予約">
                  {corpUsage ? (
                    <>
                      <span className={corpUsage.label.full ? "font-semibold text-amber-700" : "font-semibold"}>
                        いま {corpUsage.used}／{corpSpec.maxOpenSlots} コマ
                      </span>
                      <span className="ml-2 text-xs text-(--color-dim)">{corpUsage.label.detail}</span>
                    </>
                  ) : (
                    <>御社合計 {corpSpec.maxOpenSlots} コマ（1コマ＝1時間）まで先にお取りいただけます</>
                  )}
                </Info>
                <Info label="同伴ビジター">{corpSpec.companionFree ? "無料（回数制限なし）" : "同伴の無料枠はありません"}</Info>
              </div>

              <div className="space-y-2 border-t border-(--color-line) pt-3">
                {corpUsers.length === 0 && <Empty>ご利用者がまだ登録されていません。下のフォームから追加してください。</Empty>}
                {corpUsers.map((u) => (
                  <div key={String(u.id)} className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm">
                    <Link href={`/frunk/${String(u.id)}`} className="font-semibold text-indigo-600 underline">
                      {String(u.name)}
                    </Link>
                    <Badge tone="accent">{u.member_no ? String(u.member_no) : "会員番号未発行"}</Badge>
                    <span className="text-xs text-(--color-dim)">{u.phone ? String(u.phone) : ""}</span>
                    <form action={removeCorporateUser} className="ml-auto">
                      <input type="hidden" name="user_id" value={String(u.id)} />
                      <input type="hidden" name="back" value={back} />
                      <button className="text-xs text-(--color-dim) underline hover:text-rose-600">登録を外す</button>
                    </form>
                  </div>
                ))}
              </div>

              {corpSeats.canAdd ? (
                <form action={addCorporateUser} className="grid grid-cols-2 items-end gap-2 border-t border-(--color-line) pt-3 sm:grid-cols-5">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <Field label="お名前"><input name="cu_name" placeholder="山田 太郎" className={`${inputCls} !py-1.5`} /></Field>
                  <Field label="フリガナ"><input name="cu_kana" placeholder="ヤマダ タロウ" className={`${inputCls} !py-1.5`} /></Field>
                  <Field label="電話番号"><input name="cu_phone" inputMode="tel" placeholder="090-1234-5678" className={`${inputCls} !py-1.5`} /></Field>
                  <Field label="メール"><input name="cu_email" type="email" className={`${inputCls} !py-1.5`} /></Field>
                  <button className={btnCls}>＋ ご利用者を追加</button>
                  <p className="col-span-2 text-xs text-(--color-dim) sm:col-span-5">
                    追加すると会員番号を発行します。ログインは会員番号とご本人の電話番号の下4桁です（番号はおひとりずつ違うものをご登録ください）。
                    ご契約者様ご自身も、会員ページの【ご利用者の管理】から追加・入れ替えができます（#206）。
                  </p>
                </form>
              ) : (
                <p className="border-t border-(--color-line) pt-3 text-xs text-(--color-dim)">
                  ご登録上限（{corpSeats.limit}名・ご担当者ご自身を含む）です。入れ替えるときは、先に外す方の【登録を外す】を押してください。
                </p>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* 予約・来店 */}
      <Panel
        title={`予約・来店　直近${bookingList.length}件（来店 ${visited}・無断欠 ${noShow}・今後 ${upcoming.length}）${
          unpaid > 0 ? `　未収 ${yen(unpaid)}` : ""
        }`}
        className="d2"
      >
        {bookingList.length === 0 ? (
          <Empty>この会員の予約はまだありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="px-2 py-2 font-medium">日付</th>
                  <th className="px-2 py-2 font-medium">時間</th>
                  <th className="px-2 py-2 font-medium">打席</th>
                  <th className="px-2 py-2 font-medium">区分</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">会計</th>
                </tr>
              </thead>
              <tbody>
                {bookingList.map((b) => {
                  const out = outstanding(b.amount as number | null, b.paid_amount as number | null, String(b.payment_status));
                  const bay = (b.frunk_bays ?? null) as { name?: string } | null;
                  return (
                    <tr key={String(b.id)} className="border-b border-(--color-line)/60">
                      <td className="px-2 py-1.5 tabular-nums">
                        <Link href={`/dashboard?date=${String(b.booked_date)}&view=day&step=30&sel=${String(b.id)}`} className="text-indigo-600 underline">
                          {String(b.booked_date)}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-(--color-dim)">
                        {String(b.start_time).slice(0, 5)}〜{String(b.end_time).slice(0, 5)}
                      </td>
                      <td className="px-2 py-1.5 text-(--color-dim)">{bay?.name ?? "—"}</td>
                      <td className="px-2 py-1.5 text-(--color-dim)">
                        {CUSTOMER_KIND_LABEL[String(b.customer_kind)] ?? String(b.customer_kind)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge
                          tone={
                            b.status === "visited" ? "ok" : b.status === "no_show" ? "danger" : b.status === "cancelled" ? "default" : "accent"
                          }
                        >
                          {BOOKING_STATUS_LABEL[String(b.status)] ?? String(b.status)}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-(--color-dim)">
                        {b.amount != null ? `${yen(b.amount as number)}／${PAYMENT_STATUS_LABEL[String(b.payment_status)]}` : "—"}
                        {out > 0 ? <span className="ml-1 font-semibold text-rose-600">未収 {yen(out)}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 来店（#154） */}
      <Panel title="来店" className="d3">
        <div className="mb-3 flex flex-wrap gap-6 text-sm">
          <span>
            <span className="text-xs text-(--color-dim)">今月</span>{" "}
            <strong className="text-lg tabular-nums">{visitThisMonth ?? 0}</strong> 回
          </span>
          <span>
            <span className="text-xs text-(--color-dim)">通算</span>{" "}
            <strong className="text-lg tabular-nums">{visitTotal ?? 0}</strong> 回
          </span>
          <span>
            <span className="text-xs text-(--color-dim)">前回</span>{" "}
            {lastVisit ? (
              <>
                <strong className="tabular-nums">{lastVisit}</strong>
                {daysSinceVisit != null && daysSinceVisit >= 14 ? (
                  // 来店が空いている人は退会予兆。声かけの材料としてここで目立たせる
                  <span className="ml-1 font-semibold text-amber-700">（{daysSinceVisit}日前）</span>
                ) : daysSinceVisit != null ? (
                  <span className="ml-1 text-(--color-dim)">（{daysSinceVisit}日前）</span>
                ) : null}
              </>
            ) : (
              <span className="text-(--color-dim)">記録なし</span>
            )}
          </span>
        </div>
        {visits.length === 0 ? (
          <Empty>チェックインの記録はまだありません（QRチェックインの開始前に来店した分は含まれません）</Empty>
        ) : (
          <div className="space-y-1">
            {visits.map((v) => {
              const bay = (v.frunk_bays ?? null) as { name?: string } | null;
              const at = String(v.checked_in_at ?? "");
              const hhmm = at ? new Date(at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }) : "";
              return (
                <div key={String(v.id)} className="flex items-center justify-between border-b border-(--color-line)/60 py-1.5 text-sm last:border-0">
                  <span className="tabular-nums">{String(v.visited_on)} <span className="text-xs text-(--color-dim)">{hhmm}</span></span>
                  <span className="text-xs text-(--color-dim)">
                    {bay?.name ?? "打席なし"}
                    {v.source === "manual" ? " ・手動" : v.source === "bay" ? " ・打席QR" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* 編集 */}
      <Panel title="会員情報を修正する" className="d3">
        <form action={updateMemberProfile} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={id} />
          <NameFields
            inputClassName={inputCls}
            labelClassName="mb-1 block text-xs text-(--color-dim)"
            defaults={{ name: m.name as string | null, name_kana: m.name_kana as string | null }}
            required={false}
          />
          <BirthDateInput
            defaultValue={m.birth_date as string | null}
            inputClassName={inputCls}
            labelClassName="mb-1 block text-xs text-(--color-dim)"
          />
          <Field label="性別">
            <select name="gender" defaultValue={m.gender ? String(m.gender) : ""} className={inputCls}>
              <option value="">—</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="電話">
            <input name="phone" defaultValue={String(m.phone ?? "")} className={inputCls} />
          </Field>
          <Field label="メール">
            <input name="email" type="email" defaultValue={String(m.email ?? "")} className={inputCls} />
          </Field>
          <AddressFields
            inputClassName={inputCls}
            labelClassName="mb-1 block text-xs text-(--color-dim)"
            defaults={{
              postal_code: (m.postal_code as string | null) ?? "",
              address1: (m.address1 as string | null) ?? "",
            }}
            showBuilding={false}
          />
          <Field label="ご職業">
            <select name="occupation" defaultValue={m.occupation ? String(m.occupation) : ""} className={inputCls}>
              <option value="">—</option>
              {OCCUPATIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="連絡方法">
            <select name="contact_method" defaultValue={m.contact_method ? String(m.contact_method) : ""} className={inputCls}>
              <option value="">—</option>
              {CONTACT_METHODS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="支払方法">
            <select name="payment_method" defaultValue={m.payment_method ? String(m.payment_method) : ""} className={inputCls}>
              <option value="">—</option>
              {FRUNK_PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="スタッフメモ（お客様には見えません）">
              <input name="note" defaultValue={String(m.note ?? "")} className={inputCls} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <button className={btnCls}>保存する</button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
