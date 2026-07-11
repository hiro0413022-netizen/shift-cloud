"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { saveDispatch } from "../actions";
import { btnCls, inputCls } from "@/components/ui";

type Client = { id: string; name: string; unit_price: number | null };
type Partner = { id: string; name: string; default_fee: number | null; default_transport: number };
type Staff = { id: string; name: string };

/**
 * 派遣の登録フォーム。
 * - 取引先を選ぶと売上単価が自動で入る（マスタの標準単価。その場で上書き可）
 * - 担当が「自社スタッフ」なら委託料・手当は入力不可（給与で払うため二重計上になる / #44）
 */
export function DispatchForm({
  clients,
  partners,
  staff,
  defaultYm,
}: {
  clients: Client[];
  partners: Partner[];
  staff: Staff[];
  defaultYm: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState("");
  const [fee, setFee] = useState("");
  const [transport, setTransport] = useState("");
  const [assignee, setAssignee] = useState("");

  const isStaff = assignee.startsWith("s:");
  const today = `${defaultYm}-01`;

  return (
    <form
      action={async (fd) => {
        setError(null);
        const res = await saveDispatch(fd);
        if (res?.error) setError(res.error);
        else {
          setSales("");
          setFee("");
          setTransport("");
          setAssignee("");
        }
      }}
      className="grid gap-3 md:grid-cols-6"
    >
      <label className="md:col-span-1">
        <span className="mb-1 block text-xs text-[--color-dim]">派遣日</span>
        <input type="date" name="dispatch_date" defaultValue={today} required className={inputCls} />
      </label>

      <label className="md:col-span-2">
        <span className="mb-1 block text-xs text-[--color-dim]">取引先（ゴルフ場）</span>
        <select
          name="client_id"
          className={inputCls}
          onChange={(e) => {
            const c = clients.find((x) => x.id === e.target.value);
            if (c?.unit_price) setSales(String(c.unit_price));
            if (!e.target.value) setSales("0");
          }}
        >
          <option value="">（売上なし・研修等）</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.unit_price ? ` — ${c.unit_price.toLocaleString()}円` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="md:col-span-1">
        <span className="mb-1 block text-xs text-[--color-dim]">売上（税抜）</span>
        <input
          type="number"
          name="sales_amount"
          value={sales}
          onChange={(e) => setSales(e.target.value)}
          min={0}
          className={inputCls}
          placeholder="0"
        />
      </label>

      <label className="md:col-span-2">
        <span className="mb-1 block text-xs text-[--color-dim]">担当キャディ</span>
        <select
          name="assignee"
          required
          value={assignee}
          className={inputCls}
          onChange={(e) => {
            const v = e.target.value;
            setAssignee(v);
            if (v.startsWith("p:")) {
              const p = partners.find((x) => `p:${x.id}` === v);
              setFee(p?.default_fee ? String(p.default_fee) : "");
              setTransport(p?.default_transport ? String(p.default_transport) : "");
            } else {
              setFee("");
              setTransport("");
            }
          }}
        >
          <option value="">選択してください</option>
          <optgroup label="委託先（外注）">
            {partners.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.name}
                {p.default_fee ? ` — ${p.default_fee.toLocaleString()}円` : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="自社スタッフ（人件費は給与側）">
            {staff.map((s) => (
              <option key={s.id} value={`s:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <label className="md:col-span-1">
        <span className="mb-1 block text-xs text-[--color-dim]">委託料</span>
        <input
          type="number"
          name="fee_amount"
          value={isStaff ? "" : fee}
          onChange={(e) => setFee(e.target.value)}
          min={0}
          disabled={isStaff}
          className={`${inputCls} disabled:bg-slate-100`}
          placeholder={isStaff ? "給与で支給" : "0"}
        />
      </label>

      <label className="md:col-span-1">
        <span className="mb-1 block text-xs text-[--color-dim]">交通費</span>
        <input
          type="number"
          name="transport_amount"
          value={transport}
          onChange={(e) => setTransport(e.target.value)}
          min={0}
          className={inputCls}
          placeholder="0"
        />
      </label>

      <label className="md:col-span-1">
        <span className="mb-1 block text-xs text-[--color-dim]">特別手当</span>
        <input
          type="number"
          name="special_amount"
          min={0}
          disabled={isStaff}
          className={`${inputCls} disabled:bg-slate-100`}
          placeholder="0"
        />
      </label>

      <label className="md:col-span-3">
        <span className="mb-1 block text-xs text-[--color-dim]">メモ</span>
        <input type="text" name="memo" className={inputCls} placeholder="（任意）" />
      </label>

      <input type="hidden" name="kind" value="dispatch" />

      <div className="md:col-span-1 md:self-end">
        <Submit />
      </div>

      {isStaff ? (
        <p className="md:col-span-6 text-xs text-sky-800">
          自社スタッフの派遣です。委託料・特別手当は入力できません（給与で支給されるため）。
          交通費を入れた場合も外注費には計上されません（記録のみ）。
        </p>
      ) : null}

      {error ? <p className="md:col-span-6 text-sm text-red-600">{error}</p> : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnCls} w-full justify-center`}>
      {pending ? "登録中…" : "登録"}
    </button>
  );
}
