import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank, FRANK_STORE_ID } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { ticketBalances } from "@yozan/core/frank-lesson-tickets";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { FRUNK_STATUS_LABEL, FRUNK_STATUS_TONE, FRUNK_PAYMENT_LABEL, yen } from "@/lib/frunk";
import {
  filterMembers,
  sortMembers,
  countByStatus,
  type FrunkMemberLike,
  type MemberSort,
} from "@/lib/frunk-member-search";
import { jstYmd } from "@/lib/jst";
import { monthEndLabel, monthFromLabel } from "@yozan/core/frank-membership";
import { createPlan, updatePlan, approveSignup, rejectSignup, issueSignupToken, checkJoinPayment, confirmJoinPayment, openJoinCheckout } from "./actions";
import { joinPaymentView } from "@/lib/frunk-join-view";
import { memberDisplayName } from "@yozan/core/frank-corporate";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * FRANK GOLF 姫路 — 会員管理（#139・2026-08-18 作り直し）
 *
 * ★ これまでは「承認待ち」と「全会員をベタ並べ」だけで、探す手段が無かった。
 *   会員が増えると目で探すことになり、店頭でお客様を待たせる。
 *   一覧＝探す/絞る、詳細＝1人ぶんを深く見る、に画面を分けた。
 *
 * ★ 当たり判定は lib/frunk-member-search.ts（純関数・テスト済み）に集約する。
 *   ここでSQLのilikeを書き足すと、画面ごとに検索の当たり方がズレる。
 *   会員は多くても数百人なので、まとめて取ってからアプリ側で絞る（表記ゆれを吸収できる）。
 */

const STATUS_TABS = ["active", "suspended", "left", "pending", "rejected"] as const;

const SORTS: Array<{ value: MemberSort; label: string }> = [
  { value: "member_no", label: "会員番号順" },
  { value: "name_kana", label: "カナ順" },
  { value: "join_date_desc", label: "入会日が新しい順" },
  { value: "status", label: "状態順" },
];

