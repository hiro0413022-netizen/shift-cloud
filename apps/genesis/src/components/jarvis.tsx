"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { talkToJarvis } from "@/app/(main)/jarvis-actions";
import type { JarvisReply } from "@/lib/jarvis";

/* ============================================================
   JARVIS — ホームの対話AI（DECISIONS #182）

   ユーザー依頼（2026-08-28）:
     「ジェネシスのホームで、アイアンマンのジャービスのような会話型のAIにしたい」

   設計:
     - 起動と同時に "喋る"。押さないと何も起きない画面にしない。
       最初の一言はLLMを使わずサーバー側で組み立てた文（openingLine）なので、
       APIが落ちていても・課金が発生しなくても必ず出る。
     - 音声出力は /api/jarvis/speak（Gemini/OpenAI）。キーが無ければ
       ブラウザ内蔵の speechSynthesis に落ちる＝無音にならない。
     - 音声入力は Web Speech API（Chrome/Edge）。非対応ブラウザではマイクを出さない。
     - ブラウザは"ユーザー操作なしの自動再生"を止めるので、最初の1回だけ
       画面のどこかを触るまで声を保留し、その旨を小さく出す。
   ============================================================ */

type Msg = {
  role: "user" | "assistant";
  text: string;
  link?: { href: string; label: string } | null;
  dev?: { id: string; title: string } | null;
  sql?: string | null;
  rowCount?: number | null;
  intent?: string;
};

const VOICE_KEY = "gn.jarvis.voice";

const SUGGESTIONS = [
  "今日はどんな状況？",
  "今月の売上は？",
  "承認待ちを教えて",
  "体験からの入会率は？",
];

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function Jarvis({ opening, name }: { opening: string; name: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: opening, intent: "brief" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const spokeOpening = useRef(false);

  /* ---------- 声を出す ---------- */
  const speak = useCallback(async (text: string) => {
    if (!text) return;
    try {
      const res = await fetch("/api/jarvis/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 200) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const el = audioRef.current ?? new Audio();
        audioRef.current = el;
        el.src = url;
        el.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        setSpeaking(true);
        await el.play();
        setNeedsGesture(false);
        return;
      }
      // 204（キー未設定）・401 などはブラウザ内蔵音声へ
      browserSpeak(text, setSpeaking);
    } catch {
      // 自動再生が拒否された（初回のユーザー操作前）
      setSpeaking(false);
      setNeedsGesture(true);
    }
  }, []);

  /* ---------- 起動時に最初の一言を喋る ---------- */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VOICE_KEY);
      if (saved === "off") setVoiceOn(false);
    } catch {
      /* プライベートモード等 */
    }
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSttSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    if (spokeOpening.current || !voiceOn) return;
    spokeOpening.current = true;
    void speak(opening);
  }, [voiceOn, opening, speak]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const toggleVoice = () => {
    setVoiceOn((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(VOICE_KEY, next ? "on" : "off");
      } catch {
        /* noop */
      }
      if (!next) {
        audioRef.current?.pause();
        window.speechSynthesis?.cancel();
        setSpeaking(false);
      }
      return next;
    });
  };

  /* ---------- 送る ---------- */
  const send = useCallback(
    async (said: string, mode: "text" | "voice") => {
      const q = said.trim();
      if (!q || busy) return;
      setInput("");
      setBusy(true);
      const history = msgs.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      setMsgs((prev) => [...prev, { role: "user", text: q }]);
      try {
        const r: JarvisReply = await talkToJarvis(q, history, mode);
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", text: r.reply, link: r.link, dev: r.dev, sql: r.sql, rowCount: r.rowCount, intent: r.intent },
        ]);
        if (voiceOn) void speak(r.reply);
      } catch {
        setMsgs((prev) => [...prev, { role: "assistant", text: "うまく処理できませんでした。もう一度お願いします。", intent: "error" }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, msgs, speak, voiceOn]
  );

  /* ---------- マイク ---------- */
  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "ja-JP";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += t;
        else interim += t;
      }
      setInput(finalText || interim);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) void send(finalText, "voice");
    };
    // 聞き取り中は自分の声を聞かないよう読み上げを止める
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setListening(true);
    rec.start();
  };

  const latest = msgs[msgs.length - 1];
  const showThread = msgs.length > 1;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-sky-900/50 bg-[radial-gradient(120%_140%_at_15%_0%,#0f1a2e_0%,#0d1119_55%,#0b0e15_100%)] p-4 sm:p-5"
      onClick={() => {
        // 自動再生が拒否されていたら、最初のクリックで喋り直す
        if (needsGesture && voiceOn && latest?.role === "assistant") {
          setNeedsGesture(false);
          void speak(latest.text);
        }
      }}
    >
      {/* ヘッダー */}
      <div className="mb-3 flex items-center gap-3">
        <Orb state={busy ? "thinking" : listening ? "listening" : speaking ? "speaking" : "idle"} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.35em] text-(--color-gold)">YOZAN</p>
          <p className="text-sm font-semibold tracking-wide">
            GENESIS
            <span className="ml-2 text-xs font-normal text-(--color-dim)">
              {busy ? "考えています…" : listening ? "聞いています…" : speaking ? "話しています…" : `${name}さんの分身`}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={toggleVoice}
          title={voiceOn ? "読み上げを止める" : "読み上げを再開する"}
          className="rounded-lg border border-(--color-line) px-2.5 py-1.5 text-sm hover:bg-(--color-panel-2)"
        >
          {voiceOn ? "🔊" : "🔇"}
        </button>
      </div>

      {/* 会話 */}
      {showThread && (
        <div ref={threadRef} className="mb-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {msgs.slice(0, -1).map((m, i) => (
            <Bubble key={i} msg={m} />
          ))}
        </div>
      )}

      {/* 最新の発話は大きく */}
      {latest && (
        <div className="mb-4">
          {latest.role === "assistant" ? (
            <>
              <p className="text-lg leading-relaxed text-sky-50">{latest.text}</p>
              <Extras msg={latest} />
            </>
          ) : (
            <Bubble msg={latest} />
          )}
          {busy && <p className="mt-2 text-sm text-(--color-dim)">…</p>}
        </div>
      )}

      {/* 入力 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input, "text");
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "聞いています…" : "話しかける、または入力してください"}
          className="min-w-0 flex-1 rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-sm outline-none focus:border-sky-700"
        />
        {sttSupported && (
          <button
            type="button"
            onClick={toggleMic}
            title={listening ? "止める" : "マイクで話す"}
            className={`rounded-xl border px-3.5 py-3 text-sm transition-colors ${
              listening ? "border-red-600 bg-red-950/50 text-red-200" : "border-(--color-line) hover:bg-(--color-panel-2)"
            }`}
          >
            {listening ? "■" : "🎤"}
          </button>
        )}
        <button type="submit" disabled={busy || !input.trim()} className="btn-main disabled:opacity-40">
          送る
        </button>
      </form>

      {/* 例示（最初だけ） */}
      {!showThread && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s, "text")}
              className="rounded-full border border-(--color-line) px-3 py-1 text-xs text-(--color-dim) hover:border-sky-800 hover:text-sky-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {needsGesture && voiceOn && (
        <p className="mt-2 text-xs text-(--color-dim)">画面を一度クリックすると声が出ます（ブラウザの自動再生制限）。</p>
      )}
    </section>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl rounded-br-sm bg-sky-900/40 px-3 py-2 text-sm text-sky-100">{msg.text}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="max-w-[92%] rounded-xl rounded-bl-sm bg-(--color-panel-2) px-3 py-2 text-sm">{msg.text}</p>
      <Extras msg={msg} />
    </div>
  );
}

