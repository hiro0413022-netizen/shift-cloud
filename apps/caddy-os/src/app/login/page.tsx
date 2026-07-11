"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "./actions";
import { inputCls, btnCls } from "@/components/ui";

function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const params = useSearchParams();
  const denied = params.get("denied");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-[0.4em] text-[--color-gold]">YOZAN</p>
          <h1 className="text-3xl font-bold tracking-widest">Caddy OS</h1>
          <p className="mt-2 text-sm text-[--color-dim]">キャディ派遣の派遣管理・売上/委託料・収支 — スタッフログイン</p>
        </div>
        <form action={action} className="space-y-4 rounded-xl border border-[--color-line] bg-[--color-panel] p-6">
          <input name="id" placeholder="メールアドレス または ログインID" className={inputCls} autoComplete="username" />
          <input name="password" type="password" placeholder="パスワード" className={inputCls} autoComplete="current-password" />
          {state.error && <p className="text-sm text-red-500">{state.error}</p>}
          {denied && !state.error && (
            <p className="text-sm text-amber-600">アクセス権（use_caddy / view_hq）がありません</p>
          )}
          <button disabled={pending} className={`${btnCls} w-full justify-center`}>
            {pending ? "確認中..." : "ログイン"}
          </button>
        </form>
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
