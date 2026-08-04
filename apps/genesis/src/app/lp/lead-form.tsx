"use client";

import { useState } from "react";

/**
 * LP共通の問い合わせフォーム（#101）。
 * POST /api/public/ai-sales/lead → PGA NOTEはSales OS（福原氏）、SWING CORTEXはCEO Inboxへ。
 * website はhoneypot（CSSで隠す・botだけが埋める）。
 */
export function LeadForm({ product, accent }: { product: "pganote" | "swing-cortex" | "webdesign"; accent: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      product,
      name: String(fd.get("name") ?? ""),
      org: String(fd.get("org") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      message: String(fd.get("message") ?? ""),
      website: String(fd.get("website") ?? ""),
    };
    if (!payload.name.trim() || (!payload.email.trim() && !payload.phone.trim())) {
      setError("お名前と、メールまたは電話番号のどちらかをご入力ください");
      setState("error");
      return;
    }
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/public/ai-sales/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("done");
      form.reset();
    } catch {
      setError("送信に失敗しました。時間をおいてもう一度お試しください");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/5 p-8 text-center">
        <p className="text-xl font-bold" style={{ color: accent }}>
          送信しました
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          お問い合わせありがとうございます。
          <br />
          担当者より1営業日以内にご連絡いたします。
        </p>
      </div>
    );
  }

  const input =
    "w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-white/40";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="name" placeholder="お名前 *" className={input} maxLength={80} />
        <input name="org" placeholder="スクール・施設名" className={input} maxLength={120} />
        <input name="email" type="email" placeholder="メールアドレス" className={input} maxLength={160} />
        <input name="phone" placeholder="電話番号" className={input} maxLength={40} />
      </div>
      <textarea
        name="message"
        placeholder="ご質問・現在のお悩みなど（任意）"
        rows={4}
        className={input}
        maxLength={2000}
      />
      {/* honeypot: 画面には出さない */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {state === "error" && <p className="text-sm text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-1 rounded-full px-8 py-4 text-base font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-60"
        style={{ background: accent }}
      >
        {state === "sending" ? "送信中..." : "資料請求・お問い合わせ（無料）"}
      </button>
      <p className="text-center text-xs text-white/40">運営: 株式会社YOZAN ／ 営業目的の送信はご遠慮ください</p>
    </form>
  );
}
