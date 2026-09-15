"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { talkToJarvis } from "@/app/(main)/jarvis-actions";
import { detectWake, pauseMs, detectScreenCommand } from "@/lib/jarvis-pure";
import { Icon } from "./icons";
import { openPalette } from "./command-palette";
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
  act?: { id: string; title: string; runsAt: string; mode: string } | null;
  sql?: string | null;
  rowCount?: number | null;
  intent?: string;
};

// 2026-09-15: 「急にしゃべりだすのをやめてほしい」→ 声は最初オフ。
// 以前のキー(gn.jarvis.voice)は既定オンだったので読まない＝全員いったんオフから始まる。
const VOICE_KEY = "gn.jarvis.voice.v2";
const WAKE_KEY = "gn.jarvis.wake";
const SPEED_KEY = "gn.jarvis.speed";

/** 返事のあと、呼びかけ無しで続けて話せる時間 */
const FOLLOWUP_MS = 10000;


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
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: opening, intent: "brief" }]);
  const [input, setInput] = useState("");
  const [heard, setHeard] = useState(""); // いま聞き取っている途中の言葉
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("off");
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [speed, setSpeed] = useState<string>("normal");
  const [needsGesture, setNeedsGesture] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // 認識コールバックは再生成しても中身を見失わないよう ref で持つ
  const wantListening = useRef(false); // 常時待受にしたいか（人の意思）
  const inConversation = useRef(false); // 呼びかけ済みで用件を待っている
  const bufferRef = useRef(""); // 今回の発話（呼びかけより後ろ）
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const speedRef = useRef("normal");
  const msgsRef = useRef<Msg[]>([]);
  const voiceRef = useRef(false);
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
      // #244: 「会員数を見せて」「フランクの予約を開いて」＝画面を出す指示は LLM に投げず、その場で開く
      const cmd = detectScreenCommand(q);
      if (cmd) {
        setMsgs((prev) => [...prev, { role: "assistant", text: cmd.label, intent: "show" }]);
        if (cmd.kind === "search") openPalette(cmd.q);
        else router.push(cmd.href);
        if (voiceRef.current || inputMode === "voice") void speak(cmd.label);
        if (wantListening.current) {
          inConversation.current = true;
          followupTimer.current = setTimeout(() => {
            inConversation.current = false;
            bufferRef.current = "";
            setHeard("");
          }, FOLLOWUP_MS);
        }
        busyRef.current = false;
        setBusy(false);
        return;
      }
      try {
        const r: JarvisReply = await talkToJarvis(q, history, inputMode);
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", text: r.reply, link: r.link, dev: r.dev, act: r.act, sql: r.sql, rowCount: r.rowCount, intent: r.intent },
        ]);
        // #244: 案内先が決まった返事は、ボタンを押させずにそのまま開く（声で操作できるように）
        if (r.intent === "navigate" && r.link?.href) router.push(r.link.href);
        // 読み上げるのは「🔊をオンにしている」か「声で話しかけた」ときだけ。
        // 文字で打った質問に勝手に声で返さない（2026-09-15）
        if (voiceRef.current || inputMode === "voice") {
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
    [speak, router]
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
      if (window.localStorage.getItem(VOICE_KEY) === "on") setVoiceOn(true);
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

  // 2026-09-15: 開いた瞬間の読み上げは廃止（最初の一言は画面に文字で出すだけ）。
  // ここで speak(opening) を呼ぶと「急にしゃべりだす」になる。戻さないこと。

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
  const statusText = busy
    ? "考えています…"
    : mode === "listening"
      ? "はい、聞いています"
      : speaking
        ? "話しています…"
        : mode === "waiting"
          ? "「ジェネシス」と呼んでください"
          : "";

  /* #244: ホーム上部の1行に収める。会話が始まったら下に広がる。
     声は最初オフ（🔇）。開いた瞬間には喋らない。 */
  return (
    <section className="rounded-2xl border border-(--color-line) bg-(--color-panel)">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input, "text");
        }}
        className="flex items-center gap-2 px-3 py-2"
      >
        <Orb state={orbState} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={statusText || "GENESISに聞く・指示する（例：会員数を見せて／先週の体験は何件？）"}
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-(--color-faint)"
        />
        {heard && mode === "listening" && !busy && (
          <button type="button" onClick={sendNow} className="hidden shrink-0 rounded-md border border-sky-700 px-2 py-1 text-xs text-sky-200 sm:block">
            いま送る
          </button>
        )}
        <button
          type="button"
          onClick={toggleVoice}
          title={voiceOn ? "読み上げを止める" : "返事を声で読み上げる"}
          className={`flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs ${
            voiceOn ? "border-sky-700 bg-sky-950/40 text-sky-200" : "border-(--color-line) text-(--color-dim)"
          }`}
        >
          <Icon name={voiceOn ? "sound" : "mute"} size={16} />
          <span className="hidden sm:inline">{voiceOn ? "声 オン" : "声 オフ"}</span>
        </button>
        {sttSupported && (
          <button
            type="button"
            onClick={toggleWake}
            title={mode === "off" ? "常時待受にする（「ジェネシス」で起動）" : "待受をやめる"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              mode === "off" ? "border-(--color-line) text-(--color-dim)" : "border-sky-700 bg-sky-950/40 text-sky-200"
            }`}
          >
            <Icon name="mic" size={16} />
          </button>
        )}
        <button type="submit" disabled={busy || !input.trim()} className="btn-main hidden disabled:opacity-40 sm:block">
          送る
        </button>
      </form>

      {(showThread || (mode === "listening" && !busy) || busy) && (
        <div className="border-t border-(--color-line) px-3 py-3 sm:px-4">
          {mode !== "off" && (
            <div className="mb-2 flex items-center gap-2 text-xs text-(--color-dim)">
              <select
                value={speed}
                onChange={(e) => changeSpeed(e.target.value)}
                title="どれくらい黙ったら「言い終わった」とみなすか"
                className="rounded-md border border-(--color-line) bg-(--color-panel-2) px-2 py-1 text-xs"
              >
                <option value="fast">待ち: はやい</option>
                <option value="normal">待ち: ふつう</option>
                <option value="slow">待ち: ゆっくり</option>
              </select>
              {mode === "listening" && (
                <span className="flex items-center gap-2 text-sky-100">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                  {heard || "どうぞ"}
                </span>
              )}
            </div>
          )}
          {showThread && (
            <div ref={threadRef} className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {msgs.slice(1).map((m, i) => (
                <Bubble key={i} msg={m} />
              ))}
              {busy && <p className="text-sm text-(--color-dim)">…</p>}
            </div>
          )}
        </div>
      )}

      {micError && <p className="px-4 pb-2 text-xs text-amber-300">{micError}</p>}
      {needsGesture && voiceOn && latest?.role === "assistant" && (
        <p className="px-4 pb-2 text-xs text-(--color-dim)">ブラウザの設定で声を出せませんでした（文字の返事はそのまま使えます）。</p>
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
  if (!msg.link && !msg.dev && !msg.act && !msg.sql) return null;
  return (
    <div className="mt-2 space-y-2">
      {msg.link && (
        <Link href={msg.link.href} className="btn-main inline-block">
          {msg.link.label}を開く →
        </Link>
      )}
      {msg.act && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs">
          <p className="text-amber-200">
            {msg.act.mode === "approval" ? "承認待ちにしました" : "実行予定に入れました（取り消せます）"}
          </p>
          <p className="mt-0.5 text-(--color-dim)">{msg.act.title}</p>
          {msg.act.mode !== "approval" && (
            <p className="mt-0.5 text-(--color-dim)">
              実行 {new Date(msg.act.runsAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
              　／　下の「実行予定」から取り消せます
            </p>
          )}
        </div>
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
