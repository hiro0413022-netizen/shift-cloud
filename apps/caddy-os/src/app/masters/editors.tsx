"use client";

import { useState, useTransition } from "react";
import {
  clearPartnerToken,
  issuePartnerToken,
  saveClient,
  saveInvoiceSettings,
  savePartner,
  saveTransportRate,
  togglePartnerPicker,
} from "../actions";
import { CSV_FORMATS } from "@/lib/csv";

const cell = "rounded border border-(--color-line) bg-white px-2 py-1 text-sm outline-none focus:border-(--color-accent)";

type Client = {
  id: string;
  code: string | null;
  name: string;
  unit_price: number | null;
  partner_fee: number | null;
  closing_day: string | null;
  payment_day: string | null;
  postal_code: string | null;
  address: string | null;
  has_contract: boolean;
  status: string;
  // migration 0118（ゴルフ場提出CSVの書式と送り先）
  csv_format: string;
  contact_name: string | null;
  contact_email: string | null;
};

type Partner = {
  id: string;
  code: string | null;
  name: string;
  name_kana: string | null;
  default_fee: number | null;
  default_transport: number;
  hourly_wage: number | null;
  main_course: string | null;
  phone: string | null;
  email: string | null;
  submit_token: string | null;
  show_in_picker: boolean;
  status: string;
  memo: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_type: string | null;
  bank_account_no: string | null;
  bank_holder: string | null;
};

/** 汎用: サーバーアクションを呼んで結果を表示する行フォーム */
function useSaver(action: (fd: FormData) => Promise<{ error?: string }>) {
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const onAction = (fd: FormData) =>
    start(async () => {
      const r = await action(fd);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "保存しました" });
      if (!r.error) setTimeout(() => setMsg(null), 2000);
    });
  return { onAction, pending, msg };
}

