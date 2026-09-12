"use client";

import { useState } from "react";
import { INQUIRY_KINDS, mailtoUrl, telHref } from "@/lib/inquiry";

// ============================================================
// 連絡先カード（#236）。押すとお客様のメールアプリ・LINE・電話が開く。
// サーバーからメールは送らない（外部の送信サービスを使わない＝無料枠を消費しない）。
//
// ⚠ メールアドレスはHTMLに平文で置かず、base64 を画面側で戻して表示する。
//    収集ロボットはJavaScriptを動かさないものが多く、迷惑メールが目に見えて減る。
// ============================================================

function decode(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return "";
  }
}

function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
      className="shrink-0 rounded-full border border-(--color-line) px-3 py-1.5 text-xs font-bold text-(--color-dim) transition hover:border-(--color-gold) hover:text-(--color-gold)"
    >
      {done ? "コピーしました" : label}
    </button>
  );
}

function Card({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-(--color-line) bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-panel) text-lg">
          {icon}
        </span>
        <div>
          <p className="font-black">{title}</p>
          <p className="text-xs text-(--color-dim)">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ContactMethods({
  proName,
  emailB64,
  lineUrl,
  instagram,
  phone,
  initialKind,
}: {
  proName: string;
  emailB64: string | null;
  lineUrl: string | null;
  instagram: string | null;
  phone: string | null;
  initialKind: string;
}) {
  // ?type=sponsor などで来たときは、その用件を選んだ状態で開く（1タップ減らす）
  const [kind, setKind] = useState<string>(initialKind || INQUIRY_KINDS[0].key);
  const email = emailB64 ? decode(emailB64) : "";

  return (
    <div className="space-y-5">
      {email ? (
        <Card icon="✉" title="メールで送る" desc="下のボタンでメールアプリが開きます（件名・書く項目が入った状態）">
          <p className="mb-2 text-xs font-bold text-(--color-dim)">ご用件を選んでください</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {INQUIRY_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                  kind === k.key
                    ? "border-(--color-gold) bg-(--color-gold) text-white"
                    : "border-(--color-line) text-(--color-txt) hover:border-(--color-gold) hover:text-(--color-gold)"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <a
            href={mailtoUrl(email, kind, proName)}
            className="inline-flex w-full items-center justify-center rounded-full bg-(--color-ink) px-6 py-4 text-base font-bold text-white transition hover:bg-(--color-ink-2)"
          >
            メールアプリで書く
          </a>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-(--color-panel) px-3 py-2">
            <span className="truncate text-sm">{email}</span>
            <CopyButton text={email} label="アドレスをコピー" />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-(--color-dim)">
            ボタンで何も開かないときは、アドレスをコピーしてお使いのメールから送ってください。
          </p>
        </Card>
      ) : null}

      {lineUrl ? (
        <Card icon="💬" title="LINEで送る" desc="友だち追加して、そのままトークで送れます">
          <a
            href={lineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-full bg-[#06C755] px-6 py-4 text-base font-bold text-white transition hover:opacity-90"
          >
            LINEで連絡する
          </a>
        </Card>
      ) : null}

      {instagram ? (
        <Card icon="📷" title="Instagramで送る" desc={`@${instagram} のDMが開きます`}>
          <a
            href={`https://ig.me/m/${instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-full border border-(--color-ink) px-6 py-4 text-base font-bold transition hover:bg-(--color-ink) hover:text-white"
          >
            InstagramのDMを開く
          </a>
        </Card>
      ) : null}

      {phone ? (
        <Card icon="☎" title="お電話" desc="スマートフォンはタップで発信できます">
          <div className="flex items-center justify-between gap-3">
            <a href={telHref(phone)} className="text-2xl font-black tracking-wide text-(--color-gold)">
              {phone}
            </a>
            <CopyButton text={phone} label="番号をコピー" />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
