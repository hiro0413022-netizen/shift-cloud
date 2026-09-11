"use client";

import { useActionState } from "react";
import { submitEntry } from "./actions";

const field =
  "w-full rounded-xl border border-(--color-line) bg-white px-3 py-3 text-base outline-none focus:border-(--color-accent)";

export function EntryForm({ slug, waitlistMode }: { slug: string; waitlistMode: boolean }) {
  const [state, action, pending] = useActionState(submitEntry, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      <L label="お名前" required>
        <input name="name" required placeholder="山田 太郎" className={field} autoComplete="name" />
      </L>
      <L label="フリガナ">
        <input name="kana" placeholder="ヤマダ タロウ" className={field} />
      </L>
      <L label="電話番号" required>
        <input
          name="tel"
          type="tel"
          required
          inputMode="tel"
          placeholder="090-1234-5678"
          className={field}
          autoComplete="tel"
        />
      </L>
      <L label="メールアドレス">
        <input name="email" type="email" placeholder="example@email.com" className={field} autoComplete="email" />
      </L>
      <L label="ハンディキャップ（お持ちの方のみ）">
        <input name="hcp" type="number" step="0.1" min="0" max="54" placeholder="例: 15.0" className={field} />
      </L>
      <L label="ご要望・ご連絡事項">
        <textarea name="notes" rows={3} placeholder="同伴のご希望、送迎の要否など" className={field} />
      </L>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-(--color-accent) px-4 py-4 text-base font-bold text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : waitlistMode ? "キャンセル待ちで申し込む" : "この内容で申し込む"}
      </button>
      <p className="text-center text-xs text-(--color-dim)">
        ご記入いただいた内容は、本コンペの運営のみに使用します。
      </p>
    </form>
  );
}

function L({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-(--color-dim)">
        {label}
        {required && <span className="ml-1 text-red-600">必須</span>}
      </span>
      {children}
    </label>
  );
}
