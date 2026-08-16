"use client";

import { useActionState, useRef, useState } from "react";
import { submitWebSignup, type WebSignupState } from "./actions";
import { yen } from "@/lib/frunk";
import { joinEstimate, validCoupon, JOIN_CAMPAIGN } from "@/lib/frank-billing-pure";
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

/** 「2026-09-11」→ その月から4か月分の「9月」「10月」「11月」「12月」表記 */
function monthLabels(baseYmd: string): [string, string, string, string] {
  const d = new Date(`${baseYmd}T12:00:00+09:00`);
  const names: string[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
    names.push(`${m.getUTCMonth() + 1}月`);
  }
  return names as [string, string, string, string];
}

export function WebJoinForm({ plans }: { plans: Plan[] }) {
  const [state, action, pending] = useActionState<WebSignupState, FormData>(submitWebSignup, {});
  const [planId, setPlanId] = useState(plans.find((p) => p.name.includes("レギュラー"))?.id ?? plans[0]?.id ?? "");
  const [signature, setSignature] = useState("");
  const [coupon, setCoupon] = useState("");
  const [step, setStep] = useState<"input" | "estimate">("input");
  const formRef = useRef<HTMLFormElement | null>(null);

  const todayYmd = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const plan = plans.find((p) => p.id === planId) ?? null;

  const toEstimate = () => {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    if (!signature) {
      alert("ご署名（電子サイン）をお願いします");
      return;
    }
    setStep("estimate");
    setTimeout(() => document.getElementById("join-estimate")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

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
    <form ref={formRef} action={action} className="space-y-4">
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
          このあと安全な決済ページ（Square）に進み、<span className="font-medium text-(--color-txt)">入会時のお支払い（入会金＋前取りの月会費）を1回で</span>
          お済ませいただきます。同時にカードが登録され、
          <span className="font-medium text-(--color-txt)">決済完了と同時にご入会が確定し、会員番号を発行</span>
          します（入会の控えPDFをメールでお送りします）。前取り期間のあとは、毎月自動でのお支払いになります。
        </div>
        <div>
          <label className={label}>クーポンコード（お持ちの方のみ）</label>
          <input name="coupon" autoCapitalize="none" autoCorrect="off" placeholder="例: FRANKGOLF2026" className={field}
            value={coupon} onChange={(e) => setCoupon(e.target.value)} />
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

      {/* ===== お見積り（#131）: 入力内容の確認と、その場でお支払いいただく金額 ===== */}
      {step === "estimate" && plan && (() => {
        const est = joinEstimate({
          monthlyExTax: Number(plan.monthly_price ?? 0),
          joiningFeeExTax: Number(plan.joining_fee ?? 0),
          applyDateYmd: todayYmd,
          // クーポン入力を見積に反映（#136。実決済側と同じ分岐。キャンペーン終了後にズレていた）
          couponWaivesJoiningFee: !!validCoupon(coupon),
        });
        const [m0, m1, m2, m3] = monthLabels(todayYmd);
        const row = "flex items-baseline justify-between gap-3 py-2 border-b border-(--color-line)/60";
        return (
          <div id="join-estimate" className={`${cardCls} space-y-3 border-(--color-gold)/60`}>
            <p className="text-base font-bold text-(--color-txt)">お見積り（{plan.name}）</p>
            <div className="text-sm">
              <div className={row}>
                <span>入会金</span>
                <span>
                  {est.campaign ? (
                    <>
                      <s className="text-(--color-dim)">{est.joiningFeeTaxIncluded.toLocaleString()}円</s>
                      <span className="ml-2 font-bold text-emerald-500">→ 0円（年内入会キャンペーン）</span>
                    </>
                  ) : (
                    <span className="font-bold">{est.joiningFeeCharged.toLocaleString()}円（税込）</span>
                  )}
                </span>
              </div>
              {est.campaign && (
                <div className={row}>
                  <span>月会費（{m0}分・入会月）</span>
                  <span>
                    <s className="text-(--color-dim)">{est.monthlyTaxIncluded.toLocaleString()}円</s>
                    <span className="ml-2 font-bold text-emerald-500">→ 0円（キャンペーン）</span>
                  </span>
                </div>
              )}
              <div className={row}>
                <span>月会費 前取り（{m1}分＋{m2}分）</span>
                <span className="font-bold">{est.monthlyTaxIncluded.toLocaleString()}円 × {est.prepaidMonths} ＝ {(est.monthlyTaxIncluded * est.prepaidMonths).toLocaleString()}円（税込）</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-3">
                <span className="font-bold">本日のお支払い合計</span>
                <span className="text-2xl font-bold text-(--color-gold)">{est.totalDueNow.toLocaleString()}円<span className="text-xs font-normal">（税込）</span></span>
              </div>
            </div>
            <ul className="space-y-1 rounded-xl bg-(--color-panel-2) p-3 text-xs text-(--color-dim)">
              {/* 前取りした{m1}{m2}分の自動課金はスキップされるため、カードへの自動請求は{m3}分から（#137） */}
              <li>・{m3}以降の月会費は、毎月「入会日と同じ日」にご登録カードへ自動でお支払いになります（{m1}分・{m2}分は本日お支払い済みのため請求されません）。</li>
              <li>・キャンペーンでのご入会は、<span className="font-semibold text-(--color-txt)">{JOIN_CAMPAIGN.minMonths}か月間の継続</span>をお願いしています。</li>
              <li>・上記の合計を、決済ページで<span className="font-semibold text-(--color-txt)">1回でお支払い</span>いただきます（分割されません）。</li>
              <li>・決済は安全な決済ページ（Square）で行います。決済完了と同時に会員番号を発行します。</li>
            </ul>
          </div>
        );
      })()}

      {state.error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-300">{state.error}</p>
      )}

      {step === "input" ? (
        <button type="button" onClick={toEstimate} className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white transition-colors hover:bg-accent/90">
          お見積りを確認する
        </button>
      ) : (
        <div className="space-y-2">
          <button disabled={pending || !signature} className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
            {pending ? "決済ページへ移動中..." : "この内容で決済に進む"}
          </button>
          <button type="button" onClick={() => setStep("input")} className="w-full rounded-xl border border-(--color-line) py-3 text-sm text-(--color-dim) hover:text-(--color-txt)">
            ← 入力内容を修正する
          </button>
        </div>
      )}
      <p className="text-center text-xs text-(--color-dim)">
        決済ページ（Square）でのお支払い完了と同時にご入会が確定し、会員番号と入会の控え（PDF）をメールでお送りします。
      </p>
    </form>
  );
}
