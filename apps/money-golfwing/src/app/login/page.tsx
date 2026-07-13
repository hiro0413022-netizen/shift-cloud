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
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">GOLF WING</p>
          <h1 className="text-3xl font-bold tracking-widest">お金管理</h1>
          <p className="mt-2 text-sm text-(--color-dim)">Money OS — スタッフログイン</p>
        </div>
        <form action={action} className="space-y-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-6">
          <input name="id" placeholder="メールアドレス または ログインID" className={inputCls} autoComplete="username" />
          <input name="password" type="password" placeholder="パスワード" className={inputCls} autoComplete="current-password" />
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          {denied && !state.error && (
            <p className="text-sm text-amber-400">お金管理へのアクセス権（mon_grants / view_hq）がありません</p>
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
