"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { INQUIRY_KINDS, INQUIRY_LIMITS } from "@/lib/inquiry";
import { submitContactAction, type ContactState } from "./actions";

function Req() {
  return <span className="ml-2 rounded-sm bg-(--color-gold) px-1.5 py-0.5 text-[10px] font-bold text-white">必須</span>;
}
function Opt() {
  return <span className="ml-2 rounded-sm border border-(--color-line) px-1.5 py-0.5 text-[10px] text-(--color-dim)">任意</span>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center rounded-full bg-(--color-ink) px-6 py-4 text-base font-bold tracking-wide text-white transition hover:bg-(--color-ink-2) disabled:opacity-60 md:w-auto md:min-w-72"
    >
      {pending ? "送信しています…" : "送信する"}
    </button>
  );
}

const field = "w-full rounded-lg border border-(--color-line) bg-white px-4 py-3 text-base outline-none transition focus:border-(--color-gold) focus:ring-2 focus:ring-(--color-gold)/20";

export default function ContactForm({
  slug,
  stamp,
  initialKind,
}: {
  slug: string;
  stamp: string;
  initialKind: string;
}) {
  const initial: ContactState = {
    ok: false,
    error: null,
    values: { kind: initialKind, name: "", company: "", email: "", phone: "", message: "" },
    seq: 0,
  };
  const [state, action] = useActionState(submitContactAction, initial);

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) px-6 py-12 text-center" role="status">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-(--color-gold) text-2xl text-white">✓</div>
        <p className="sec-title mb-2 text-xs uppercase text-(--color-gold)">Thank you</p>
        <h2 className="mb-4 text-xl font-black">送信が完了しました</h2>
        <p className="mx-auto max-w-md text-sm leading-7 text-(--color-dim)">
          お問い合わせいただき、ありがとうございます。
          <br />
          内容を確認のうえ、ご入力いただいたメールアドレスへご連絡いたします。
        </p>
        <Link
          href={`/${slug}`}
          className="mt-8 inline-block rounded-full border border-(--color-ink) px-8 py-3 text-sm font-bold hover:bg-(--color-ink) hover:text-white"
        >
          TOPへ戻る
        </Link>
      </div>
    );
  }

  const v = state.values;
  return (
    <form key={state.seq} action={action} className="space-y-7" noValidate={false}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="stamp" value={stamp} />
      {/* ハニーポット: 人には見えない・読み上げない・フォーカスしない */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-(--color-danger)">
          {state.error}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-3 text-sm font-bold">
          お問い合わせの種類
          <Req />
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {INQUIRY_KINDS.map((k) => (
            <label
              key={k.key}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--color-line) bg-white p-4 transition has-[:checked]:border-(--color-gold) has-[:checked]:bg-(--color-panel)"
            >
              <input
                type="radio"
                name="kind"
                value={k.key}
                required
                defaultChecked={v.kind === k.key}
                className="mt-1 h-4 w-4 accent-(--color-gold)"
              />
              <span>
                <span className="block font-bold">{k.label}</span>
                <span className="mt-0.5 block text-xs text-(--color-dim)">{k.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="mb-2 block text-sm font-bold">
            お名前
            <Req />
          </label>
          <input id="c-name" name="name" required maxLength={INQUIRY_LIMITS.name} autoComplete="name" defaultValue={v.name} placeholder="山田 太郎" className={field} />
        </div>
        <div>
          <label htmlFor="c-company" className="mb-2 block text-sm font-bold">
            会社・団体名
            <Opt />
          </label>
          <input id="c-company" name="company" maxLength={INQUIRY_LIMITS.company} autoComplete="organization" defaultValue={v.company} placeholder="株式会社〇〇" className={field} />
        </div>
        <div>
          <label htmlFor="c-email" className="mb-2 block text-sm font-bold">
            メールアドレス
            <Req />
          </label>
          <input id="c-email" name="email" type="email" required maxLength={INQUIRY_LIMITS.email} autoComplete="email" inputMode="email" defaultValue={v.email} placeholder="example@mail.com" className={field} />
        </div>
        <div>
          <label htmlFor="c-phone" className="mb-2 block text-sm font-bold">
            電話番号
            <Opt />
          </label>
          <input id="c-phone" name="phone" type="tel" maxLength={INQUIRY_LIMITS.phone} autoComplete="tel" inputMode="tel" defaultValue={v.phone} placeholder="090-1234-5678" className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="c-message" className="mb-2 block text-sm font-bold">
          お問い合わせ内容
          <Req />
        </label>
        <textarea
          id="c-message"
          name="message"
          required
          rows={8}
          minLength={INQUIRY_LIMITS.messageMin}
          maxLength={INQUIRY_LIMITS.messageMax}
          defaultValue={v.message}
          placeholder="ご依頼の場合は、媒体・イベント名、希望日時、場所などをご記入いただくとスムーズです。"
          className={`${field} leading-7`}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
        <input type="checkbox" name="agree" required className="h-4 w-4 accent-(--color-gold)" />
        個人情報の取り扱いに同意する
      </label>

      <div className="text-center">
        <SubmitButton />
      </div>
    </form>
  );
}
