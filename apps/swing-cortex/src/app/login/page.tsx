"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "./actions";

function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const params = useSearchParams();
  const denied = params.get("denied");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 4.9L18 9.7l-4.2 1.8L12 16l-1.8-4.5L6 9.7l4.2-1.8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            SWING <span className="text-(--color-brand)">CORTEX</span>
          </h1>
          <p className="mt-2 text-sm text-(--color-dim)">コーチング診断 — コーチログイン</p>
        </div>
        <form action={action} className="space-y-3 rounded-2xl border border-(--color-line) bg-(--color-panel) p-6 shadow-sm">
          <input name="id" placeholder="メールアドレス または ログインID" className="input-lite" autoComplete="username" />
          <input name="password" type="password" placeholder="パスワード" className="input-lite" autoComplete="current-password" />
          {state.error && <p className="text-sm text-red-500">{state.error}</p>}
          {denied && !state.error && (
            <p className="text-sm text-amber-500">診断へのアクセス権（use_coaching / view_hq）がありません</p>
          )}
          <button
            disabled={pending}
            className="w-full rounded-xl bg-(--color-brand) py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {pending ? "確認中..." : "ログイン"}
          </button>
        </form>
        <p className="mt-4 text-center">
          <a href="/manual" className="text-sm text-(--color-dim) underline underline-offset-2">使い方マニュアル</a>
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
