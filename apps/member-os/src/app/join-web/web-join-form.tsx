"use client";

import { useActionState, useState } from "react";
import { submitWebSignup, type WebSignupState } from "./actions";
import { FRUNK_PAYMENT_METHODS, yen } from "@/lib/frunk";
import { termsUrl, privacyUrl } from "@/lib/site";

function Doc({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span className="font-medium text-(--color-txt)">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener" className="font-medium text-(--color-gold) underline">
      {children}
    </a>
  );
}

type Plan = {
  id: string;
  name: string;
  monthly_price: number | null;
  joining_fee: number | null;
  max_bookings_per_day: number | null;
  note: string | null;
};

const field =
  "w-full rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
const label = "mb-1 block text-sm font-medium text-(--color-dim)";
const cardCls = "rounded-2xl border border-(--color-line) bg-(--color-panel) p-5";

export function WebJoinForm({ plans }: { plans: Plan[] }) {
  const [state, action, pending] = useActionState<WebSignupState, FormData>(submitWebSignup, {});
  const [planId, setPlanId] = useState(plans.find((p) => p.name.includes("レギュラー"))?.id ?? plans[0]?.id ?? "");

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-(--color-panel) p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-3xl text-emerald-400">✓</div>
        <p className="mt-3 text-lg font-semibold">入会のお申し込みありがとうございました</p>
        <p className="mt-2 text-sm text-(--color-dim)">
          内容をスタッフが確認し、折り返しご連絡いたします。<br />確定後、会員としてWeb予約をご利用いただけます。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {/* プラン選択 */}
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-semibold text-(--color-txt)">ご希望のプラン <span className="text-rose-400">*</span></p>
        {plans.length === 0 ? (
          <p className="text-sm text-(--color-dim)">現在ご案内できるプランがありません。お手数ですが店舗にお問い合わせください。</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {plans.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                  planId === p.id ? "border-accent bg-accent/10" : "border-(--color-line) bg-(--color-panel-2)"
                }`}
              >
                <input type="radio" name="plan_id" value={p.id} className="sr-only" required
                  checked={planId === p.id} onChange={() => setPlanId(p.id)} />
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-(--color-txt)">{p.name}</span>
                  {p.monthly_price != null && (
                    <span className="text-sm font-bold text-accent">{yen(p.monthly_price)}<span className="text-xs font-normal text-(--color-dim)">/月</span></span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-(--color-dim)">
                  {p.joining_fee != null && <div>入会金 {yen(p.joining_fee)}</div>}
                  {p.note && <div>{p.note}</div>}
                </div>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-(--color-dim)">※ 表示金額はすべて税抜（月額）です。</p>
      </div>

      {/* お客様情報 */}
      <div className={`${cardCls} space-y-4`}>
        <p className="text-sm font-semibold text-(--color-txt)">お客様情報</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>お名前 <span className="text-rose-400">*</span></label><input name="name" required placeholder="山田 太郎" className={field} /></div>
          <div><label className={label}>フリガナ</label><input name="name_kana" placeholder="ヤマダ タロウ" className={field} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>生年月日</label><input type="date" name="birth_date" className={field} /></div>
          <div>
            <label className={label}>性別</label>
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
          <div><label className={label}>電話番号</label><input name="phone" type="tel" placeholder="090-1234-5678" className={field} /></div>
          <div><label className={label}>メールアドレス</label><input name="email" type="email" placeholder="example@mail.com" className={field} /></div>
        </div>
        <p className="text-xs text-(--color-dim)">※ 電話・メールのいずれかは必須です</p>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={label}>郵便番号</label><input name="postal_code" placeholder="670-0000" className={field} /></div>
          <div className="col-span-2"><label className={label}>ご住所</label><input name="address" placeholder="兵庫県姫路市〇〇町1-2-3" className={field} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>お支払い方法</label>
            <select name="payment_method" defaultValue="" className={field}>
              <option value="">選択</option>
              {FRUNK_PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div><label className={label}>ご利用開始希望日</label><input type="date" name="start_date" className={field} /></div>
        </div>
      </div>

      {/* 同意 */}
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-semibold text-(--color-txt)">ご確認・同意</p>
        <label className="flex items-start gap-3 text-sm text-(--color-dim)">
          <input type="checkbox" name="consent_privacy" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
          <span><Doc href={privacyUrl()}>プライバシーポリシー</Doc>に同意し、個人情報を入会手続き・サービス提供の目的で利用することに同意します。<span className="text-rose-400">*</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm text-(--color-dim)">
          <input type="checkbox" name="consent_terms" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
          <span><Doc href={termsUrl()}>会員規約</Doc>（休会・退会の規定を含む）を確認し、同意します。<span className="text-rose-400">*</span></span>
        </label>
      </div>

      {state.error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300">{state.error}</p>
      )}

      <button disabled={pending} className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
        {pending ? "送信中..." : "この内容で入会を申し込む"}
      </button>
      <p className="text-center text-xs text-(--color-dim)">お申し込み後、スタッフが確認し折り返しご連絡します。確定をもって入会となります（オンライン決済はありません）。</p>
    </form>
  );
}
