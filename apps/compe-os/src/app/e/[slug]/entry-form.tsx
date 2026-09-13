"use client";

import { useActionState } from "react";
import type { EntryQuestion } from "@/lib/compe";
import { submitEntry } from "./actions";

const field =
  "w-full rounded-xl border border-(--color-line) bg-white px-3 py-3 text-base outline-none focus:border-(--color-accent)";

export function EntryForm({
  slug,
  waitlistMode,
  questions,
  terms,
}: {
  slug: string;
  waitlistMode: boolean;
  questions: EntryQuestion[];
  terms: string | null;
}) {
  const [state, action, pending] = useActionState(submitEntry, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      <L label="お名前（漢字）" required>
        <input name="name" required placeholder="例：山田 太郎" className={field} autoComplete="name" />
      </L>
      <L label="フリガナ">
        <input name="kana" placeholder="例：ヤマダ タロウ" className={field} />
      </L>
      <L label="連絡先（電話番号）" required>
        <input
          name="tel"
          type="tel"
          required
          inputMode="tel"
          placeholder="例：090-1234-5678"
          className={field}
          autoComplete="tel"
        />
      </L>
      <L label="メールアドレス">
        <input name="email" type="email" placeholder="example@email.com" className={field} autoComplete="email" />
      </L>
      <L label="ハンディキャップ（お持ちの方のみ）">
        <input name="hcp" type="number" step="0.1" min="0" max="54" placeholder="例：15.0" className={field} />
      </L>
      <L label="性別">
        <select name="gender" defaultValue="" className={field}>
          <option value="">回答しない</option>
          <option value="male">男性</option>
          <option value="female">女性</option>
        </select>
      </L>

      {questions.map((q) => (
        <L key={q.id} label={q.label} required={q.required}>
          <div className="space-y-1">
            {q.options.map((o) => (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-(--color-line) px-3 py-3 text-base has-checked:border-(--color-accent) has-checked:bg-(--color-panel-2)"
              >
                <input type="radio" name={`q_${q.id}`} value={o} required={q.required} className="h-5 w-5" />
                {o}
              </label>
            ))}
          </div>
        </L>
      ))}

      <L label="ご質問・備考">
        <textarea
          name="notes"
          rows={3}
          placeholder="アレルギーや特別なご要望がある場合はこちらにご記入ください"
          className={field}
        />
      </L>

      {terms && (
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel-2) p-4">
          <p className="mb-2 text-sm font-bold">ご参加にあたってのお願い</p>
          <p className="mb-3 text-sm leading-relaxed whitespace-pre-wrap">{terms}</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm font-semibold has-checked:ring-2 has-checked:ring-(--color-accent)">
            <input type="checkbox" name="agree" value="1" required className="mt-0.5 h-5 w-5" />
            上記の注意事項を確認し、同意のうえ申し込みます。
            <span className="ml-auto shrink-0 text-xs font-normal text-red-600">必須</span>
          </label>
        </div>
      )}

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
