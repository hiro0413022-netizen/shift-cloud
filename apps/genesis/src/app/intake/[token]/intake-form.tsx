"use client";

import { useActionState, useRef, useState, useEffect, useCallback } from "react";
import { submitIntake, type IntakeState } from "./actions";

const field =
  "w-full rounded-xl border border-[--color-line] bg-[--color-panel-2] px-4 py-3 text-base text-[--color-txt] placeholder:text-[--color-dim]/60 focus:border-sky-500 focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium text-[--color-dim]";

export function IntakeForm({
  token,
  program,
  lessonDate,
  prefill,
}: {
  token: string;
  program: string | null;
  lessonDate: string | null;
  prefill: { name: string; name_kana: string; mobile: string };
}) {
  const [state, action, pending] = useActionState<IntakeState, FormData>(submitIntake, {});
  const [signature, setSignature] = useState("");

  if (state.ok) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-[--color-panel] p-8 text-center">
        <p className="text-3xl">✓</p>
        <p className="mt-3 text-lg font-semibold">ご記入ありがとうございました</p>
        <p className="mt-2 text-sm text-[--color-dim]">
          受付が完了しました。タブレットをスタッフにお渡しください。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5 pb-10">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signature" value={signature} />

      {(program || lessonDate) && (
        <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4 text-sm text-[--color-dim]">
          本日の体験：<span className="text-[--color-txt]">{program ?? "体験レッスン"}</span>
          {lessonDate ? <span className="ml-2">（{lessonDate}）</span> : null}
        </div>
      )}

      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-5 space-y-4">
        <p className="text-sm font-semibold text-[--color-txt]">お客様情報</p>

        <div>
          <label className={labelCls}>お名前 <span className="text-red-400">*</span></label>
          <input name="name" required defaultValue={prefill.name} placeholder="山田 太郎" className={field} />
        </div>
        <div>
          <label className={labelCls}>フリガナ</label>
          <input name="name_kana" defaultValue={prefill.name_kana} placeholder="ヤマダ タロウ" className={field} />
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
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>携帯番号</label>
            <input name="mobile" type="tel" defaultValue={prefill.mobile} placeholder="090-1234-5678" className={field} />
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
            <label className={labelCls}>都道府県</label>
            <input name="prefecture" placeholder="兵庫県" className={field} />
          </div>
        </div>
        <div>
          <label className={labelCls}>住所（市区町村・番地）</label>
          <input name="address1" placeholder="宝塚市〇〇町1-2-3" className={field} />
        </div>
        <div>
          <label className={labelCls}>建物名・部屋番号</label>
          <input name="building" placeholder="〇〇マンション101" className={field} />
        </div>
      </div>

      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-5 space-y-4">
        <p className="text-sm font-semibold text-[--color-txt]">アンケート（任意）</p>
        <div>
          <label className={labelCls}>ゴルフ経験</label>
          <select name="golf_experience" defaultValue="" className={field}>
            <option value="">選択</option>
            <option value="未経験">未経験</option>
            <option value="初心者">初心者</option>
            <option value="経験者">経験者</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>当店を知ったきっかけ</label>
          <select name="trigger" defaultValue="" className={field}>
            <option value="">選択</option>
            <option value="HP">ホームページ</option>
            <option value="SNS">SNS（Instagram等）</option>
            <option value="チラシ">チラシ</option>
            <option value="紹介">友人・知人の紹介</option>
            <option value="通りがかり">通りがかり</option>
            <option value="その他">その他</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>体験の目的</label>
          <input name="purpose" placeholder="上達したい／健康のため 等" className={field} />
        </div>
        <div>
          <label className={labelCls}>現在のお悩み・課題</label>
          <input name="issue" placeholder="スライスを直したい 等" className={field} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dm_ok" value="1" defaultChecked className="h-5 w-5" />
          お得な情報の案内を受け取る
        </label>
      </div>

      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-5 space-y-3">
        <p className="text-sm font-semibold text-[--color-txt]">同意・署名</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" value="1" required className="mt-0.5 h-5 w-5" />
          <span>
            個人情報を体験・入会手続き及びサービス提供の目的で利用することに同意します。
            <span className="text-red-400">*</span>
          </span>
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
        <button type="button" onClick={clear} className="hover:text-[--color-txt]">
          消してやり直す
        </button>
      </div>
    </div>
  );
}
