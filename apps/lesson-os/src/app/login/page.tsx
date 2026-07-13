"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "./actions";

const inputCls =
  "w-full rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2.5 text-sm placeholder:text-[--color-dim]";

function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const params = useSearchParams();
  const denied = params.get("denied");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-[0.4em] text-[--color-gold]">GOLF WING</p>
          <h1 className="text-3xl font-bold tracking-widest">Lesson OS</h1>
          <p className="mt-2 text-sm text-[--color-dim]">レッスンカルテ — コーチログイン</p>
        </div>
        <form action={action} className="space-y-4 rounded-xl border border-[--color-line] bg-[--color-panel] p-6">
          <input name="id" placeholder="メールアドレス または ログインID" className={inputCls} autoComplete="username" />
          <input name="password" type="password" placeholder="パスワード" className={inputCls} autoComplete="current-password" />
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          {denied && !state.error && (
            <p className="text-sm text-amber-400">レッスンカルテへのアクセス権（use_lesson / view_hq）がありません</p>
          )}
          <button
            disabled={pending}
            className="w-full rounded-lg bg-sky-500/20 py-2.5 text-sm font-medium text-sky-300 disabled:opacity-40"
          >
            {pending ? "確認中..." : "ログイン"}
          </button>
        </form>
        <p className="mt-4 text-center">
          <a href="/manual" className="text-sm text-[--color-dim] underline underline-offset-2">📖 使い方マニュアル</a>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
