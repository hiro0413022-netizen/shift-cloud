"use client";

import { useActionState } from "react";
import { castLogin } from "./actions";

export default function CastLoginPage() {
  const [state, action, pending] = useActionState(castLogin, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="mb-8 text-center">
        <p className="text-[11px] tracking-[0.4em] text-(--color-gold)">CAST</p>
        <h1 className="mn text-2xl font-bold">給与とシフト</h1>
        <p className="mt-2 text-xs text-(--color-dim)">お店に登録した携帯番号でログインしてください</p>
      </div>
      <form action={action} className="flex flex-col gap-3 rounded-2xl border border-(--color-line) bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-[11px] text-(--color-dim)">携帯番号</span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="09012345678"
            className="min-h-12 w-full rounded-lg border border-(--color-line) px-3 text-base"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-(--color-dim)">暗証番号（4桁）</span>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="current-password"
            placeholder="････"
            className="min-h-12 w-full rounded-lg border border-(--color-line) px-3 text-base tracking-[0.5em]"
          />
        </label>
        {state.error && <p className="text-xs text-(--color-accent)">{state.error}</p>}
        <button disabled={pending} className="min-h-12 rounded-lg bg-(--color-accent) text-sm font-bold text-white disabled:opacity-50">
          {pending ? "確認中..." : "ログイン"}
        </button>
        <p className="text-[10px] leading-relaxed text-(--color-mute)">
          暗証番号が分からないときは、お店の方に再発行をお願いしてください。
        </p>
      </form>
    </main>
  );
}