/* ── 取引先（ゴルフ場）1件のフォーム ── */
function ClientForm({ c }: { c?: Client }) {
  const { onAction, pending, msg } = useSaver(saveClient);
  return (
    <form action={onAction} className="grid grid-cols-12 items-center gap-1.5 border-t border-(--color-line) py-2 text-sm">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <input name="code" defaultValue={c?.code ?? ""} placeholder="コード" className={`${cell} col-span-1`} />
      <input name="name" defaultValue={c?.name ?? ""} placeholder="ゴルフ場名" required className={`${cell} col-span-2`} />
      <input name="unit_price" type="number" defaultValue={c?.unit_price ?? ""} placeholder="売上単価" className={`${cell} col-span-1 text-right tabular-nums`} />
      <input name="partner_fee" type="number" defaultValue={c?.partner_fee ?? ""} placeholder="委託料" className={`${cell} col-span-1 text-right tabular-nums`} />
      <input name="closing_day" defaultValue={c?.closing_day ?? ""} placeholder="締め日" className={`${cell} col-span-1`} />
      <input name="payment_day" defaultValue={c?.payment_day ?? ""} placeholder="振込日" className={`${cell} col-span-1`} />
      <input name="postal_code" defaultValue={c?.postal_code ?? ""} placeholder="〒" className={`${cell} col-span-1`} />
      <input name="address" defaultValue={c?.address ?? ""} placeholder="住所" className={`${cell} col-span-2`} />
      <label className="col-span-1 flex items-center gap-1 text-xs">
        <input type="checkbox" name="has_contract" defaultChecked={c?.has_contract ?? false} /> 契約
      </label>
      <div className="col-span-1 flex items-center gap-1">
        <select name="status" defaultValue={c?.status ?? "active"} className={`${cell} w-full`}>
          <option value="active">有効</option>
          <option value="inactive">無効</option>
        </select>
      </div>
      {/* 提出CSVの書式と送り先（migration 0118）— ゴルフ場ごとに必要な形が違うためここで持つ */}
      <div className="col-span-12 grid grid-cols-12 items-center gap-1.5 rounded bg-slate-50 p-1.5">
        <span className="col-span-2 text-[11px] text-(--color-dim)">提出CSV書式</span>
        <select name="csv_format" defaultValue={c?.csv_format ?? "standard"} className={`${cell} col-span-4`}>
          {CSV_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}（{f.hint}）
            </option>
          ))}
        </select>
        <input name="contact_name" defaultValue={c?.contact_name ?? ""} placeholder="先方担当者" className={`${cell} col-span-2`} />
        <input name="contact_email" defaultValue={c?.contact_email ?? ""} placeholder="送付先メール" className={`${cell} col-span-4`} />
      </div>
      <div className="col-span-12 flex items-center gap-2">
        <button disabled={pending} className="rounded-lg bg-(--color-accent) px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {pending ? "保存中…" : c ? "更新" : "＋ 追加"}
        </button>
        {msg ? <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

export function ClientEditor({ clients }: { clients: Client[] }) {
  return (
    <div>
      <div className="grid grid-cols-12 gap-1.5 text-[11px] text-(--color-dim)">
        <div className="col-span-1">コード</div>
        <div className="col-span-2">ゴルフ場</div>
        <div className="col-span-1 text-right">売上単価</div>
        <div className="col-span-1 text-right">委託料</div>
        <div className="col-span-1">締め日</div>
        <div className="col-span-1">振込日</div>
        <div className="col-span-1">〒</div>
        <div className="col-span-2">住所</div>
        <div className="col-span-1">契約</div>
        <div className="col-span-1">状態</div>
      </div>
      {clients.map((c) => (
        <ClientForm key={c.id} c={c} />
      ))}
      <div className="mt-2 border-t-2 border-dashed border-(--color-line) pt-2">
        <p className="mb-1 text-xs font-medium text-(--color-dim)">＋ 新規追加</p>
        <ClientForm />
      </div>
    </div>
  );
}

/* ── 委託先（キャディ）1件のフォーム ── */
function PartnerForm({ p }: { p?: Partner }) {
  const { onAction, pending, msg } = useSaver(savePartner);
  return (
    <form action={onAction} className="grid grid-cols-12 items-center gap-1.5 border-t border-(--color-line) py-2 text-sm">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <input name="code" defaultValue={p?.code ?? ""} placeholder="コード" className={`${cell} col-span-1`} />
      <input name="name" defaultValue={p?.name ?? ""} placeholder="氏名" required className={`${cell} col-span-2`} />
      <input name="name_kana" defaultValue={p?.name_kana ?? ""} placeholder="カナ" className={`${cell} col-span-1`} />
      <input name="default_fee" type="number" defaultValue={p?.default_fee ?? ""} placeholder="標準委託料" className={`${cell} col-span-1 text-right tabular-nums`} />
      <input name="default_transport" type="number" defaultValue={p?.default_transport ?? 0} placeholder="標準交通費" className={`${cell} col-span-1 text-right tabular-nums`} />
      <input name="hourly_wage" type="number" defaultValue={p?.hourly_wage ?? ""} placeholder="時給(GW)" className={`${cell} col-span-1 text-right tabular-nums`} />
      <input name="main_course" defaultValue={p?.main_course ?? ""} placeholder="主な業務先" className={`${cell} col-span-2`} />
      <label className="col-span-1 flex items-center gap-1 text-xs">
        <input type="checkbox" name="show_in_picker" defaultChecked={p?.show_in_picker ?? true} /> 表示
      </label>
      <select name="status" defaultValue={p?.status ?? "active"} className={`${cell} col-span-1`}>
        <option value="active">有効</option>
        <option value="inactive">無効</option>
      </select>
      <input name="memo" defaultValue={p?.memo ?? ""} placeholder="備考" className={`${cell} col-span-1`} />
      {/* 連絡先＋本人提出URL（migration 0118）— LINEでURLを配れば、以後は本人がスマホから希望日を入れられる */}
      <div className="col-span-12 grid grid-cols-12 items-center gap-1.5 rounded bg-slate-50 p-1.5">
        <span className="col-span-1 text-[11px] text-(--color-dim)">連絡先</span>
        <input name="phone" defaultValue={p?.phone ?? ""} placeholder="電話番号" inputMode="tel" className={`${cell} col-span-3`} />
        <input name="email" defaultValue={p?.email ?? ""} placeholder="メール（任意）" className={`${cell} col-span-4`} />
        <div className="col-span-4">{p ? <SubmitLink partnerId={p.id} token={p.submit_token} /> : null}</div>
      </div>

      {/* 振込先口座（任意）— キャディ→YOZANの支払請求書に印字される（migration 0090） */}
      <div className="col-span-12 grid grid-cols-12 items-center gap-1.5 rounded bg-slate-50 p-1.5">
        <span className="col-span-1 text-[11px] text-(--color-dim)">振込先口座</span>
        <input name="bank_name" defaultValue={p?.bank_name ?? ""} placeholder="銀行・信金名" className={`${cell} col-span-3`} />
        <input name="bank_branch" defaultValue={p?.bank_branch ?? ""} placeholder="支店名" className={`${cell} col-span-2`} />
        <select name="bank_account_type" defaultValue={p?.bank_account_type ?? ""} className={`${cell} col-span-1`}>
          <option value="">種別</option>
          <option value="普通">普通</option>
          <option value="当座">当座</option>
        </select>
        <input name="bank_account_no" defaultValue={p?.bank_account_no ?? ""} placeholder="口座番号" inputMode="numeric" className={`${cell} col-span-2 tabular-nums`} />
        <input name="bank_holder" defaultValue={p?.bank_holder ?? ""} placeholder="口座名義（カナ）" className={`${cell} col-span-3`} />
      </div>
      <div className="col-span-12 flex items-center gap-2">
        <button disabled={pending} className="rounded-lg bg-(--color-accent) px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {pending ? "保存中…" : p ? "更新" : "＋ 追加"}
        </button>
        {msg ? <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

export function PartnerEditor({ partners }: { partners: Partner[] }) {
  return (
    <div>
      <div className="grid grid-cols-12 gap-1.5 text-[11px] text-(--color-dim)">
        <div className="col-span-1">コード</div>
        <div className="col-span-2">氏名</div>
        <div className="col-span-1">カナ</div>
        <div className="col-span-1 text-right">標準委託料</div>
        <div className="col-span-1 text-right">標準交通費</div>
        <div className="col-span-1 text-right">時給(GW)</div>
        <div className="col-span-2">主な業務先</div>
        <div className="col-span-1">台帳表示</div>
        <div className="col-span-1">状態</div>
        <div className="col-span-1">備考</div>
      </div>
      {partners.map((p) => (
        <PartnerForm key={p.id} p={p} />
      ))}
      <div className="mt-2 border-t-2 border-dashed border-(--color-line) pt-2">
        <p className="mb-1 text-xs font-medium text-(--color-dim)">＋ 新規追加</p>
        <PartnerForm />
      </div>
    </div>
  );
}

/* ── キャディ本人のシフト希望提出URL（migration 0118） ──
   フォームの中に置くのでボタンは type="button"（submitさせない）。
   URLはこのブラウザのオリジンから組み立てる＝環境変数を増やさない。 */
function SubmitLink({ partnerId, token }: { partnerId: string; token: string | null }) {
  const [cur, setCur] = useState(token);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const url = cur && typeof window !== "undefined" ? `${window.location.origin}/s/${cur}` : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {cur ? (
        <>
          <input readOnly value={url ?? `/s/${cur}`} className={`${cell} min-w-0 flex-1 text-[11px]`} />
          <button
            type="button"
            onClick={() => {
              if (url) navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded bg-slate-200 px-2 py-1"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await issuePartnerToken(partnerId);
                if (r.token) setCur(r.token);
              })
            }
            className="rounded bg-slate-100 px-2 py-1 text-(--color-dim)"
            title="再発行すると今のURLは使えなくなります"
          >
            再発行
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearPartnerToken(partnerId);
                setCur(null);
              })
            }
            className="text-(--color-dim) hover:text-red-600"
          >
            停止
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await issuePartnerToken(partnerId);
              if (r.token) setCur(r.token);
            })
          }
          className="rounded bg-(--color-accent) px-2 py-1 font-medium text-white disabled:opacity-50"
        >
          提出URLを発行
        </button>
      )}
    </div>
  );
}

