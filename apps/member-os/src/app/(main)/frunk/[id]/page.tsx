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
import { setMemberStatus, changePlan, resendApprovalMail, saveAlertNote, updateMemberProfile } from "../actions";

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
  searchParams: Promise<{ err?: string; msg?: string }>;
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
    .select("*, frunk_plans(id, name, monthly_price, joining_fee, max_bookings_per_day, max_bookings_per_week)")
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
            <h1 className="text-2xl font-bold tracking-tight">{String(m.name ?? "（氏名未入力）")}</h1>
            {m.name_kana ? <span className="text-sm text-(--color-dim)">{String(m.name_kana)}</span> : null}
            <Badge tone={FRUNK_STATUS_TONE[status] ?? "default"}>{FRUNK_STATUS_LABEL[status] ?? status}</Badge>
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 会員情報 */}
        <Panel title="会員情報" className="d1">
          <Info label="会員番号">{memberNo || "—"}</Info>
          <Info label="お名前">
            {String(m.name ?? "—")}
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
              </>
            ) : (
              <Badge tone="default">未登録（店頭払い）</Badge>
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
                  {planList
                    .filter((p) => p.active !== false && p.id !== m.plan_id && Number(p.monthly_price ?? 0) > 0)
                    .map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {String(p.name)}（{yen(p.monthly_price as number | null)}）
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
              {status !== "suspended" && status !== "left" && (
                <form action={setMemberStatus}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="to" value="suspended" />
                  <button className={btnGhostCls}>休会にする</button>
                </form>
              )}
              {status === "suspended" && (
                <form action={setMemberStatus}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="to" value="active" />
                  <button className={btnCls}>復帰させる</button>
                </form>
              )}
              {status !== "left" && (
                <form action={setMemberStatus}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="to" value="left" />
                  <button className="rounded-lg border border-(--color-line) px-3 py-2 text-sm text-(--color-dim) hover:text-rose-600">
                    退会にする
                  </button>
                </form>
              )}
            </div>
          </div>
        </Panel>
      </div>

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
