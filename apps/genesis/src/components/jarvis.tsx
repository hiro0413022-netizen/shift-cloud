"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { talkToJarvis } from "@/app/(main)/jarvis-actions";
import { detectWake, pauseMs } from "@/lib/jarvis-pure";
import type { JarvisReply } from "@/lib/jarvis";

/* ============================================================
   JARVIS — ホームの対話AI（DECISIONS #182 / #184）

   #184 で直したこと（2026-08-28 ユーザー指摘）:
     ①「毎回ボタンを押して話す形になっている。ジェネシスと言ったら
        会話モードに入るほうがいいのでは」
        → 常時待受にして、呼びかけ（ジェネシス）で会話モードに入る。
     ②「喋っている最中にいきなり終了して回答してしまいます」
        → ブラウザ標準の区切り（continuous=false）は日本語の"間"に対して
          短すぎた。continuous で録りっぱなしにし、**自前で無音を測って**
          区切る。速さは はやい/ふつう/ゆっくり から選べる。

   ここで効いている実装上の要点:
     - **読み上げ中はマイクを止める**。でないとJARVIS自身の声を聞いて
       自分に返事をし続ける（無限ループになる）。
     - Chromeの認識は無音が続くと勝手に止まるので、onend で**自動的に
       起こし直す**。止まったまま黙るのが、いちばん気づきにくい壊れ方。
     - 返事のあと10秒は**呼びかけ無しで続けて話せる**（会話の往復）。
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
const WAKE_KEY = "gn.jarvis.wake";
const SPEED_KEY = "gn.jarvis.speed";

/** 返事のあと、呼びかけ無しで続けて話せる時間 */
const FOLLOWUP_MS = 10000;

const SUGGESTIONS = ["今日はどんな状況？", "今月の売上は？", "承認待ちを教えて", "体験からの入会率は？"];

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type Mode = "off" | "waiting" | "listening";

