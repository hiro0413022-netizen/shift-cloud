import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { VISIT_TYPES, VISIT_TYPE_LABEL, RESULTS, PAYMENT_METHODS, DISCOUNTS, REFERRAL_SOURCES } from "@/lib/walkin";
import { createVisitManual, updateVisit, deleteVisit, issueStoreToken } from "./actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const TYPE_TONE: Record<string, "default" | "ok" | "warn" | "danger" | "accent"> = {
  trial: "accent", fitting: "ok", bay: "default", visitor_bay: "default", other: "default",
};

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? (sp.to as string) : new Date().toISOString().slice(0, 10);
  const typeFilter = VISIT_TYPES.some((v) => v.value === sp.type) ? sp.type : "";

  let q = admin
    .from("mbr_walkin_visits")
    .select("*, mbr_guests(name, name_kana, phone, email), reception:staff!reception_staff_id(name)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .gte("visited_on", from)
    .lte("visited_on", to)
    .order("visited_on", { ascending: false })
    .order("visit_seq", { ascending: false });
  if (typeFilter) q = q.eq("visit_type", typeFilter);

  const [{ data: visits }, { data: stores }, { data: monthAll }] = await Promise.all([
    q,
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("mbr_walkin_visits").select("visit_type, result")
      .eq("company_id", actor.companyId).is("deleted_at", null).gte("visited_on", monthStart()),
  ]);

  const list = (visits ?? []) as Row[];
  const storeList = (stores ?? []) as Row[];
  const month = (monthAll ?? []) as Row[];

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

      {/* 当月サマリ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="体験（当月）" value={mTrial} unit="件" />
        <SummaryCard label="体験→入会率" value={convRate ?? 0} unit="%" tone="ok" dim={convRate === null} />
        <SummaryCard label="フィッティング（当月）" value={mFitting} unit="件" />
        <SummaryCard label="フィッティング→購入率" value={buyRate ?? 0} unit="%" tone="gold" dim={buyRate === null} />
      </div>

      {/* 手動追加 */}
      <Panel title="一時利用を手動で登録（電話・飛び込み等）" className="d1">
        <form action={createVisitManual} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="日付">
            <input type="date" name="visited_on" defaultValue={to} className={inputCls} />
          </Field>
          <Field label="利用区分">
            <select name="visit_type" className={inputCls} defaultValue="trial">
              {VISIT_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="お名前">
            <input name="name" placeholder="山田 太郎" className={inputCls} />
          </Field>
          <Field label="電話番号">
            <input name="phone" placeholder="090-..." className={inputCls} />
          </Field>
          <Field label="利用料">
            <input name="fee" inputMode="numeric" placeholder="5500" className={inputCls} />
          </Field>
          <Field label="経路">
            <select name="referral_source" className={inputCls} defaultValue="">
              <option value="">-</option>
              {REFERRAL_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          {storeList.length > 1 && (
            <Field label="店舗">
              <select name="store_id" className={inputCls}>
                <option value="">-</option>
                {storeList.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
              </select>
            </Field>
          )}
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button className={`${btnCls} w-full justify-center`}>＋ 登録</button>
          </div>
        </form>
      </Panel>

      {/* 一覧 */}
      <Panel title={`受付一覧（${from} 〜 ${to}）${typeFilter ? ` / ${VISIT_TYPE_LABEL[typeFilter]}` : ""}`} className="d2">
        {list.length === 0 ? (
          <Empty>この期間の一時利用はありません</Empty>
        ) : (
          <div className="space-y-2">
            {list.map((v) => {
              const guest = (v.mbr_guests ?? null) as Row | null;
              const rec = (v.reception ?? null) as Row | null;
              const name = guest?.name ? String(guest.name) : "（氏名未入力）";
              const selfDone = !!v.consent_at;
              const vtype = String(v.visit_type);
              return (
                <div key={String(v.id)} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={TYPE_TONE[vtype] ?? "default"}>{VISIT_TYPE_LABEL[vtype] ?? vtype}</Badge>
                      <span className="font-semibold">{name}</span>
                      {guest?.name_kana ? <span className="text-xs text-(--color-dim)">{String(guest.name_kana)}</span> : null}
                      {v.result === "join" ? <Badge tone="gold">入会</Badge> : null}
                      {v.result === "purchase" ? <Badge tone="ok">購入</Badge> : null}
                      {selfDone ? <Badge tone="ok">自己入力済</Badge> : null}
                    </div>
                    <div className="text-xs text-(--color-dim)">
                      {[String(v.visited_on), guest?.phone && String(guest.phone), v.referral_source && `経路 ${String(v.referral_source)}`, rec?.name && `受付 ${String(rec.name)}`]
                        .filter(Boolean).join("　")}
                    </div>
                  </div>

                  {/* スタッフ追記 */}
                  <form action={updateVisit} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <input type="hidden" name="id" value={String(v.id)} />
                    <select name="result" defaultValue={String(v.result ?? "none")} className={`${inputCls} !py-1`}>
                      {RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label === "—" ? "成約なし" : r.label}</option>)}
                    </select>
                    <input name="fee" defaultValue={v.fee != null ? String(v.fee) : ""} inputMode="numeric" placeholder="利用料" className={`${inputCls} !py-1`} />
                    <select name="discount" defaultValue={v.discount ? String(v.discount) : ""} className={`${inputCls} !py-1`}>
                      <option value="">割引なし</option>
                      {DISCOUNTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select name="payment_method" defaultValue={v.payment_method ? String(v.payment_method) : ""} className={`${inputCls} !py-1`}>
                      <option value="">支払-</option>
                      {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <input name="pro_staff" defaultValue={v.pro_staff ? String(v.pro_staff) : ""} placeholder="担当プロ" className={`${inputCls} !py-1`} />
                    <input name="reapproach_date" type="date" defaultValue={v.reapproach_date ? String(v.reapproach_date) : ""} className={`${inputCls} !py-1`} />
                    <input name="note" defaultValue={v.note ? String(v.note) : ""} placeholder="備考・フォロー状況" className={`${inputCls} !py-1 col-span-2 sm:col-span-5`} />
                    <button className={btnGhostCls}>保存</button>
                  </form>

                  <div className="mt-1 flex justify-end">
                    <form action={deleteVisit}>
                      <input type="hidden" name="id" value={String(v.id)} />
                      <button className="text-xs text-(--color-dim) hover:text-red-400">削除</button>
                    </form>
                  </div>
                </div>
              );
            })}
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
