import Link from "next/link";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { NameFields } from "@/components/name-fields";
import {
  corporateSpec, corporateSeats, openSlots, slotUsageLabel,
} from "@yozan/core/frank-corporate";
import { addUser, removeUser, toggleSelfUse } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * 法人プラン「ご利用者の管理」（#206・2026-09-03）
 *
 * 会社側で人の出入りを完結させるための画面。開けるのはご契約者だけ。
 *
 * 上から順に、ご担当者が知りたい順に置く:
 *   ① 御社のご予約（いま何コマ埋まっているか）… 1人が押さえ切ると他の方が取れないため
 *   ② ご登録中のご利用者（会員番号つき）＋【登録を外す】
 *   ③ ご利用者を追加する
 * ご担当者ご自身も使う場合は②の先頭で登録していただく（使う人は必ず記名・#206）。
 */

const field =
  "w-full rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-(--color-gold) focus:outline-none";
const label = "mb-1 block text-sm font-medium text-(--color-dim)";

export default async function MemberCorporatePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const admin = createAdmin();

  const { data: me } = await admin
    .from("frunk_members")
    .select("id, name, member_no, company_name, corporate_parent_id, corporate_self_use, frunk_plans(name, is_corporate, max_users, max_open_slots, max_bookings_per_day, companion_free)")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();

  const plan = (me as unknown as { frunk_plans: Row | null } | null)?.frunk_plans ?? null;
  const spec = corporateSpec(plan as never);
  const isContract = !!me && !me.corporate_parent_id;

  // 法人でない／ご利用者の行 は、この画面では何もできない（外せてしまうのを防ぐ）
  if (!me || !spec.isCorporate || !isContract) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← マイページ</Link>
        <p className="mt-6 rounded-xl border border-(--color-line) bg-(--color-panel) p-5 text-sm text-(--color-dim)">
          {spec.isCorporate
            ? "ご利用者の管理は、ご契約者様（お申し込みをされたご担当者様）の会員番号でログインしてお使いください。"
            : "このページは法人プランのご契約者様のみご利用いただけます。"}
        </p>
      </main>
    );
  }

  const rootId = String(me.id);
  const companyName = me.company_name ? String(me.company_name) : "";
  const selfUse = !!me.corporate_self_use;

  const { data: users } = await admin
    .from("frunk_members")
    .select("id, name, member_no, phone, email, join_date")
    .eq("corporate_parent_id", rootId).is("deleted_at", null)
    .order("join_date", { ascending: true });
  const list = (users ?? []) as Row[];

  const seats = corporateSeats({ maxUsers: spec.maxUsers, registered: list.length, selfUse });

  // 御社のご予約（ご契約者＋ご利用者の合計）。数え方は @yozan/core/frank-corporate
  const holderIds = [rootId, ...list.map((u) => String(u.id))];
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const nowHm = new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16);
  const { data: openRows } = await admin
    .from("frunk_bookings")
    .select("member_id, booked_date, start_time, end_time, status")
    .in("member_id", holderIds).gte("booked_date", today)
    .neq("status", "cancelled").is("deleted_at", null);
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const bookings = (openRows ?? []).map((b) => ({
    memberId: String(b.member_id),
    date: String(b.booked_date),
    endTime: String(b.end_time),
    minutes: toMin(String(b.end_time)) - toMin(String(b.start_time)),
    status: String(b.status ?? ""),
  }));
  const used = openSlots(bookings, today, nowHm);
  const usage = slotUsageLabel({ used, limit: spec.maxOpenSlots, corporate: true });
  const last4 = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-4);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-5">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← マイページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">ご利用者の管理</h1>
        <p className="text-xs text-(--color-dim)">
          {companyName || "御社"}　{plan?.name ? String(plan.name) : "法人プラン"}
        </p>
      </header>

      {sp.msg && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{sp.msg}</p>}
      {sp.err && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{sp.err}</p>}

      {/* ① 御社のご予約 — 誰かが押さえ切ると他の方が取れないので、いちばん上に出す */}
      <section className={`mb-5 rounded-2xl border p-5 ${usage.full ? "border-amber-500/50 bg-amber-500/5" : "border-(--color-line) bg-(--color-panel)"}`}>
        <p className="text-xs tracking-widest text-(--color-dim)">法人名義でのご予約</p>
        <p className="mt-1 text-3xl font-bold text-(--color-gold)">
          {used}
          <span className="text-lg text-(--color-txt)">／{spec.maxOpenSlots} コマ</span>
        </p>
        <p className="mt-1 text-xs text-(--color-dim)">{usage.detail}</p>
        {usage.full && (
          <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            いま御社の枠がすべて埋まっています。この状態では、ご登録者のどなたも新しいご予約をお取りいただけません。
          </p>
        )}
      </section>

      {/* ② ご登録中のご利用者 */}
      <section className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-(--color-dim)">ご登録中のご利用者</h2>
          <p className="text-xs text-(--color-dim)">
            {seats.limit === null ? `${seats.used}名（人数の制限なし）` : `${seats.used}／${seats.limit}名`}
          </p>
        </div>

        {/* ご担当者ご自身。使うなら登録が必要（使う人は必ず記名・#206） */}
        <div className="mb-2 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {String(me.name)} <span className="text-xs font-normal text-(--color-dim)">（ご契約者）</span>
              </p>
              <p className="text-xs text-(--color-dim)">
                会員番号 {String(me.member_no ?? "—")}　
                {selfUse ? "ご利用者としてご登録済み" : "お支払いのみ（このままではご予約いただけません）"}
              </p>
            </div>
            <form action={toggleSelfUse}>
              <input type="hidden" name="on" value={selfUse ? "0" : "1"} />
              <button
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${
                  selfUse
                    ? "border border-(--color-line) text-(--color-dim) hover:text-red-500"
                    : "bg-(--color-gold) text-white hover:bg-(--color-gold)/90"
                }`}
              >
                {selfUse ? "利用しない" : "自分も利用する"}
              </button>
            </form>
          </div>
        </div>

        {list.length === 0 && !selfUse && (
          <p className="rounded-xl border border-dashed border-(--color-line) p-4 text-xs text-(--color-dim)">
            まだご利用者のご登録がありません。打席をご利用になる方を、下のフォームからご登録ください。
          </p>
        )}

        <div className="space-y-2">
          {list.map((u) => {
            const mine = bookings.filter((b) => b.memberId === String(u.id) && b.date >= today);
            return (
              <div key={String(u.id)} className="flex items-center justify-between gap-3 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
                <div>
                  <p className="font-semibold">{String(u.name)}</p>
                  <p className="text-xs text-(--color-dim)">
                    会員番号 {String(u.member_no ?? "発行中")}　ログイン下4桁 {last4(u.phone) || "—"}
                    {mine.length > 0 ? `　これからのご予約 ${mine.length}件` : ""}
                  </p>
                </div>
                <form action={removeUser}>
                  <input type="hidden" name="user_id" value={String(u.id)} />
                  <button className="whitespace-nowrap rounded-lg border border-(--color-line) px-3 py-2 text-xs text-(--color-dim) hover:text-red-500">
                    登録を外す
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      {/* ③ 追加 */}
      <section className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
        <h2 className="text-sm font-semibold text-(--color-txt)">ご利用者を追加する</h2>
        <p className="mt-1 text-xs text-(--color-dim)">
          追加すると、その場で会員番号を発行します。ログインは
          <span className="font-medium text-(--color-txt)">会員番号 と ご本人の電話番号の下4桁</span>です。
          電話番号は、おひとりずつ違う番号をご入力ください。
        </p>

        {seats.canAdd ? (
          <form action={addUser} className="mt-4 grid grid-cols-2 gap-3">
            <NameFields
              inputClassName={field}
              labelClassName={label}
              requiredMark={<span className="text-rose-400"> *</span>}
            />
            <div className="col-span-2">
              <label className={label}>電話番号 <span className="text-rose-400">*</span></label>
              <input name="cu_phone" type="tel" required placeholder="090-1234-5678" className={field} />
            </div>
            <div className="col-span-2">
              <label className={label}>メールアドレス（任意）</label>
              <input name="cu_email" type="email" placeholder="taro@example.co.jp" className={field} />
              <p className="mt-1 text-xs text-(--color-dim)">
                ご入力いただくと、会員番号とログイン方法のご案内をご本人あてに自動でお送りします。
              </p>
            </div>
            <div className="col-span-2">
              <button className="w-full rounded-xl bg-(--color-gold) py-3.5 font-semibold text-white hover:bg-(--color-gold)/90">
                ご利用者として登録する
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-700">
            ご登録いただけるのは{seats.limit}名様までです。入れ替える場合は、先に外れる方の【登録を外す】を押してください。
          </p>
        )}
      </section>

      <p className="mt-5 text-xs leading-relaxed text-(--color-dim)">
        ※ ご利用者を追加しても月会費は変わりません（お支払いはご契約者様に1本のままです）。<br />
        ※ 打席のご予約は、ご登録者のみなさまで御社の{spec.maxOpenSlots}コマを分け合ってお取りいただきます。
        ご利用が済むと、また次のご予約をお取りいただけます。
        {spec.companionFree ? <><br />※ 同伴のビジター様は無料でご一緒いただけます。</> : null}
      </p>
    </main>
  );
}