/** 画面誘導・開発依頼・出典（生成SQL）— 会話の"結果"はここに出す */
function Extras({ msg }: { msg: Msg }) {
  if (!msg.link && !msg.dev && !msg.sql) return null;
  return (
    <div className="mt-2 space-y-2">
      {msg.link && (
        <Link href={msg.link.href} className="btn-main inline-block">
          {msg.link.label}を開く →
        </Link>
      )}
      {msg.dev && (
        <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-xs">
          <p className="text-emerald-200">開発依頼をキューに積みました</p>
          <p className="mt-0.5 text-(--color-dim)">{msg.dev.title}</p>
        </div>
      )}
      {msg.sql && (
        <details className="rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2">
          <summary className="cursor-pointer text-xs text-sky-300">
            出典 — 実行したSQL{msg.rowCount != null ? `（${msg.rowCount}件）` : ""}
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-(--color-dim)">{msg.sql}</pre>
        </details>
      )}
    </div>
  );
}

/** 状態が一目で分かる光の輪。考えている・聞いている・話している を色と速さで出す */
function Orb({ state }: { state: "idle" | "thinking" | "listening" | "speaking" }) {
  const tone =
    state === "listening" ? "from-red-400 to-rose-600" : state === "speaking" ? "from-sky-300 to-indigo-500" : state === "thinking" ? "from-amber-300 to-orange-500" : "from-sky-500/70 to-indigo-700/70";
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <span className={`absolute inset-0 rounded-full bg-gradient-to-br ${tone} ${state === "idle" ? "opacity-40" : "opacity-90"} blur-[6px]`} />
      <span
        className={`absolute inset-0 rounded-full border-2 border-sky-300/60 ${
          state === "idle" ? "" : state === "thinking" ? "jarvis-spin" : "jarvis-pulse"
        }`}
      />
      <span className="relative h-2.5 w-2.5 rounded-full bg-sky-100" />
    </span>
  );
}

function browserSpeak(text: string, setSpeaking: (v: boolean) => void) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 1.02;
    u.pitch = 0.85;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  } catch {
    setSpeaking(false);
  }
}
