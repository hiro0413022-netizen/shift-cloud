"use client";

import { useActionState } from "react";
import Link from "next/link";
import { memberRegister, type MemberFormState } from "../actions";

const field =
  "w-full rounded-xl border border-[--color-line] bg-[--color-panel-2] px-4 py-3 text-base text-[--color-txt] placeholder:text-[--color-dim]/60 focus:border-sky-500 focus:outline-none";
const label = "mb-1 block text-sm font-medium text-[--color-dim]";

export default function MemberRegisterPage() {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(memberRegister, {});
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-[--color-gold]">FRUNK GOLF 姫路</p>
        <h1 className="text-2xl font-bold tracking-wide">新規登録</h1>
        <p className="mt-2 text-sm text-[--color-dim]">登録後すぐにWeb予約をご利用いただけます</p>
      </div>

      <form action={action} className="space-y-4 rounded-2xl border border-[--color-line] bg-[--color-panel] p-6">
        <div>
          <label className={label}>お名前 <span className="text-red-400">*</span></label>
          <input name="name" required placeholder="山田 太郎" className={field} />
        </div>
        <div>
          <label className={label}>フリガナ</label>
          <input name="name_kana" placeholder="ヤマダ タロウ" className={field} />
        </div>
        <div>
          <label className={label}>生年月日 <span className="text-red-400">*</span></label>
          <input type="date" name="birth_date" required className={field} />
          <p className="mt-1 text-xs text-[--color-dim]">次回以降のログインに使用します</p>
        </div>
        <div>
          <label className={label}>電話番号</label>
          <input name="phone" type="tel" placeholder="090-1234-5678" className={field} />
        </div>
        <div>
          <label className={label}>メールアドレス</label>
          <input name="email" type="email" placeholder="example@mail.com" className={field} />
        </div>

        {state.error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>}

        <button
          disabled={pending}
          className="w-full rounded-xl bg-sky-600 py-4 text-lg font-semibold text-white transition-all hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? "登録中..." : "登録してはじめる"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-[--color-dim]">
        既に会員番号をお持ちの方は{" "}
        <Link href="/member/login" className="font-semibold text-sky-300">ログイン</Link>
      </p>
    </main>
  );
}
