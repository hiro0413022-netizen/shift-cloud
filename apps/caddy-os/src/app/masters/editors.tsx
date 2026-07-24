"use client";

import { useState, useTransition } from "react";
import { saveClient, savePartner, saveTransportRate, togglePartnerPicker } from "../actions";

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
  show_in_picker: boolean;
  status: string;
  memo: string | null;
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

/* ── 交通費 単価表（キャディ × ゴルフ場） ── */
export function TransportMatrix({
  clients,
  partners,
  rates,
}: {
  clients: Array<{ id: string; name: string }>;
  partners: Array<{ id: string; name: string; default_transport: number }>;
  rates: Record<string, number>; // "clientId__partnerId" → 金額
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const onSave = async (clientId: string, partnerId: string, raw: string) => {
    const key = `${clientId}__${partnerId}`;
    setSaving(key);
    const amount = raw.trim() === "" ? null : Number(raw);
    await saveTransportRate(clientId, partnerId, amount);
    setSaving(null);
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
  };

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-(--color-dim)">
        セルに入力してフォーカスを外すと保存されます。空欄にすると委託先の「標準交通費」が使われます（プレースホルダで表示）
      </p>
      <table className="min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs text-(--color-dim)">
            <th className="sticky left-0 bg-(--color-panel) p-2">キャディ ＼ ゴルフ場</th>
            {clients.map((c) => (
              <th key={c.id} className="p-2 text-right">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => (
            <tr key={p.id} className="border-t border-(--color-line)">
              <td className="sticky left-0 bg-(--color-panel) p-2 whitespace-nowrap">{p.name}</td>
              {clients.map((c) => {
                const key = `${c.id}__${p.id}`;
                return (
                  <td key={c.id} className="p-1">
                    <input
                      type="number"
                      defaultValue={rates[key] ?? ""}
                      placeholder={String(p.default_transport || 0)}
                      onBlur={(e) => onSave(c.id, p.id, e.target.value)}
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
