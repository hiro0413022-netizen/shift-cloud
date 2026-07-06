"use client";

import { useActionState, useRef, useState, useEffect, useCallback } from "react";
import { submitReception, type ReceptionState } from "./actions";
import {
  VISIT_TYPES, OCCUPATIONS, CONTACT_METHODS, REFERRAL_SOURCES,
  TRIAL_REASONS, FITTING_REASONS, SCHOOL_GOALS, JOIN_INTEREST,
} from "@/lib/walkin";

const field =
  "w-full rounded-xl border border-[--color-line] bg-[--color-panel-2] px-4 py-3 text-base text-[--color-txt] placeholder:text-[--color-dim]/60 focus:border-sky-500 focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium text-[--color-dim]";

function CheckGroup({ name, options }: { name: string; options: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm">
          <input type="checkbox" name={name} value={o} className="h-5 w-5" />
          {o}
        </label>
      ))}
    </div>
  );
}

export function ReceptionForm({ token, storeName }: { token: string; storeName: string | null }) {
  const [state, action, pending] = useActionState<ReceptionState, FormData>(submitReception, {});
  const [signature, setSignature] = useState("");
  const [visitType, setVisitType] = useState("trial");

  if (state.ok) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-[--color-panel] p-8 text-center">
        <p className="text-3xl">✓</p>
        <p className="mt-3 text-lg font-semibold">ご記入ありがとうございました</p>
        <p className="mt-2 text-sm text-[--color-dim]">受付が完了しました。タブレットをスタッフにお渡しください。</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 pb-10">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signature" value={signature} />

      {storeName && (
        <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-3 text-center text-sm text-[--color-dim]">
          {storeName}
        </div>
      )}

      {/* 利用区分 */}
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-5 space-y-3">
        <p className="text-sm font-semibold text-[--color-txt]">本日のご利用 <span className="text-red-400">*</span></p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {VISIT_TYPES.map((v) => (
            <label
              key={v.value}
              className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-3 text-sm ${
                visitType === v.value
                  ? "border-sky-500 bg-sky-500/10 text-sky-300"
                  : "border-[--color-line] bg-[--color-panel-2] text-[--color-dim]"
              }`}
            >
              <input
                type="radio" name="visit_type" value={v.value} className="sr-only"
                checked={visitType === v.value} onChange={() => setVisitType(v.value)}
              />
              {v.label}
            </label>
          ))}
        </div>
      </div>

      {/* お客様情報 */}
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-5 space-y-4">
        <p className="text-sm font-semibold text-[--color-txt]">お客様情報</p>
        <div>
          <label className={labelCls}>お名前 <span className="text-red-400">*</span></label>
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
            <label className={labelCls}>電話番号 <span className="text-red-400">*</span></label>
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
            <input name="postal_code" placeholder="665-0000" className={field} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>ご住所</label>
            <input name="address" placeholder="兵庫県宝塚市〇〇町1-2-3" className={field} />
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
      </div>

      {/* アンケート */}
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-5 space-y-4">
        <p className="text-sm font-semibold text-[--color-txt]">アンケート（任意）</p>
        <div>
          <label className={labelCls}>当店を何で知りましたか</label>
          <select name="referral_source" defaultValue="" className={field}>
            <option value="">選択</option>
            {REFERRAL_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>（紹介・その他の場合）詳細</label>
          <input name="referral_source_other" placeholder="紹介者名など" className={field} />
        </div>

        {visitType === "fitting" ? (
          <div>
            <label className={labelCls}>フィッティングでご興味のある点</label>
            <CheckGroup name="fitting_reasons" options={FITTING_REASONS} />
          </div>
        ) : (
          <div>
            <label className={labelCls}>ご利用の目的・ご興味</label>
            <CheckGroup name="trial_reasons" options={TRIAL_REASONS} />
          </div>
        )}

        <div>
          <label className={labelCls}>ゴルフスクールに通う目的</label>
          <CheckGroup name="school_goals" options={SCHOOL_GOALS} />
        </div>
        <div>
          <label className={labelCls}>入会へのご興味</label>
          <select name="join_interest" defaultValue="" className={field}>
            <option value="">選択</option>
            {JOIN_INTEREST.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>ご要望・ご質問</label>
          <input name="comment" placeholder="自由記述" className={field} />
        </div>
      </div>

      {/* 同意・署名 */}
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-5 space-y-3">
        <p className="text-sm font-semibold text-[--color-txt]">同意・署名</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" value="1" required className="mt-0.5 h-5 w-5" />
          <span>個人情報をサービス提供・入会手続きの目的で利用することに同意します。<span className="text-red-400">*</span></span>
        </label>
        <div>
          <label className={labelCls}>ご署名（指でご記入ください）</label>
          <SignaturePad value={signature} onChange={setSignature} />
        </div>
      </div>

      {state.error && <p className="text-center text-sm text-red-400">{state.error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-sky-600 py-4 text-lg font-semibold text-white transition-all hover:bg-sky-500 disabled:opacity-50"
      >
        {pending ? "送信中..." : "この内容で受付する"}
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
      ctx.strokeStyle = "#e2e8f0";
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
        className="h-40 w-full touch-none rounded-xl border border-dashed border-[--color-line] bg-[--color-panel-2]"
      />
      <div className="mt-1 flex justify-between text-xs text-[--color-dim]">
        <span>{value ? "署名を記入済み" : "上の枠内にご署名ください"}</span>
        <button type="button" onClick={clear} className="hover:text-[--color-txt]">消してやり直す</button>
      </div>
    </div>
  );
}