export default async function FrunkPage({
  searchParams,
}: {
  searchParams: Promise<{
    signup_url?: string;
    err?: string;
    msg?: string;
    q?: string;
    status?: string;
    plan?: string;
    sort?: string;
  }>;
}) {
  const actor = await requireReceptionActor();
  // 店舗またぎ廃止（#134）: FRANK姫路に配属されていない人には存在ごと見せない
  if (!canAccessFrank(actor)) notFound();
  const admin = createAdmin();
  const sp = await searchParams;

  const [{ data: plans }, { data: members }] = await Promise.all([
    admin.from("frunk_plans").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    // 会員はFRANK姫路の店舗で必ず絞る（#134）
    admin
      .from("frunk_members")
      .select("*")
      .eq("company_id", actor.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const planList = (plans ?? []) as Row[];
  const memberList = (members ?? []) as Row[];
  // チケット残枚数（#221）。一覧に出さないと「誰に何枚あるか」が会員カードを1枚ずつ開くまで分からない
  const ticketMap = await ticketBalances(
    admin,
    memberList.map((m) => String(m.id)),
  );
  const planName = (id: unknown) => planList.find((p) => p.id === id)?.name as string | undefined;

  /**
   * 後日決済（#217）: 在籍しているのに、カードのお支払いがまだ登録されていない方。
   * 月会費が0円のプラン（スタッフ・モニター）は請求が無いので対象にしない。
   * 現金・振込・口座振替でお受けしている方も外す（催促する相手ではない）。
   */
  const payLater = (m: Row) => {
    const plan = planList.find((p) => p.id === (m as Row).plan_id) as { monthly_price?: number | null } | undefined;
    if (!plan || Number(plan.monthly_price ?? 0) <= 0) return false;
    if (["cash", "bank", "sb_payment"].includes(String(m.payment_method ?? ""))) return false;
    return String(m.billing_status ?? "none") !== "active";
  };

  const pending = memberList.filter((m) => m.status === "pending");
  const counts = countByStatus(memberList as unknown as FrunkMemberLike[], [...STATUS_TABS]);

  // ---- 探す・絞る・並べる ----
  const q = (sp.q ?? "").trim();
  const status = STATUS_TABS.includes((sp.status ?? "") as (typeof STATUS_TABS)[number]) || sp.status === "all"
    ? (sp.status as string)
    : "active"; // 既定は在籍だけ（退会者が混ざると店頭で読み違える）
  const planId = planList.some((p) => String(p.id) === sp.plan) ? (sp.plan as string) : "";
  const sort = (SORTS.some((s) => s.value === sp.sort) ? sp.sort : "member_no") as MemberSort;

  const shown = sortMembers(
    filterMembers(memberList as unknown as FrunkMemberLike[], { q, status, planId }),
    sort,
  );
  const today = jstYmd();

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { q, status, plan: planId, sort, ...over };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/frunk?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <header className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FRANK GOLF 姫路 — 会員管理</h1>
          <p className="mt-0.5 text-sm text-(--color-dim)">
            会員を探す・状態を変える・プランを設定する。名前を押すと会員カード（詳細）が開きます。
          </p>
        </div>
        <div className="text-right text-sm">
          <span className="text-(--color-dim)">在籍</span>{" "}
          <span className="text-2xl font-bold tabular-nums text-emerald-600">{counts.active}</span>
          <span className="ml-2 text-xs text-(--color-dim)">
            休会 {counts.suspended} ・ 退会 {counts.left}
          </span>
        </div>
      </header>

      {sp.err && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sp.err}</p>}
      {sp.msg && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sp.msg}</p>}

      {sp.signup_url && (
        <Panel title="入会フォームURL（タブレット/QR掲示・一度だけ表示）" className="d1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-xs text-indigo-600">
              {sp.signup_url}
            </code>
            <a href={sp.signup_url} target="_blank" rel="noreferrer" className={btnCls}>
              入会フォームを開く ↗
            </a>
          </div>
        </Panel>
      )}

      {/* 入会申込（承認待ち）— Web入会は承認レスで自動、ここは店頭iPad入会と救済用（#129） */}
      {pending.length > 0 && (
        <Panel title={`入会申込（承認待ち ${pending.length}件）`} className="d1">
          <div className="space-y-3">
            {pending.map((m) => (
              <div key={String(m.id)} className="rounded-xl border border-(--color-line) bg-(--color-panel-2) p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/frunk/${String(m.id)}`} className="text-base font-semibold text-indigo-600 underline">
                        {memberDisplayName(m as never) || String(m.name)}
                      </Link>
                      {m.name_kana ? <span className="text-xs text-(--color-dim)">{String(m.name_kana)}</span> : null}
                      <Badge tone="accent">{planName(m.plan_id) ?? "プラン未選択"}</Badge>
                      {m.scheduled_leave_date ? (
                        <Badge tone="warn">{monthEndLabel(String(m.scheduled_leave_date))}で退会予定</Badge>
                      ) : null}
                      {m.scheduled_suspend_start ? (
                        <Badge tone="warn">{monthFromLabel(String(m.scheduled_suspend_start))}休会予定</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-(--color-dim)">
                      {[
                        m.phone && String(m.phone),
                        m.email && String(m.email),
                        m.payment_method && FRUNK_PAYMENT_LABEL[String(m.payment_method)],
                        m.start_date && `開始 ${String(m.start_date)}`,
                      ]
                        .filter(Boolean)
                        .join("　")}
                    </div>
                  </div>
                  {m.signature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(m.signature)} alt="署名" className="h-14 rounded-md border border-(--color-line) bg-white" />
                  ) : null}
                </div>

                {/* 決済の状況（#188）— 承認ボタンの手前に必ず出す。
                    「決済していなくても承認できてしまう」ので、押す前に何を見ればいいかまで書く */}
                {(() => {
                  const pay = joinPaymentView(m);
                  const tone =
                    pay.tone === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : pay.tone === "warn"
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-(--color-line) bg-(--color-panel) text-(--color-dim)";
                  return (
                    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${tone}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {pay.tone === "ok" ? "✅" : pay.tone === "warn" ? "⚠" : "・"} 決済: {pay.label}
                        </span>
                        {pay.expected > 0 && <span>請求予定 {yen(pay.expected)}（税込）</span>}
                      </div>
                      {pay.note && <p className="mt-1 leading-relaxed">{pay.note}</p>}
                      <p className="mt-1 leading-relaxed opacity-80">
                        確認のしかた: Square ダッシュボード →「取引」で
                        {m.email ? `「${String(m.email)}」` : "申込日"}
                        を検索すると、同じ決済が出ます。
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <form action={checkJoinPayment}>
                          <input type="hidden" name="id" value={String(m.id)} />
                          <button className={btnGhostCls}>Squareで入金を確認</button>
                        </form>
                        <form action={confirmJoinPayment}>
                          <input type="hidden" name="id" value={String(m.id)} />
                          <button className={btnGhostCls}>入金を確認して入会を確定</button>
                        </form>
                        {/* 後日決済（#217）: カードを持ってきていない方は、後日このiPadでお支払いいただく。
                            HPの入会フォームからやり直させると申込が二重になるので、必ずこの入口を使う */}
                        <form action={openJoinCheckout}>
                          <input type="hidden" name="id" value={String(m.id)} />
                          <button className={btnCls}>💳 このiPadで決済ページを開く</button>
                        </form>
                      </div>
                      <p className="mt-1 opacity-70">
                        「入金を確認して入会を確定」はWeb入会と同じ手順（会員番号・控えPDF・完了メール）で確定します。
                        入金が見つからないときは何も起きません。
                      </p>
                    </div>
                  );
                })()}

                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-(--color-line) pt-3">
                  <form action={approveSignup} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={String(m.id)} />
                    <input type="hidden" name="start_date" value={m.start_date ? String(m.start_date) : ""} />
                    <Field label="会員番号（空欄で自動採番）">
                      <input name="member_no" placeholder="自動: FR0001" className={`${inputCls} !py-1.5`} />
                    </Field>
                    <button className={btnCls}>承認して会員化</button>
                  </form>
                  <form action={rejectSignup}>
                    <input type="hidden" name="id" value={String(m.id)} />
                    <button className={btnGhostCls}>却下</button>
                  </form>
                  <p className="w-full text-xs text-(--color-dim)">
                    「承認して会員化」は決済を確認しません（現金・振込・口座振替でお受けした場合の入口です）。
                    カード決済の方は上の「入金を確認して入会を確定」をお使いください。
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 会員一覧（探す・絞る） */}
      <Panel title={`会員一覧　${shown.length}名 / 全${memberList.length}名`} className="d2">
        <form className="mb-3 flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1">
            <span className="mb-1 block text-xs text-(--color-dim)">
              探す（氏名・カナ・会員番号・電話・メール・メモ）
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="例: 田中 / たなか / FR0001 / 090-1234"
              className={inputCls}
            />
          </label>
          <Field label="状態">
            <select name="status" defaultValue={status} className={`${inputCls} !w-32`}>
              <option value="all">すべて</option>
              {STATUS_TABS.map((s) => (
                <option key={s} value={s}>
                  {FRUNK_STATUS_LABEL[s]}（{counts[s]}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="プラン">
            <select name="plan" defaultValue={planId} className={`${inputCls} !w-40`}>
              <option value="">すべて</option>
              {planList.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="並び順">
            <select name="sort" defaultValue={sort} className={`${inputCls} !w-40`}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <button className={btnCls}>絞り込む</button>
          {(q || planId || status !== "active" || sort !== "member_no") && (
            <Link href="/frunk" className={btnGhostCls}>
              条件をクリア
            </Link>
          )}
        </form>

        {/* 状態のショートカット（押すだけで切り替わる） */}
        <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
          <Link
            href={qs({ status: "all" })}
            className={`rounded-full border px-2.5 py-1 ${status === "all" ? "border-accent bg-accent/10 text-accent" : "border-(--color-line) text-(--color-dim)"}`}
          >
            すべて {memberList.length}
          </Link>
          {STATUS_TABS.map((s) => (
            <Link
              key={s}
              href={qs({ status: s })}
              className={`rounded-full border px-2.5 py-1 ${status === s ? "border-accent bg-accent/10 text-accent" : "border-(--color-line) text-(--color-dim)"}`}
            >
              {FRUNK_STATUS_LABEL[s]} {counts[s]}
            </Link>
          ))}
        </div>

        {shown.length === 0 ? (
          <Empty>
            {memberList.length === 0
              ? "会員はまだいません"
              : "条件に合う会員がいません（表記ゆれは自動で吸収します。会員番号・電話の一部でも探せます）"}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="px-2 py-2 font-medium">会員番号</th>
                  <th className="px-2 py-2 font-medium">お名前</th>
                  <th className="px-2 py-2 font-medium">プラン</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">🎫</th>
                  <th className="px-2 py-2 font-medium">入会日</th>
                  <th className="px-2 py-2 font-medium">連絡先</th>
                  <th className="px-2 py-2 font-medium">⚠</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const st = String(m.status ?? "");
                  const inMinTerm = m.leave_date == null && String((m as Row).min_term_until ?? "") > today;
                  return (
                    <tr key={m.id} className="border-b border-(--color-line)/60 hover:bg-(--color-panel-2)">
                      <td className="px-2 py-2 tabular-nums text-(--color-dim)">{m.member_no ?? "—"}</td>
                      <td className="px-2 py-2">
                        <Link href={`/frunk/${m.id}`} className="font-semibold text-indigo-600 underline">
                          {memberDisplayName(m as never) || "（氏名未入力）"}
                        </Link>
                        {m.name_kana ? <div className="text-[11px] text-(--color-dim)">{m.name_kana}</div> : null}
                      </td>
                      <td className="px-2 py-2 text-(--color-dim)">{planName((m as Row).plan_id) ?? "—"}</td>
                      <td className="px-2 py-2">
                        <Badge tone={FRUNK_STATUS_TONE[st] ?? "default"}>{FRUNK_STATUS_LABEL[st] ?? st}</Badge>
                        {inMinTerm ? (
                          <span
                            className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                            title="キャンペーン入会・6か月継続の対象"
                          >
                            継続中
                          </span>
                        ) : null}
                        {/* 後日決済（#217）: 在籍しているのにカードのお支払いが未登録の方。
                            探さなくても一覧で分かるようにする（請求漏れはここでしか気づけない） */}
                        {st === "active" && payLater(m as Row) ? (
                          <span
                            className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                            title="カードのお支払いが未登録です。会員カードから「このiPadで決済ページを開く」でお手続きできます"
                          >
                            決済未
                          </span>
                        ) : null}
                      </td>
                      {/* チケット残（#221）。数字を押すと会員カードのチケット欄（付与・購入受付）に飛ぶ */}
                      <td className="px-2 py-2 tabular-nums">
                        {(ticketMap.get(String(m.id)) ?? 0) > 0 ? (
                          <Link href={`/frunk/${m.id}#tickets`} className="font-semibold text-(--color-gold) underline">
                            {ticketMap.get(String(m.id))}枚
                          </Link>
                        ) : (
                          <Link href={`/frunk/${m.id}#tickets`} className="text-(--color-dim) underline">
                            付与
                          </Link>
                        )}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-(--color-dim)">{m.join_date ?? "—"}</td>
                      <td className="px-2 py-2 text-xs text-(--color-dim)">
                        {[m.phone, m.email].filter(Boolean).join("　") || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {m.alert_note ? (
                          <span title={String(m.alert_note)} className="text-rose-600">
                            ⚠
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* プラン管理 */}
      <Panel title="入会プラン・予約制限の設定" className="d3">
        <div className="space-y-2">
          {planList.length === 0 && <Empty>プランが未登録です。下のフォームから追加してください。</Empty>}
          {planList.map((p) => (
            <form
              key={String(p.id)}
              action={updatePlan}
              className="grid grid-cols-2 items-end gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 sm:grid-cols-7"
            >
              <input type="hidden" name="id" value={String(p.id)} />
              <Field label="プラン名"><input name="name" defaultValue={String(p.name)} className={`${inputCls} !py-1.5`} /></Field>
              <Field label={`月額(円)　${yen(p.monthly_price as number | null)}`}>
                <input name="monthly_price" inputMode="numeric" defaultValue={p.monthly_price != null ? String(p.monthly_price) : ""} className={`${inputCls} !py-1.5`} />
              </Field>
              <Field label="入会金(円)"><input name="joining_fee" inputMode="numeric" defaultValue={p.joining_fee != null ? String(p.joining_fee) : ""} className={`${inputCls} !py-1.5`} /></Field>
              <Field label="1日の予約上限"><input name="max_bookings_per_day" inputMode="numeric" defaultValue={p.max_bookings_per_day != null ? String(p.max_bookings_per_day) : ""} className={`${inputCls} !py-1.5`} /></Field>
              <Field label="週の予約上限"><input name="max_bookings_per_week" inputMode="numeric" defaultValue={p.max_bookings_per_week != null ? String(p.max_bookings_per_week) : ""} className={`${inputCls} !py-1.5`} /></Field>
              <Field label="表示順"><input name="sort_order" inputMode="numeric" defaultValue={String(p.sort_order ?? 0)} className={`${inputCls} !py-1.5`} /></Field>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-(--color-dim)">
                  <input type="checkbox" name="active" value="1" defaultChecked={!!p.active} className="h-4 w-4 accent-(--color-accent)" />表示
                </label>
                <button className={btnGhostCls}>保存</button>
              </div>
              <div className="col-span-2 sm:col-span-7">
                <input name="note" defaultValue={p.note ? String(p.note) : ""} placeholder="備考（例: 平日限定・学生割 など）" className={`${inputCls} !py-1.5`} />
              </div>
            </form>
          ))}
        </div>

        <div className="mt-4 border-t border-(--color-line) pt-4">
          <p className="mb-2 text-sm font-semibold">プランを追加</p>
          <form action={createPlan} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-7">
            <Field label="プラン名"><input name="name" placeholder="レギュラー" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="月額(円)"><input name="monthly_price" inputMode="numeric" placeholder="11000" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="入会金(円)"><input name="joining_fee" inputMode="numeric" placeholder="5000" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="1日の予約上限"><input name="max_bookings_per_day" inputMode="numeric" placeholder="1" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="週の予約上限"><input name="max_bookings_per_week" inputMode="numeric" placeholder="" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="表示順"><input name="sort_order" inputMode="numeric" placeholder="0" className={`${inputCls} !py-1.5`} /></Field>
            <button className={`${btnCls} justify-center`}>＋ 追加</button>
          </form>
        </div>
      </Panel>

      {/* URL発行 */}
      <Panel title="入会フォームURLの発行" className="d4">
        <p className="mb-3 text-xs text-(--color-dim)">
          店頭タブレットやHP/QR掲示用の入会フォームURLを発行します（発行すると旧URLは無効化）。
        </p>
        <form action={issueSignupToken} className="flex flex-wrap items-end gap-2">
          <Field label="ラベル（任意）"><input name="label" placeholder="FRANK 入会タブレット" className={inputCls} /></Field>
          <button className={btnCls}>入会フォームURLを発行</button>
        </form>
      </Panel>
    </div>
  );
}
