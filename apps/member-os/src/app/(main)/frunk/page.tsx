import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { FRUNK_STATUS_LABEL, FRUNK_STATUS_TONE, FRUNK_PAYMENT_LABEL, yen } from "@/lib/frunk";
import {
  createPlan, updatePlan, deletePlan, approveSignup, rejectSignup, setMemberStatus, issueSignupToken,
} from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

export default async function FrunkPage({
  searchParams,
}: {
  searchParams: Promise<{ signup_url?: string; err?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;

  const [{ data: plans }, { data: members }] = await Promise.all([
    admin.from("frunk_plans").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("frunk_members").select("*").eq("company_id", actor.companyId).is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const planList = (plans ?? []) as Row[];
  const memberList = (members ?? []) as Row[];
  const planName = (id: unknown) => planList.find((p) => p.id === id)?.name as string | undefined;

  const pending = memberList.filter((m) => m.status === "pending");
  const active = memberList.filter((m) => ["active", "suspended", "left"].includes(String(m.status)));

  return (
    <div className="space-y-5">
      <header className="reveal">
        <h1 className="text-2xl font-bold tracking-tight">FRUNK GOLF 姫路 — 会員管理</h1>
        <p className="mt-0.5 text-sm text-(--color-dim)">入会プラン・予約制限の設定、iPad入会申込の承認、会員の休会・退会管理</p>
      </header>

      {sp.err && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sp.err}</p>}

      {sp.signup_url && (
        <Panel title="入会フォームURL（タブレット/QR掲示・一度だけ表示）" className="d1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-xs text-indigo-600">{sp.signup_url}</code>
            <a href={sp.signup_url} target="_blank" rel="noreferrer" className={btnCls}>入会フォームを開く ↗</a>
          </div>
        </Panel>
      )}

      {/* 入会申込（承認待ち） */}
      <Panel title={`入会申込（承認待ち ${pending.length}件）`} className="d1">
        {pending.length === 0 ? (
          <Empty>承認待ちの申込はありません</Empty>
        ) : (
          <div className="space-y-3">
            {pending.map((m) => (
              <div key={String(m.id)} className="rounded-xl border border-(--color-line) bg-(--color-panel-2) p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{String(m.name)}</span>
                      {m.name_kana ? <span className="text-xs text-(--color-dim)">{String(m.name_kana)}</span> : null}
                      <Badge tone="accent">{planName(m.plan_id) ?? "プラン未選択"}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-(--color-dim)">
                      {[m.phone && String(m.phone), m.email && String(m.email), m.payment_method && FRUNK_PAYMENT_LABEL[String(m.payment_method)], m.start_date && `開始 ${String(m.start_date)}`].filter(Boolean).join("　")}
                    </div>
                  </div>
                  {m.signature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(m.signature)} alt="署名" className="h-14 rounded-md border border-(--color-line) bg-white" />
                  ) : null}
                </div>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* 会員一覧 */}
      <Panel title={`会員一覧（${active.length}名）`} className="d2">
        {active.length === 0 ? (
          <Empty>会員はまだいません</Empty>
        ) : (
          <div className="space-y-2">
            {active.map((m) => {
              const st = String(m.status);
              return (
                <div key={String(m.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={FRUNK_STATUS_TONE[st] ?? "default"}>{FRUNK_STATUS_LABEL[st] ?? st}</Badge>
                    <span className="font-semibold">{String(m.name)}</span>
                    {m.member_no ? <span className="text-xs text-(--color-dim)">{String(m.member_no)}</span> : null}
                    <span className="text-xs text-(--color-dim)">{planName(m.plan_id) ?? "—"}</span>
                    {m.join_date ? <span className="text-xs text-(--color-dim)">入会 {String(m.join_date)}</span> : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {st !== "suspended" && st !== "left" && (
                      <form action={setMemberStatus}><input type="hidden" name="id" value={String(m.id)} /><input type="hidden" name="to" value="suspended" /><button className={btnGhostCls}>休会</button></form>
                    )}
                    {st === "suspended" && (
                      <form action={setMemberStatus}><input type="hidden" name="id" value={String(m.id)} /><input type="hidden" name="to" value="active" /><button className={btnGhostCls}>復帰</button></form>
                    )}
                    {st !== "left" && (
                      <form action={setMemberStatus}><input type="hidden" name="id" value={String(m.id)} /><input type="hidden" name="to" value="left" /><button className="text-xs text-(--color-dim) hover:text-rose-600">退会</button></form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* プラン管理 */}
      <Panel title="入会プラン・予約制限の設定" className="d3">
        <div className="space-y-2">
          {planList.length === 0 && <Empty>プランが未登録です。下のフォームから追加してください。</Empty>}
          {planList.map((p) => (
            <form key={String(p.id)} action={updatePlan} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 sm:grid-cols-7">
              <input type="hidden" name="id" value={String(p.id)} />
              <Field label="プラン名"><input name="name" defaultValue={String(p.name)} className={`${inputCls} !py-1.5`} /></Field>
              <Field label="月額(円)"><input name="monthly_price" inputMode="numeric" defaultValue={p.monthly_price != null ? String(p.monthly_price) : ""} className={`${inputCls} !py-1.5`} /></Field>
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
            <Field label="入会金(円)"><input name="joining_fee" inputMode="numeric" placeholder="11000" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="1日の予約上限"><input name="max_bookings_per_day" inputMode="numeric" placeholder="1" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="週の予約上限"><input name="max_bookings_per_week" inputMode="numeric" placeholder="" className={`${inputCls} !py-1.5`} /></Field>
            <Field label="表示順"><input name="sort_order" inputMode="numeric" placeholder="0" className={`${inputCls} !py-1.5`} /></Field>
            <button className={`${btnCls} justify-center`}>＋ 追加</button>
          </form>
        </div>
      </Panel>

      {/* URL発行 */}
      <Panel title="入会フォームURLの発行" className="d4">
        <p className="mb-3 text-xs text-(--color-dim)">店頭タブレットやHP/QR掲示用の入会フォームURLを発行します（発行すると旧URLは無効化）。</p>
        <form action={issueSignupToken} className="flex flex-wrap items-end gap-2">
          <Field label="ラベル（任意）"><input name="label" placeholder="FRUNK 入会タブレット" className={inputCls} /></Field>
          <button className={btnCls}>入会フォームURLを発行</button>
        </form>
      </Panel>
    </div>
  );
}
