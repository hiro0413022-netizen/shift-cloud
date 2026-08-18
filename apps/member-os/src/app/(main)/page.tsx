import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { VISIT_TYPES, VISIT_TYPE_LABEL } from "@/lib/walkin";
import { jstYmd } from "@/lib/jst";
import { createVisitManual, issueStoreToken } from "./actions";
import { VisitRow } from "./visit-row";
import { ManualVisitForm } from "./manual-visit-form";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function monthStart(): string {
  const t = jstYmd();
  return `${t.slice(0, 7)}-01`;
}
/** 翌月1日（当月サマリの上限）。先の日付で入っている体験予約を当月に数えないため（2026-08-18） */
function nextMonthStart(): string {
  const [y, m] = monthStart().split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function md(s: unknown): string {
  const m = String(s ?? "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : String(s ?? "");
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string; reception_url?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? (sp.from as string) : monthStart();
  const today = jstYmd();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? (sp.to as string) : today;
  const typeFilter = VISIT_TYPES.some((v) => v.value === sp.type) ? sp.type : "";

  // 店舗またぎ事故の防止（#128）: オーナー以外は配属店舗のみ。所属ゼロは何も見えない
  const scopeIds = actor.isOwner
    ? null
    : actor.storeIds.length > 0
      ? actor.storeIds
      : ["00000000-0000-0000-0000-000000000000"];

  let q = admin
    .from("mbr_walkin_visits")
    .select("*, mbr_guests(id, name, name_kana, gender, birth_date, postal_code, prefecture, address1, building, phone, mobile, email, occupation, contact_method, note), reception:staff!reception_staff_id(name)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .gte("visited_on", from)
    .lte("visited_on", to)
    .order("visited_on", { ascending: false })
    .order("visit_seq", { ascending: false });
  if (typeFilter) q = q.eq("visit_type", typeFilter);
  if (scopeIds) q = q.in("store_id", scopeIds);

  let storesQ = admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name");
  if (scopeIds) storesQ = storesQ.in("id", scopeIds);
  let monthQ = admin.from("mbr_walkin_visits").select("visit_type, result")
    .eq("company_id", actor.companyId).is("deleted_at", null)
    .gte("visited_on", monthStart()).lt("visited_on", nextMonthStart());
  if (scopeIds) monthQ = monthQ.in("store_id", scopeIds);

  // 今後の来店予定（#139）: FRANKの体験はWeb予約が入った瞬間にこの台帳へ載る。
  // 既定の期間（当月1日〜今日）だと未来日の予約が一覧から漏れるので、期間に関係なく上に出す。
  let futureQ = admin
    .from("mbr_walkin_visits")
    .select("id, visited_on, visit_type, note, source_reservation_no, mbr_guests(name, name_kana, phone, email)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .gt("visited_on", today)
    .order("visited_on", { ascending: true })
    .limit(100);
  if (scopeIds) futureQ = futureQ.in("store_id", scopeIds);

  const [{ data: visits }, { data: stores }, { data: monthAll }, { data: future }] = await Promise.all([
    q,
    storesQ,
    monthQ,
    futureQ,
  ]);

  const list = (visits ?? []) as Row[];
  const storeList = (stores ?? []) as Row[];
  const month = (monthAll ?? []) as Row[];
  const futureList = (future ?? []) as Row[];

  const mTrial = month.filter((v) => v.visit_type === "trial").length;
  const mTrialJoin = month.filter((v) => v.visit_type === "trial" && v.result === "join").length;
  const mFitting = month.filter((v) => v.visit_type === "fitting").length;
  const mFittingBuy = month.filter((v) => v.visit_type === "fitting" && v.result === "purchase").length;
  const convRate = mTrial > 0 ? Math.round((mTrialJoin / mTrial) * 1000) / 10 : null;
  const buyRate = mFitting > 0 ? Math.round((mFittingBuy / mFitting) * 1000) / 10 : null;

  const receptionUrl = sp.reception_url ?? null;

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">一時利用者名簿 — 受付台帳</h1>
          <p className="text-sm text-(--color-dim)">体験・フィッティング・打席の一時利用をここで記録。紙・Excelを廃止し、体験→入会率も自動集計</p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="date" name="from" defaultValue={from} className={inputCls} />
          <span className="text-(--color-dim)">〜</span>
          <input type="date" name="to" defaultValue={to} className={inputCls} />
          <select name="type" defaultValue={typeFilter} className={inputCls}>
            <option value="">全区分</option>
            {VISIT_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <button className={btnGhostCls}>表示</button>
          <a
            href={`/api/ledger-export?from=${from}&to=${to}${typeFilter ? `&type=${typeFilter}` : ""}`}
            className={btnCls}
          >
            ⬇ Excel出力
          </a>
        </form>
      </header>

      {/* 受付URL（発行直後に一度だけ表示） */}
      {receptionUrl && (
        <Panel title="店頭タブレット受付URL（このURL/QRを店頭タブレットで開いてください・一度だけ表示）" className="d1">
          <p className="mb-2 text-xs text-(--color-dim)">
            このURLは長期有効です。タブレットのブラウザで開いてホーム画面に追加するか、QRにして店頭に掲示してください。予約不要でお客様が自己入力できます。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-xs text-indigo-600">{receptionUrl}</code>
            <a href={receptionUrl} target="_blank" rel="noreferrer" className={btnCls}>受付画面を開く ↗</a>
          </div>
        </Panel>
      )}

      {/* 今後の来店予定（未来日の予約。既定の期間からは外れるのでここに出す） */}
      {futureList.length > 0 && (
        <Panel title={`今後の来店予定（${futureList.length}件）`} className="d1">
          <p className="mb-2 text-xs text-(--color-dim)">
            公式サイトからの体験予約は、ご予約が入った時点でこの受付台帳に載ります。来店当日に下の一覧で
            料金・成約結果・アンケートを追記してください。
          </p>
          <div className="space-y-1.5">
            {futureList.map((v) => {
              const g = (v.mbr_guests ?? null) as Row | null;
              return (
                <div
                  key={String(v.id)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm"
                >
                  <span className="w-14 shrink-0 font-semibold tabular-nums text-indigo-600">{md(v.visited_on)}</span>
                  <span className="font-semibold">{g?.name ? String(g.name) : "（氏名未入力）"}</span>
                  <span className="rounded bg-(--color-panel) px-1.5 py-0.5 text-[10px] text-(--color-dim)">
                    {VISIT_TYPE_LABEL[String(v.visit_type)] ?? String(v.visit_type)}
                  </span>
                  <span className="text-xs text-(--color-dim)">
                    {[g?.phone && String(g.phone), g?.email && String(g.email)].filter(Boolean).join("　")}
                  </span>
                  {v.note ? <span className="text-xs text-(--color-dim)">{String(v.note)}</span> : null}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* 当月サマリ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="体験（当月）" value={mTrial} unit="件" />
        <SummaryCard label="体験→入会率" value={convRate ?? 0} unit="%" tone="ok" dim={convRate === null} />
        <SummaryCard label="フィッティング（当月）" value={mFitting} unit="件" />
        <SummaryCard label="フィッティング→購入率" value={buyRate ?? 0} unit="%" tone="gold" dim={buyRate === null} />
      </div>

      {/* 手動追加 */}
      <Panel title="一時利用を手動で登録（電話・飛び込み等）" className="d1">
        <ManualVisitForm
          action={createVisitManual}
          stores={storeList.map((s) => ({ id: String(s.id), name: String(s.name) }))}
          defaultDate={to}
        />
      </Panel>

      {/* 一覧 */}
      <Panel title={`受付一覧（${from} 〜 ${to}）${typeFilter ? ` / ${VISIT_TYPE_LABEL[typeFilter]}` : ""}`} className="d2">
        {list.length === 0 ? (
          <Empty>この期間の一時利用はありません</Empty>
        ) : (
          <div className="space-y-2">
            {list.map((v) => (
              <VisitRow
                key={String(v.id)}
                v={v}
                guest={(v.mbr_guests ?? null) as Row | null}
                rec={(v.reception ?? null) as Row | null}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* 店頭タブレットURL発行 */}
      <Panel title="店頭タブレット受付URLの発行" className="d3">
        <p className="mb-2 text-xs text-(--color-dim)">店舗ごとに常設の受付URLを発行します（予約不要）。発行すると同じ店舗の旧URLは無効化されます。</p>
        <form action={issueStoreToken} className="flex flex-wrap items-end gap-2">
          {storeList.length > 0 && (
            <Field label="店舗">
              <select name="store_id" className={inputCls}>
                <option value="">-</option>
                {storeList.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
              </select>
            </Field>
          )}
          <Field label="ラベル（任意）">
            <input name="label" placeholder="宝塚 受付タブレット" className={inputCls} />
          </Field>
          <button className={btnCls}>受付URLを発行</button>
        </form>
      </Panel>
    </div>
  );
}

function SummaryCard({
  label, value, unit, tone = "accent", dim = false,
}: {
  label: string; value: number; unit: string; tone?: "accent" | "gold" | "ok"; dim?: boolean;
}) {
  const color = tone === "gold" ? "text-(--color-gold)" : tone === "ok" ? "text-emerald-600" : "text-indigo-600";
  return (
    <div className="hud reveal rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-xs text-(--color-dim)">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${dim ? "text-(--color-dim)" : color}`}>
        {dim ? "—" : <CountUp value={value} />}
        <span className="ml-1 text-sm font-normal text-(--color-dim)">{dim ? "" : unit}</span>
      </p>
    </div>
  );
}
