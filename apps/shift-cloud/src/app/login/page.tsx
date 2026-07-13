"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-semibold tracking-tight">YOZAN Shift Cloud</p>
          <p className="mt-1 text-sm text-zinc-500">シフト・勤怠・給与・店舗運営をひとつに。</p>
        </div>
        <form action={action} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div>
            <Label>メールアドレス または ログインID</Label>
            <Input name="id" autoComplete="username" required />
          </div>
          <div>
            <Label>パスワード</Label>
            <Input name="password" type="password" autoComplete="current-password" required />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "ログイン中…" : "ログイン"}
          </Button>
        </form>
        <p className="mt-4 text-center">
          <a href="/manual" className="text-sm text-zinc-400 underline underline-offset-2">📖 使い方マニュアル</a>
        </p>
      </div>
    </main>
  );
}
