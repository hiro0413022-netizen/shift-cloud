"use client";

import { useState } from "react";
import { draft } from "./actions";
import {
  BRAND_LABEL,
  KB,
  KB_UPDATED_AT,
  intentsFor,
  type ReplyBrand,
  type ReplyChannel,
} from "@yozan/core/reply-kb";

const BRANDS: ReplyBrand[] = ["golfwing", "frank", "yozan"];
const ADJUSTS = ["もっと短く", "もっと丁寧に", "もっとやわらかく", "体験に誘う一言を足す"];

type Result = { reply: string; checks: string[] };

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
            value === o.v ? "bg-(--color-brand) font-semibold text-white" : "text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ReplyClient({ defaultBrand }: { defaultBrand: ReplyBrand }) {
  const [brand, setBrand] = useState<ReplyBrand>(defaultBrand);
  const [channel, setChannel] = useState<ReplyChannel>("line");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [adjustText, setAdjustText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(opts: { intentKey?: string | null; adjust?: string }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    const intentKey = opts.intentKey !== undefined ? opts.intentKey : lastIntent;
    if (opts.intentKey !== undefined) setLastIntent(opts.intentKey);
    const res = await draft({
      brand,
      channel,
      customerMessage: message,
      intentKey,
      customerName: name,
      staffNote: note,
      previousDraft: opts.adjust ? result?.reply : undefined,
      adjust: opts.adjust,
    });
    if (res.error) setError(res.error);
    else setResult({ reply: res.reply, checks: res.checks });
    setBusy(false);
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.reply);
      setCopied(true);
    } catch {
      setError("コピーできませんでした。文面を長押しして選択してください。");
    }
  }

  function changeBrand(b: ReplyBrand) {
    setBrand(b);
    setResult(null);
    setLastIntent(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
        <p className="text-xs font-medium text-zinc-500">どの窓口の返信？</p>
        <Seg
          value={brand}
          onChange={changeBrand}
          options={BRANDS.map((b) => ({ v: b, label: BRAND_LABEL[b].replace("株式会社", "") }))}
        />
        <Seg
          value={channel}
          onChange={setChannel}
          options={[
            { v: "line", label: "公式LINE" },
            { v: "email", label: "メール" },
          ]}
        />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <p className="mb-2 text-xs font-medium text-zinc-500">用件を押すだけで返信案ができます</p>
        <div className="flex flex-wrap gap-2">
          {intentsFor(brand).map((i) => (
            <button
              key={i.key}
              type="button"
              disabled={busy}
              onClick={() => run({ intentKey: i.key })}
              className={`rounded-full border px-3 py-1 text-xs disabled:opacity-40 ${
                lastIntent === i.key ? "border-(--color-brand) text-(--color-brand)" : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
        <label className="block text-xs font-medium text-zinc-500" htmlFor="reply-msg">
          お客様から届いた文面（貼り付けると、それに合わせて書きます）
        </label>
        <textarea
          id="reply-msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="例: 初心者でクラブも持っていないのですが、体験はできますか？土曜の午前は空いてますか？"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)"
        />
        <details>
          <summary className="cursor-pointer text-xs text-zinc-500">お名前・伝えたいこと（任意）</summary>
          <div className="mt-2 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="お客様のお名前（例: 山田）"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="返信に入れたい事実（例: 土曜10時と11時は空いている／担当から明日電話する）"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)"
            />
          </div>
        </details>
        <button
          type="button"
          disabled={busy || (!message.trim() && !lastIntent)}
          onClick={() => run({})}
          className="w-full rounded-lg bg-(--color-brand) px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "作成中…" : "返信文をつくる"}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-500">
              返信案（{BRAND_LABEL[brand]}／{channel === "line" ? "公式LINE" : "メール"}）— 直接編集できます
            </p>
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
            >
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
          <textarea
            value={result.reply}
            onChange={(e) => setResult({ ...result, reply: e.target.value })}
            rows={Math.min(16, Math.max(6, result.reply.split("\n").length + 1))}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-none focus:border-(--color-brand)"
          />
          {result.checks.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <p className="mb-1 font-semibold">送る前に確認</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {result.checks.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {ADJUSTS.map((a) => (
              <button
                key={a}
                type="button"
                disabled={busy}
                onClick={() => run({ adjust: a })}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40"
              >
                {a}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (adjustText.trim()) {
                run({ adjust: adjustText.trim() });
                setAdjustText("");
              }
            }}
            className="flex gap-2"
          >
            <input
              value={adjustText}
              onChange={(e) => setAdjustText(e.target.value)}
              placeholder="直したい点（例: 駐車場の案内も入れて）"
              disabled={busy}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs outline-none focus:border-(--color-brand)"
            />
            <button
              type="submit"
              disabled={busy || !adjustText.trim()}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs disabled:opacity-40"
            >
              直す
            </button>
          </form>
          <p className="text-[11px] text-zinc-400">
            送信はご自身で行ってください。空き状況や個別の契約内容はAIには分からないため、確認してから送ってください。
          </p>
        </div>
      )}

      <details className="rounded-lg border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-medium text-zinc-500">
          {BRAND_LABEL[brand]}の基本情報・料金を見る（AIが使う情報／{KB_UPDATED_AT}時点）
        </summary>
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-zinc-700">
          {KB[brand]}
        </pre>
      </details>
    </div>
  );
}
