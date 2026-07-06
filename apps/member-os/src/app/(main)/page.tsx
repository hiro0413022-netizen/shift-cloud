import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import {
  createBooking,
  updateBookingStatus,
  setJoinResult,
  deleteBooking,
  issueTabletToken,
} from "./actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const SOURCE_LABEL: Record<string, string> = {
  hp: "HP", phone: "電話", walkin: "来店", referral: "紹介", sns: "SNS", other: "その他",
};
const STATUS_LABEL: Record<string, string> = {
  reserved: "予約", visited: "来店済", canceled: "キャンセル", no_show: "無断欠",
};
const STATUS_TONE: Record<string, "default" | "ok" | "warn" | "danger" | "accent"> = {
  reserved: "accent", visited: "ok", canceled: "default", no_show: "danger",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmtTime(t: unknown): string {
  const s = t == null ? "" : String(t);
  return s ? s.slice(0, 5) : "";
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; intake_url?: string; bid?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : todayStr();

  const [{ data: stores }, { data: staff }, { data: monthBookings }, { data: dayBookings }] = await Promise.all([
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("staff").select("id, name").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("name"),
    admin
      .from("mbr_trial_bookings")
      .select("id, status, joined, lesson_date, created_at")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .gte("lesson_date", monthStart()),
    admin
      .from("mbr_trial_bookings")
      .select("*, mbr_guests(name, name_kana, mobile, email), assignee:staff!staff_id(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .eq("lesson_date", date)
      .order("start_time", { nullsFirst: false }),
  ]);

  const storeList = (stores ?? []) as Row[];
  const staffList = (staff ?? []) as Row[];
  const month = (monthBookings ?? []) as Row[];
  const day = (dayBookings ?? []) as Row[];

  // 当月サマリ
  const mTrials = month.filter((b) => b.status !== "canceled").length;
  const mVisited = month.filter((b) => b.status === "visited").length;
  const mJoined = month.filter((b) => b.joined === true).length;
  const convRate = mVisited > 0 ? Math.round((mJoined / mVisited) * 1000) / 10 : null;

  const intakeUrl = sp.intake_url ?? null;

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">体験受付 — Member OS</h1>
          <p className="text-sm text-[--color-dim]">紙・Excelを廃止。予約→来店→入会をここで管理し、体験予約数・入会率を自動集計</p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={date} className={inputCls} />
          <button className={btnGhostCls}>表示</button>
        </form>
      </header>

      {/* タブレット受付URL（発行直後に一度だけ表示） */}
      {intakeUrl && (
        <Panel title="タブレット受付URL（このお客様用・一度だけ表示）" className="d1">
          <p className="mb-2 text-xs text-[--color-dim]">
            この端末でタブレットの受付画面を開くか、下のURLをタブレットのブラウザに入力してお客様に渡してください（有効期限12時間）。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-xs text-sky-300">
              {intakeUrl}
            </code>
            <a href={intakeUrl} target="_blank" rel="noreferrer" className={btnCls}>受付画面を開く ↗</a>
          </div>
        </Panel>
      )}

      {/* 当月サマリ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="体験予約（当月）" value={mTrials} unit="件" />
        <SummaryCard label="来店（当月）" value={mVisited} unit="件" />
        <SummaryCard label="入会（当月）" value={mJoined} unit="件" tone="gold" />
        <SummaryCard label="入会率（当月）" value={convRate ?? 0} unit="%" tone="ok" dim={convRate === null} />
      </div>

      {/* 新規予約フォーム */}
      <Panel title="体験予約を登録" className="d1">
        <form action={createBooking} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="お名前（電話予約時）">
            <input name="guest_name" placeholder="山田 太郎" className={inputCls} />
          </Field>
          <Field label="携帯番号">
            <input name="guest_mobile" placeholder="090-..." className={inputCls} />
          </Field>
          <Field label="体験メニュー">
            <input name="program" list="programs" placeholder="初回体験" className={inputCls} />
            <datalist id="programs">
              <option value="初回体験（無料）" />
              <option value="体験レッスン" />
              <option value="1DAY体験" />
            </datalist>
          </Field>
          <Field label="経路">
            <select name="source" className={inputCls} defaultValue="phone">
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="日付">
            <input type="date" name="lesson_date" defaultValue={date} className={inputCls} />
          </Field>
          <Field label="開始">
            <input type="time" name="start_time" className={inputCls} />
          </Field>
          <Field label="終了">
            <input type="time" name="end_time" className={inputCls} />
          </Field>
          <Field label="打席">
            <input name="bay" placeholder="打席A" className={inputCls} />
          </Field>
          {storeList.length > 1 && (
            <Field label="店舗">
              <select name="store_id" className={inputCls}>
                <option value="">-</option>
                {storeList.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="担当">
            <select name="staff_id" className={inputCls}>
              <option value="">-</option>
              {staffList.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>
              ))}
            </select>
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button className={`${btnCls} w-full justify-center`}>＋ 登録</button>
          </div>
        </form>
      </Panel>

      {/* 当日一覧 */}
      <Panel title={`予約一覧（${date}）`} className="d2">
        {day.length === 0 ? (
          <Empty>この日の体験予約はありません</Empty>
        ) : (
          <div className="space-y-2">
            {day.map((b) => {
              const guest = (b.mbr_guests ?? null) as Row | null;
              const assignee = (b.assignee ?? null) as Row | null;
              const status = String(b.status);
              const name = guest?.name ? String(guest.name) : "（氏名未入力）";
              const selfDone = !!b.consent_at;
              return (
                <div key={String(b.id)} className="rounded-lg border border-[--color-line] bg-[--color-panel-2] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[status] ?? "default"}>{STATUS_LABEL[status] ?? status}</Badge>
                      <span className="font-semibold">{name}</span>
                      {guest?.name_kana ? <span className="text-xs text-[--color-dim]">{String(guest.name_kana)}</span> : null}
                      {b.joined ? <Badge tone="gold">入会</Badge> : null}
                      {selfDone ? <Badge tone="ok">自己入力済</Badge> : null}
                    </div>
                    <div className="text-xs text-[--color-dim]">
                      {[fmtTime(b.start_time) && `${fmtTime(b.start_time)}${fmtTime(b.end_time) ? `–${fmtTime(b.end_time)}` : ""}`, b.bay && String(b.bay), b.program && String(b.program), assignee?.name && `担当 ${String(assignee.name)}`, SOURCE_LABEL[String(b.source)] && `経路 ${SOURCE_LABEL[String(b.source)]}`]
                        .filter(Boolean)
                        .join("　")}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* ステータス操作 */}
                    {status !== "visited" && (
                      <form action={updateBookingStatus}>
                        <input type="hidden" name="id" value={String(b.id)} />
                        <input type="hidden" name="status" value="visited" />
                        <button className={btnGhostCls}>来店にする</button>
                      </form>
                    )}
                    {status !== "no_show" && (
                      <form action={updateBookingStatus}>
                        <input type="hidden" name="id" value={String(b.id)} />
                        <input type="hidden" name="status" value="no_show" />
                        <button className={btnGhostCls}>無断欠</button>
                      </form>
                    )}
                    {status !== "canceled" && (
                      <form action={updateBookingStatus}>
                        <input type="hidden" name="id" value={String(b.id)} />
                        <input type="hidden" name="status" value="canceled" />
                        <button className={btnGhostCls}>キャンセル</button>
                      </form>
                    )}

                    {/* タブレット受付 */}
                    <form action={issueTabletToken}>
                      <input type="hidden" name="booking_id" value={String(b.id)} />
                      <button className={btnGhostCls}>📱 タブレット受付</button>
                    </form>

                    {/* 入会可否 */}
                    {!b.joined ? (
                      <form action={setJoinResult} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={String(b.id)} />
                        <input type="hidden" name="joined" value="1" />
                        <button className={btnCls}>✓ 入会</button>
                      </form>
                    ) : (
                      <form action={setJoinResult}>
                        <input type="hidden" name="id" value={String(b.id)} />
                        <input type="hidden" name="joined" value="0" />
                        <button className={btnGhostCls}>入会を取消</button>
                      </form>
                    )}

                    {/* 見送り理由 */}
                    {!b.joined && (
                      <form action={setJoinResult} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={String(b.id)} />
                        <input type="hidden" name="joined" value="0" />
                        <input name="decline_reason" placeholder="見送り理由" className={`${inputCls} !w-40 !py-1`} />
                        <button className={btnGhostCls}>記録</button>
                      </form>
                    )}

                    <form action={deleteBooking} className="ml-auto">
                      <input type="hidden" name="id" value={String(b.id)} />
                      <button className="text-xs text-[--color-dim] hover:text-red-400">削除</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function SummaryCard({
  label, value, unit, tone = "accent", dim = false,
}: {
  label: string; value: number; unit: string; tone?: "accent" | "gold" | "ok"; dim?: boolean;
}) {
  const color = tone === "gold" ? "text-[--color-gold]" : tone === "ok" ? "text-emerald-300" : "text-sky-300";
  return (
    <div className="hud reveal rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
      <p className="text-xs text-[--color-dim]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${dim ? "text-[--color-dim]" : color}`}>
        {dim ? "—" : <CountUp value={value} />}
        <span className="ml-1 text-sm font-normal text-[--color-dim]">{dim ? "" : unit}</span>
      </p>
    </div>
  );
}
