"use client";

import { useActionState } from "react";
import { submitTrial, type TrialState } from "./actions";
import { TRIAL_EXPERIENCE } from "@/lib/trial";
import { privacyUrl } from "@/lib/site";

const field =
  "w-full rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
const label = "mb-1 block text-sm font-medium text-(--color-dim)";

export function TrialForm() {
  const [state, action, pending] = useActionState<TrialState, FormData>(submitTrial, {});

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-(--color-panel) p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-3xl text-emerald-400">✓</div>
        <p className="mt-3 text-lg font-semibold">体験のお申し込みを受け付けました</p>
        <p className="mt-2 text-sm text-(--color-dim)">
          担当より、日程確定のご連絡を差し上げます。<br />プレオープン日に向けて順次ご対応いたします。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-(--color-line) bg-(--color-panel) p-6">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>お名前 <span className="text-rose-400">*</span></label>
          <input name="name" required placeholder="山田 太郎" className={field} />
        </div>
        <div>
          <label className={label}>フリガナ</label>
          <input name="name_kana" placeholder="ヤマダ タロウ" className={field} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>電話番号</label>
          <input name="phone" type="tel" placeholder="090-1234-5678" className={field} />
        </div>
        <div>
          <label className={label}>メールアドレス</label>
          <input name="email" type="email" placeholder="example@mail.com" className={field} />
        </div>
      </div>
      <p className="text-xs text-(--color-dim)">※ 電話・メールのいずれかは必須です（日程確定のご連絡に使用します）</p>

      <div>
        <label className={label}>第1希望日時 <span className="text-rose-400">*</span></label>
        <input name="pref1" required placeholder="例）9/6(土) 14時ごろ" className={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>第2希望日時</label>
          <input name="pref2" placeholder="例）9/7(日) 午前" className={field} />
        </div>
        <div>
          <label className={label}>第3希望日時</label>
          <input name="pref3" placeholder="例）平日夜でも可" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>ゴルフ経験</label>
        <select name="experience" defaultValue="" className={field}>
          <option value="">選択してください</option>
          {TRIAL_EXPERIENCE.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>ご質問・ご要望</label>
        <textarea name="message" rows={3} placeholder="レフティ希望、当日クラブを借りたい、見学だけ希望 など" className={field} />
      </div>

      <label className="flex items-start gap-3 text-sm text-(--color-dim)">
        <input type="checkbox" name="consent_privacy" value="1" required className="mt-1 h-5 w-5 accent-(--color-accent)" />
        <span>
          {privacyUrl() ? (
            <a href={privacyUrl() as string} target="_blank" rel="noopener" className="font-medium text-(--color-gold) underline">プライバシーポリシー</a>
          ) : (
            <span className="font-medium text-(--color-txt)">プライバシーポリシー</span>
          )}
          に同意し、個人情報を体験受付・ご連絡の目的で利用することに同意します。<span className="text-rose-400">*</span>
        </span>
      </label>

      {state.error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{state.error}</p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? "送信中..." : "この内容で体験を申し込む"}
      </button>
      <p className="text-center text-xs text-(--color-dim)">送信後、担当より折り返しご連絡します。確定をもって予約成立となります。</p>
    </form>
  );
}
