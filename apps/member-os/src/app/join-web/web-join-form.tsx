"use client";

import { useActionState, useState } from "react";
import { submitWebSignup, type WebSignupState } from "./actions";
import { yen } from "@/lib/frunk";
import { FRANK_TERMS_TEXT, FRANK_PRIVACY_URL } from "@/lib/frank-terms";
import { AddressFields } from "@/components/address-fields";
import { BirthDateInput } from "@/components/birth-date-input";
import { NameFields } from "@/components/name-fields";
import { SignaturePad } from "@/components/signature-pad";

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
  const [signature, setSignature] = useState("");

  if (state.ok) {
    // Square未設定環境のフォールバック（通常は決済ページへリダイレクトするためここには来ない）
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
          <NameFields
            inputClassName={field}
            labelClassName={label}
            requiredMark={<span className="text-rose-400"> *</span>}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <BirthDateInput inputClassName={field} labelClassName={label} className="col-span-2" />
          <div className="col-span-2">
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
          <div><label className={label}>電話番号 <span className="text-rose-400">*</span></label><input name="phone" type="tel" required placeholder="090-1234-5678" className={field} /></div>
          <div><label className={label}>メールアドレス <span className="text-rose-400">*</span></label><input name="email" type="email" required placeholder="example@mail.com" className={field} /></div>
        </div>
        <p className="text-xs text-(--color-dim)">※ 会員ページのログインに電話番号下4桁を、入会の控え（PDF）の送付にメールアドレスを使用します</p>
        <div className="grid grid-cols-2 gap-3">
          <AddressFields inputClassName={field} labelClassName={label} wideClassName="col-span-2" />
        </div>
        <div>
          <label className={label}>ご利用開始希望日</label>
          <input type="date" name="start_date" className={field} />
        </div>
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-sm text-(--color-dim)">
          <span className="font-medium text-(--color-txt)">お支払いはクレジットカードのみ</span>
          <br />
          このあと安全な決済ページ（Square）に進み、初回月会費のお支払いとカード登録を行います。
          <span className="font-medium text-(--color-txt)">決済完了と同時にご入会が確定し、会員番号を発行</span>
          します（入会の控えPDFをメールでお送りします）。月会費は以後毎月自動でお支払いになります。
        </div>
        <div>
          <label className={label}>クーポンコード（お持ちの方のみ）</label>
          <input name="coupon" autoCapitalize="none" autoCorrect="off" placeholder="例: FRANKGOLF2026" className={field} />
          <p className="mt-1 text-xs text-(--color-dim)">ご紹介などのクーポンコードをお持ちの方はご入力ください（入会金が無料になります）</p>
        </div>
      </div>

      {/* 規約・同意・電子サイン */}
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-semibold text-(--color-txt)">会員規約のご確認・同意 <span className="text-rose-400">*</span></p>
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-(--color-line) bg-(--color-panel-2) p-4 text-xs leading-relaxed text-(--color-dim)">
          {FRANK_TERMS_TEXT}
        </div>
        <label className="flex items-start gap-3 text-sm text-(--color-dim)">
          <input type="checkbox" name="consent_privacy" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
          <span>
            <a href={FRANK_PRIVACY_URL} target="_blank" rel="noopener" className="font-medium text-(--color-gold) underline">プライバシーポリシー</a>
            に同意し、個人情報を入会手続き・サービス提供の目的で利用することに同意します。<span className="text-rose-400">*</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-(--color-dim)">
          <input type="checkbox" name="consent_terms" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
          <span>上記の会員規約（休会・退会の規定を含む）を確認し、同意します。<span className="text-rose-400">*</span></span>
        </label>
        <div>
          <p className="mb-1 text-sm font-medium text-(--color-dim)">ご署名（電子サイン） <span className="text-rose-400">*</span></p>
          <SignaturePad value={signature} onChange={setSignature} />
          <input type="hidden" name="signature" value={signature} />
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300">{state.error}</p>
      )}

      <button disabled={pending || !signature} className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
        {pending ? "決済ページへ移動中..." : "同意して決済に進む"}
      </button>
      <p className="text-center text-xs text-(--color-dim)">
        このあと安全な決済ページ（Square）で初回月会費をお支払いいただくと、その場でご入会が確定し会員番号が発行されます。
      </p>
    </form>
  );
}