/* ── 請求書設定（差出人・振込先 / companies.settings.invoice） ── */
export type InvoiceSettingsValue = {
  company_name?: string;
  representative?: string;
  postal_code?: string;
  address?: string;
  bank_name?: string;
  bank_account?: string;
  bank_holder?: string;
};

export function InvoiceSettingsEditor({ value }: { value: InvoiceSettingsValue }) {
  const { onAction, pending, msg } = useSaver(saveInvoiceSettings);
  return (
    <form action={onAction} className="grid grid-cols-12 items-center gap-1.5 text-sm">
      <div className="col-span-12 text-[11px] text-(--color-dim)">差出人（請求書の右上に出ます）</div>
      <input name="company_name" defaultValue={value.company_name ?? ""} placeholder="会社名（例: 株式会社YOZAN）" className={`${cell} col-span-3`} />
      <input name="representative" defaultValue={value.representative ?? ""} placeholder="代表者（例: 代表取締役 ○○○○）" className={`${cell} col-span-3`} />
      <input name="postal_code" defaultValue={value.postal_code ?? ""} placeholder="〒（例: 〒665-0816）" className={`${cell} col-span-2`} />
      <input name="address" defaultValue={value.address ?? ""} placeholder="住所" className={`${cell} col-span-4`} />
      <div className="col-span-12 mt-1 text-[11px] text-(--color-dim)">振込先銀行（請求書の枠内に出ます）</div>
      <input name="bank_name" defaultValue={value.bank_name ?? ""} placeholder="銀行・支店（例: 尼崎信用金庫 鴻池支店）" className={`${cell} col-span-4`} />
      <input name="bank_account" defaultValue={value.bank_account ?? ""} placeholder="種別・口座番号（例: 普通預金 4120589）" className={`${cell} col-span-4`} />
      <input name="bank_holder" defaultValue={value.bank_holder ?? ""} placeholder="口座名義（例: ｶ.ﾖｳｻﾞﾝ）" className={`${cell} col-span-4`} />
      <div className="col-span-12 flex items-center gap-2">
        <button disabled={pending} className="rounded-lg bg-(--color-accent) px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {pending ? "保存中…" : "保存"}
        </button>
        {msg ? <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

/* ── 台帳表示のワンクリックトグル（委託先一覧の簡易切替） ── */
export function PickerToggle({ partnerId, show }: { partnerId: string; show: boolean }) {
  const [on, setOn] = useState(show);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          const r = await togglePartnerPicker(partnerId, next);
          if (r.error) setOn(!next);
        })
      }
      className={`rounded px-2 py-0.5 text-[11px] ${on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
    >
      {on ? "表示中" : "非表示"}
    </button>
  );
}

/* ── 交通費 単価表（キャディ/社員 × ゴルフ場） ── */
export function TransportMatrix({
  clients,
  partners,
  staff = [],
  rates,
}: {
  clients: Array<{ id: string; name: string }>;
  partners: Array<{ id: string; name: string; default_transport: number }>;
  staff?: Array<{ id: string; name: string }>;
  rates: Record<string, number>; // "clientId__(partnerId|staffId)" → 金額
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // 委託先(p:) と 社員(s:) を1つの行リストにまとめる
  const rows: Array<{ id: string; name: string; assignee: string; kind: "partner" | "staff"; def: number }> = [
    ...partners.map((p) => ({ id: p.id, name: p.name, assignee: `p:${p.id}`, kind: "partner" as const, def: p.default_transport })),
    ...staff.map((s) => ({ id: s.id, name: s.name, assignee: `s:${s.id}`, kind: "staff" as const, def: 0 })),
  ];

  const onSave = async (clientId: string, assignee: string, raw: string) => {
    const key = `${clientId}__${assignee}`;
    setSaving(key);
    const amount = raw.trim() === "" ? null : Number(raw);
    await saveTransportRate(clientId, assignee, amount);
    setSaving(null);
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  };

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-(--color-dim)">
        セルに入力してフォーカスを外すと保存されます。空欄にすると委託先の「標準交通費」が使われます（プレースホルダで表示）。
        社員（青ラベル）の交通費は給与で精算しますが、入力の手間を減らすためここで単価を持てます。
      </p>
      <table className="min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs text-(--color-dim)">
            <th className="sticky left-0 bg-(--color-panel) p-2">担当 ＼ ゴルフ場</th>
            {clients.map((c) => (
              <th key={c.id} className="p-2 text-right">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.assignee} className="border-t border-(--color-line)">
              <td className="sticky left-0 bg-(--color-panel) p-2 whitespace-nowrap">
                {row.name}
                {row.kind === "staff" ? (
                  <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-800">社員</span>
                ) : null}
              </td>
              {clients.map((c) => {
                const key = `${c.id}__${row.assignee}`;
                const rateKey = `${c.id}__${row.id}`;
                return (
                  <td key={c.id} className="p-1">
                    <input
                      type="number"
                      defaultValue={rates[rateKey] ?? ""}
                      placeholder={String(row.def || 0)}
                      onBlur={(e) => onSave(c.id, row.assignee, e.target.value)}
                      className={`${cell} w-24 text-right tabular-nums ${
                        savedKey === key ? "border-emerald-400" : ""
                      } ${saving === key ? "opacity-50" : ""}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
