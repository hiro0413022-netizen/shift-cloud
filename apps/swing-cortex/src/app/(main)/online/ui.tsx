"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** オンラインレッスン画面で使い回す小さな部品 */

export function SectionTitle({ en, ja, right }: { en: string; ja: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end gap-3">
      <div>
        <div className="rr-en text-[28px] font-semibold leading-none text-(--rr-ink)">{en}</div>
        <div className="mt-1 text-[12px] tracking-wider text-(--color-dim)">{ja}</div>
      </div>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  if (plan === "premium")
    return (
      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-[#b08d57] to-[#d4b27c] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
        PREMIUM
      </span>
    );
  if (plan === "regular")
    return <span className="inline-flex items-center rounded-full border border-(--color-line) px-2 py-0.5 text-[10px] font-bold tracking-wider text-(--color-dim)">REGULAR</span>;
  return <span className="inline-flex items-center rounded-full border border-dashed border-(--color-line) px-2 py-0.5 text-[10px] text-(--color-faint)">プラン未設定</span>;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const ch = name.replace(/[\s☆⚠️]/gu, "").slice(0, 1) || "?";
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-(--rr-gold-soft) font-semibold text-(--rr-gold)"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {ch}
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="rr-pop fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-(--rr-ink) px-5 py-2.5 text-sm text-white shadow-lg lg:bottom-8">
      {msg}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  return { msg, show };
}

/** クリップボードへ（iOS の古い Safari 向けに textarea 方式へ落とす） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export async function pasteText(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** 音声入力（Web Speech API）。使えない端末では supported=false */
export function useSpeech(onText: (t: string) => void) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const ref = useRef<{ stop: () => void } | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  const toggle = useCallback(() => {
    if (on) {
      ref.current?.stop();
      return;
    }
    type Rec = {
      lang: string; continuous: boolean; interimResults: boolean;
      onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
      onend: () => void; onerror: () => void; start: () => void; stop: () => void;
    };
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript);
      }
    };
    rec.onend = () => setOn(false);
    rec.onerror = () => setOn(false);
    ref.current = rec;
    rec.start();
    setOn(true);
  }, [on, onText]);
  return { supported, on, toggle };
}

/** 端末ごとの一時保存（書きかけを失わない）。使えない環境では何もしない */
export const draftStore = {
  get<T>(key: string): T | null {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できなくても画面は動く */
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  },
};

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const j = new Date(d.getTime() + 9 * 3600000);
  const md = `${j.getUTCMonth() + 1}/${j.getUTCDate()}`;
  const hm = `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
  return `${md} ${hm}`;
}

export function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return "たった今";
  if (h < 24) return `${Math.floor(h)}時間前`;
  const d = Math.floor(h / 24);
  if (d < 31) return `${d}日前`;
  return `${Math.floor(d / 30)}か月前`;
}

/** 中身に合わせて高さが伸びる入力欄（スマホで文が隠れないように） */
export function AutoTextarea({
  minRows = 3,
  className = "",
  value,
  inputRef,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; inputRef?: React.MutableRefObject<HTMLTextAreaElement | null> }) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = own.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      {...rest}
      value={value}
      rows={minRows}
      ref={(el) => {
        own.current = el;
        if (inputRef) inputRef.current = el;
      }}
      className={"resize-none overflow-hidden " + className}
    />
  );
}
