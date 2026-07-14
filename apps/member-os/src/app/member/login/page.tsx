"use client";

import { useActionState } from "react";
import Link from "next/link";
import { memberLogin, type MemberFormState } from "../actions";

const field =
  "w-full rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-sky-500 focus:outline-none";
const label = "mb-1 block text-sm font-medium text-(--color-dim)";

export default function MemberLoginPage() {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(memberLogin, {});
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRUNK GOLF 姫路</p>
        <h1 className="text-2xl font-bold tracking-wide">会員ログイン</h1>
        <p className="mt-2 text-sm text-(--color-dim)">会員番号と生年月日でログインできます</p>
      </div>

      <form action={action} className="space-y-4 rounded-2xl border border-(--color-line) bg-(--color-panel) p-6">
        <div>
          <label className={label}>会員番号</label>
          <input name="member_no" required placeholder="010026..." className={field} />
        </div>
        <div>
          <label className={label}>生年月日</label>
          <input type="date" name="birth_date" required className={field} />
        </div>

        {state.error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>}

        <button
          disabled={pending}
          className="w-full rounded-xl bg-sky-600 py-4 text-lg font-semibold text-white transition-all hover:bg-sky-500 disabled:opacity-50"
        >
          {pending ? "確認中..." : "ログイン"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-(--color-dim)">
        はじめての方は{" "}
        <Link href="/member/register" className="font-semibold text-sky-300">新規登録</Link>
      </p>
    </main>
  );
}
