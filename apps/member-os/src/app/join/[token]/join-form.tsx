"use client";

import { useActionState, useRef, useState, useEffect, useCallback } from "react";
import { submitSignup, type SignupState } from "./actions";
import { FRUNK_PAYMENT_METHODS, yen } from "@/lib/frunk";
import { OCCUPATIONS, CONTACT_METHODS } from "@/lib/walkin";

type Plan = {
  id: string;
  name: string;
  monthly_price: number | null;
  joining_fee: number | null;
  max_bookings_per_day: number | null;
  note: string | null;
};

const field =
  "w-full rounded-xl border border-(--color-line) bg-white px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
const labelCls = "mb-1 block text-sm font-medium text-(--color-dim)";
const cardCls = "rounded-2xl border border-(--color-line) bg-(--color-panel) p-5 shadow-sm";

export function JoinForm({ token, plans }: { token: string; plans: Plan[] }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(submitSignup, {});
  const [signature, setSignature] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">✓</div>
        <p className="mt-3 text-lg font-semibold">入会申込ありがとうございました</p>
        <p className="mt-2 text-sm text-(--color-dim)">内容をスタッフが確認し、手続きを進めます。タブレットをスタッフにお渡しください。</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 pb-10">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signature" value={signature} />

      {/* プラン選択 */}
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-semibold text-(--color-txt)">ご希望のプラン <span className="text-rose-500">*</span></p>
        {plans.length === 0 ? (
          <p className="text-sm text-(--color-dim)">現在ご案内できるプランがありません。スタッフにお声がけください。</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {plans.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                  planId === p.id ? "border-accent bg-accent/5" : "border-(--color-line) bg-white"
                }`}
              >
                <input
                  type="radio" name="plan_id" value={p.id} className="sr-only" required
                  checked={planId === p.id} onChange={() => setPlanId(p.id)}
                />
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-(--color-txt)">{p.name}</span>
                  {p.monthly_price != null && <span className="text-sm font-bold text-accent">{yen(p.monthly_price)}<span className="text-xs font-normal text-(--color-dim)">/月</span></span>}
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-(--color-dim)">
                  {p.joining_fee != null && <div>入会金 {yen(p.joining_fee)}</div>}
                  {p.max_bookings_per_day != null && <div>1日の予約 {p.max_bookings_per_day}コマまで</div>}
                  {p.note && <div>{p.note}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* お客様情報 */}
      <div className={`${cardCls} space-y-4`}>
        <p className="text-sm font-semibold text-(--color-txt)">お客様情報</p>
        <div>
          <label className={labelCls}>お名前 <span className="text-rose-500">*</span></label>
          <input name="name" required placeholder="山田 太郎" className={field} />
        </div>
        <div>
          <label className={labelCls}>フリガナ</label>
          <input name="name_kana" placeholder="ヤマダ タロウ" className={field} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>生年月日</label>
            <input type="date" name="birth_date" className={field} />
          </div>
          <div>
            <label className={labelCls}>性別</label>
            <select name="gender" defaultValue="" className={field}>
              <option value="">選択</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">その他</option>
              <option value="unknown">無回答</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>電話番号 <span className="text-rose-500">*</span></label>
            <input name="phone" type="tel" required placeholder="090-1234-5678" className={field} />
          </div>
          <div>
            <label className={labelCls}>メールアドレス</label>
            <input name="email" type="email" placeholder="example@mail.com" className={field} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>郵便番号</label>
            <input name="postal_code" placeholder="670-0000" className={field} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>ご住所</label>
            <input name="address" placeholder="兵庫県姫路市〇〇町1-2-3" className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>ご職業</label>
            <select name="occupation" defaultValue="" className={field}>
              <option value="">選択</option>
              {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ご希望の連絡方法</label>
            <select name="contact_method" defaultValue="" className={field}>
              <option value="">選択</option>
              {CONTACT_METHODS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>お支払い方法</label>
            <select name="payment_method" defaultValue="" className={field}>
              <option value="">選択</option>
              {FRUNK_PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ご利用開始希望日</label>
            <input type="date" name="start_date" className={field} />
          </div>
        </div>
      </div>

      {/* 同意・署名 */}
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-semibold text-(--color-txt)">ご確認・同意</p>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consent_privacy" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
          <span>個人情報を入会手続き・サービス提供の目的で利用することに同意します。<span className="text-rose-500">*</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consent_terms" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
          <span>会員規約（<span className="font-medium text-(--color-txt)">休会・退会の規定</span>を含む）を確認し、同意します。<span className="text-rose-500">*</span></span>
        </label>
        <div>
          <label className={labelCls}>ご署名（指でご記入ください）<span className="text-rose-500">*</span></label>
          <SignaturePad value={signature} onChange={setSignature} />
        </div>
      </div>

      {state.error && <p className="text-center text-sm text-rose-600">{state.error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? "送信中..." : "この内容で入会を申し込む"}
      </button>
    </form>
  );
}

function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
    }
  }, []);

  useEffect(() => {
    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, [setup]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = pos(e);
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onChange("");
    }
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded-xl border border-dashed border-(--color-line) bg-(--color-panel-2)"
      />
      <div className="mt-1 flex justify-between text-xs text-(--color-dim)">
        <span>{value ? "署名を記入済み" : "上の枠内にご署名ください"}</span>
        <button type="button" onClick={clear} className="hover:text-(--color-txt)">消してやり直す</button>
      </div>
    </div>
  );
}