export function Jarvis({ opening, name }: { opening: string; name: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: opening, intent: "brief" }]);
  const [input, setInput] = useState("");
  const [heard, setHeard] = useState(""); // いま聞き取っている途中の言葉
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("off");
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speed, setSpeed] = useState<string>("normal");
  const [needsGesture, setNeedsGesture] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const spokeOpening = useRef(false);

  // 認識コールバックは再生成しても中身を見失わないよう ref で持つ
  const wantListening = useRef(false); // 常時待受にしたいか（人の意思）
  const inConversation = useRef(false); // 呼びかけ済みで用件を待っている
  const bufferRef = useRef(""); // 今回の発話（呼びかけより後ろ）
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const speedRef = useRef("normal");
  const msgsRef = useRef<Msg[]>([]);
  const voiceRef = useRef(true);
  // onend のクロージャは作られた時点の値を握るので、読み上げ中かどうかは ref で見る
  // （state を見ると「読み上げ終わったのにマイクが起きない」で黙り込む）
  const speakingRef = useRef(false);

  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    voiceRef.current = voiceOn;
  }, [voiceOn]);
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  const clearTimers = () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    if (followupTimer.current) clearTimeout(followupTimer.current);
    pauseTimer.current = null;
    followupTimer.current = null;
  };

  /* ---------- マイクを止める / 起こす ---------- */
  const stopRec = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* すでに止まっている */
      }
    }
  }, []);

  /* ---------- 声を出す ---------- */
  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      // 自分の声を聞いて自分に返事をしないよう、読み上げ前に必ずマイクを切る
      stopRec();
      setMode(wantListening.current ? "waiting" : "off");
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
            speakingRef.current = false;
            setSpeaking(false);
            URL.revokeObjectURL(url);
          };
          speakingRef.current = true;
          setSpeaking(true);
          await el.play();
          setNeedsGesture(false);
          return;
        }
        browserSpeak(text, setSpeaking);
      } catch {
        setSpeaking(false);
        setNeedsGesture(true);
      }
    },
    [stopRec]
  );

  /* ---------- 送る ---------- */
  const send = useCallback(
    async (said: string, inputMode: "text" | "voice") => {
      const q = said.trim();
      if (!q || busyRef.current) return;
      clearTimers();
      inConversation.current = false;
      bufferRef.current = "";
      setHeard("");
      setInput("");
      busyRef.current = true;
      setBusy(true);
      const history = msgsRef.current.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      setMsgs((prev) => [...prev, { role: "user", text: q }]);
      try {
        const r: JarvisReply = await talkToJarvis(q, history, inputMode);
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", text: r.reply, link: r.link, dev: r.dev, sql: r.sql, rowCount: r.rowCount, intent: r.intent },
        ]);
        if (voiceRef.current) {
          void speak(r.reply);
        }
        // 返事のあとしばらくは、呼びかけ無しで続けて話せる
        if (wantListening.current) {
          inConversation.current = true;
          followupTimer.current = setTimeout(() => {
            inConversation.current = false;
            bufferRef.current = "";
            setHeard("");
          }, FOLLOWUP_MS);
        }
      } catch {
        setMsgs((prev) => [...prev, { role: "assistant", text: "うまく処理できませんでした。もう一度お願いします。", intent: "error" }]);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [speak]
  );

  /* ---------- 常時待受の本体 ---------- */
  const startRec = useCallback(() => {
    if (!wantListening.current || recRef.current || busyRef.current) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "ja-JP";
    rec.continuous = true; // 標準の区切りは日本語の"間"に対して短すぎる（#184）
    rec.interimResults = true;

    rec.onstart = () => {
      setMicError(null);
      setMode(inConversation.current ? "listening" : "waiting");
    };

    rec.onresult = (e) => {
      if (busyRef.current) return;
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? "";

      if (!inConversation.current) {
        const { hit, rest } = detectWake(text);
        if (!hit) return; // 呼びかけが無いうちは何も拾わない
        inConversation.current = true;
        if (followupTimer.current) clearTimeout(followupTimer.current);
        setMode("listening");
        bufferRef.current = rest;
        setHeard(rest);
      } else {
        // 会話モードに入ったあとは、呼びかけより後ろを丸ごと用件とみなす
        const { hit, rest } = detectWake(text);
        const body = hit ? rest : text;
        bufferRef.current = body;
        setHeard(body);
      }

      // 無音がこの長さ続いたら「言い終わった」とみなす（#184）
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      pauseTimer.current = setTimeout(() => {
        const q = bufferRef.current.trim();
        if (!q) return; // 呼びかけただけ。用件が来るまで待つ
        void send(q, "voice");
      }, pauseMs(speedRef.current));
    };

    rec.onerror = (ev) => {
      const err = String(ev?.error ?? "");
      // no-speech / aborted は「黙っていただけ」。止めずに起こし直す
      if (err === "not-allowed" || err === "service-not-allowed") {
        wantListening.current = false;
        setMode("off");
        setMicError("マイクの使用が許可されていません。アドレスバーの🎤から許可してください。");
        try {
          window.localStorage.setItem(WAKE_KEY, "off");
        } catch {
          /* noop */
        }
      }
    };

    rec.onend = () => {
      recRef.current = null;
      // Chromeは無音が続くと勝手に止まる。待受のつもりなら必ず起こし直す
      if (wantListening.current && !speakingRef.current) {
        setTimeout(() => startRec(), 400);
      } else if (!wantListening.current) {
        setMode("off");
      }
    };

    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, [send]);

  /* ---------- 読み上げが終わったらマイクを起こし直す ---------- */
  useEffect(() => {
    if (speaking) return;
    if (wantListening.current && !recRef.current && !busy) {
      const t = setTimeout(() => startRec(), 300);
      return () => clearTimeout(t);
    }
  }, [speaking, busy, startRec]);

  /* ---------- 初期化 ---------- */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VOICE_KEY) === "off") setVoiceOn(false);
      const sp = window.localStorage.getItem(SPEED_KEY);
      if (sp) setSpeed(sp);
    } catch {
      /* プライベートモード等 */
    }
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const ok = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
    setSttSupported(ok);
    // 前回「待受にする」を選んでいたら自動で戻す（マイク許可はオリジンに残る）
    if (ok) {
      try {
        if (window.localStorage.getItem(WAKE_KEY) === "on") {
          wantListening.current = true;
          setTimeout(() => startRec(), 600);
        }
      } catch {
        /* noop */
      }
    }
    return () => {
      wantListening.current = false;
      clearTimers();
      stopRec();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (spokeOpening.current || !voiceOn) return;
    spokeOpening.current = true;
    void speak(opening);
  }, [voiceOn, opening, speak]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  /* ---------- 操作 ---------- */
  const toggleWake = () => {
    const next = !wantListening.current;
    wantListening.current = next;
    try {
      window.localStorage.setItem(WAKE_KEY, next ? "on" : "off");
    } catch {
      /* noop */
    }
    if (next) {
      setMicError(null);
      startRec();
    } else {
      clearTimers();
      inConversation.current = false;
      bufferRef.current = "";
      setHeard("");
      stopRec();
      setMode("off");
    }
  };

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

  const changeSpeed = (v: string) => {
    setSpeed(v);
    try {
      window.localStorage.setItem(SPEED_KEY, v);
    } catch {
      /* noop */
    }
  };

  /** いま溜まっている言葉をすぐ送る（待ちきれないとき） */
  const sendNow = () => {
    const q = bufferRef.current.trim();
    if (q) void send(q, "voice");
  };

  const latest = msgs[msgs.length - 1];
  const showThread = msgs.length > 1;
  const orbState = busy ? "thinking" : mode === "listening" ? "listening" : speaking ? "speaking" : mode === "waiting" ? "waiting" : "idle";

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-sky-900/50 bg-[radial-gradient(120%_140%_at_15%_0%,#0f1a2e_0%,#0d1119_55%,#0b0e15_100%)] p-4 sm:p-5"
      onClick={() => {
        if (needsGesture && voiceOn && latest?.role === "assistant") {
          setNeedsGesture(false);
          void speak(latest.text);
        }
      }}
    >
      {/* ヘッダー */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Orb state={orbState} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.35em] text-(--color-gold)">YOZAN</p>
          <p className="text-sm font-semibold tracking-wide">
            GENESIS
            <span className="ml-2 text-xs font-normal text-(--color-dim)">
              {busy
                ? "考えています…"
                : mode === "listening"
                  ? "はい、聞いています"
                  : speaking
                    ? "話しています…"
                    : mode === "waiting"
                      ? "「ジェネシス」と呼んでください"
                      : `${name}さんの分身`}
            </span>
          </p>
        </div>

        {sttSupported && (
          <button
            type="button"
            onClick={toggleWake}
            title={mode === "off" ? "常時待受にする（「ジェネシス」で起動）" : "待受をやめる"}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              mode === "off"
                ? "border-(--color-line) text-(--color-dim) hover:bg-(--color-panel-2)"
                : "border-sky-700 bg-sky-950/40 text-sky-200"
            }`}
          >
            {mode === "off" ? "🎧 待受にする" : "🎧 待受中"}
          </button>
        )}

        {mode !== "off" && (
          <select
            value={speed}
            onChange={(e) => changeSpeed(e.target.value)}
            title="どれくらい黙ったら「言い終わった」とみなすか"
            className="rounded-lg border border-(--color-line) bg-(--color-panel-2) px-2 py-1.5 text-xs"
          >
            <option value="fast">待ち: はやい</option>
            <option value="normal">待ち: ふつう</option>
            <option value="slow">待ち: ゆっくり</option>
          </select>
        )}

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

      {/* 最新の発話 */}
      {latest && (
        <div className="mb-3">
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

      {/* いま聞き取っている言葉 — 何が聞こえているかが見えないと直しようがない */}
      {mode === "listening" && !busy && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-sky-800/60 bg-sky-950/30 px-4 py-2.5">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-400" />
          <span className="min-w-0 flex-1 text-sm text-sky-100">{heard || "どうぞ"}</span>
          {heard && (
            <button type="button" onClick={sendNow} className="shrink-0 rounded-md border border-sky-700 px-2 py-1 text-xs text-sky-200">
              いま送る
            </button>
          )}
        </div>
      )}

      {/* 入力（キーボードでもいつでも） */}
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
          placeholder={mode === "waiting" ? "「ジェネシス」と呼ぶか、ここに入力" : "入力して送る"}
          className="min-w-0 flex-1 rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-sm outline-none focus:border-sky-700"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn-main disabled:opacity-40">
          送る
        </button>
      </form>

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

      {micError && <p className="mt-2 text-xs text-amber-300">{micError}</p>}
      {mode === "off" && sttSupported && !micError && (
        <p className="mt-2 text-xs text-(--color-dim)">
          「🎧 待受にする」を1回押すと、以後は<b className="text-sky-300">「ジェネシス」と呼ぶだけ</b>で会話に入ります（このタブを開いている間、マイクは入りっぱなしになります）。
        </p>
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

/** 状態が一目で分かる光の輪。待受・聞いている・考えている・話している を色と動きで出す */
function Orb({ state }: { state: "idle" | "waiting" | "thinking" | "listening" | "speaking" }) {
  const tone =
    state === "listening"
      ? "from-red-400 to-rose-600"
      : state === "speaking"
        ? "from-sky-300 to-indigo-500"
        : state === "thinking"
          ? "from-amber-300 to-orange-500"
          : state === "waiting"
            ? "from-emerald-400 to-teal-600"
            : "from-sky-500/70 to-indigo-700/70";
  const ring = state === "idle" ? "" : state === "thinking" ? "jarvis-spin" : state === "waiting" ? "jarvis-breathe" : "jarvis-pulse";
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <span className={`absolute inset-0 rounded-full bg-gradient-to-br ${tone} ${state === "idle" ? "opacity-40" : "opacity-90"} blur-[6px]`} />
      <span className={`absolute inset-0 rounded-full border-2 border-sky-300/60 ${ring}`} />
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
