"use client";

import { useActionState, useState } from "react";
import { submitReception, type ReceptionState } from "./actions";
import {
  VISIT_TYPES, OCCUPATIONS, CONTACT_METHODS, REFERRAL_SOURCES,
  TRIAL_REASONS, FITTING_REASONS, SCHOOL_GOALS, JOIN_INTEREST,
} from "@/lib/walkin";

const field =
  "w-full rounded-xl border border-[--color-line] bg-white px-4 py-3 text-base text-[--color-txt] placeholder:text-[--color-dim]/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
const labelCls = "mb-1 block text-sm font-medium text-[--color-dim]";
const cardCls = "rounded-2xl border border-[--color-line] bg-[--color-panel] p-5 shadow-sm";

function CheckGroup({ name, options }: { name: string; options: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 rounded-lg border border-[--color-line] bg-white px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
          <input type="checkbox" name={name} value={o} className="h-5 w-5 accent-[--color-accent]" />
          {o}
        </label>
      ))}
    </div>
  );
}

export function ReceptionForm({ token, storeName }: { token: string; storeName: string | null }) {
  const [state, action, pending] = useActionState<ReceptionState, FormData>(submitReception, {});
  const [visitType, setVisitType] = useState("trial");

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">✓</div>
        <p className="mt-3 text-lg font-semibold">ご記入ありがとうございました</p>
        <p className="mt-2 text-sm text-[--color-dim]">受付が完了しました。タブレットをスタッフにお渡しください。</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 pb-10">
      <input type="hidden" name="token" value={token} />

      {storeName && (
        <div className="rounded-xl border border-[--color-line] bg-white p-3 text-center text-sm font-medium text-[--color-dim] shadow-sm">
          {storeName}
        </div>
      )}

      {/* 利用区分 */}
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-semibold text-[--color-txt]">本日のご利用 <span className="text-rose-500">*</span></p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {VISIT_TYPES.map((v) => (
            <label
              key={v.value}
              className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-3.5 text-sm font-medium transition-colors ${
                visitType === v.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-[--color-line] bg-white text-[--color-dim]"
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
      <div className={`${cardCls} space-y-4`}>
        <p className="text-sm font-semibold text-[--color-txt]">お客様情報</p>
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
      <div className={`${cardCls} space-y-4`}>
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

      {/* 同意 */}
      <div className={`${cardCls} space-y-3`}>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consent" value="1" required className="mt-0.5 h-5 w-5 accent-[--color-accent]" />
          <span>個人情報をサービス提供・入会手続きの目的で利用することに同意します。<span className="text-rose-500">*</span></span>
        </label>
      </div>

      {state.error && <p className="text-center text-sm text-rose-600">{state.error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? "送信中..." : "この内容で受付する"}
      </button>
    </form>
  );
}
