"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { talkToJarvis } from "@/app/(main)/jarvis-actions";
import { detectWake, pauseMs, detectScreenCommand, splitSentences, createVad, cleanTranscript, wakeStartup } from "@/lib/jarvis-pure";
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

  /* #245: 耳の配線。ブラウザ認識は「呼びかけ」と「保険」、本命は音声→サーバー（Gemini）
     mic: getUserMedia のストリーム / ctx: AudioContext / proc: 音量を測る ScriptProcessor
     vad: 音量から発話の始まり終わりを判定 / pcm: いま録っている発話 / preroll: 直前の数フレーム（頭が欠けないように） */
  const micRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const vadRef = useRef<ReturnType<typeof createVad> | null>(null);
  const bargeVadRef = useRef<ReturnType<typeof createVad> | null>(null);
  const pcmRef = useRef<Float32Array[]>([]);
  const prerollRef = useRef<Float32Array[]>([]);
  const capturingRef = useRef(false);
  const micReadyRef = useRef(false); // 音量VADが動いている＝文字の間ではなく音で区切る
  /* #247: 「ジェネシス、会員数を見せて」を一息で言うと、呼びかけに気づいた時にはもう喋り終わっていて
     録音が始まらず、何も送られなかった（#245 の不具合）。直近5秒を常に持っておき、呼びかけに気づいたらそこから録る */
  const ringRef = useRef<Float32Array[]>([]);
  const frameMsRef = useRef(85);
  const pttRef = useRef(false); // 「押して話す」で聞いている最中
  const pttTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultBaseRef = useRef(0); // ブラウザ認識の結果のうち、もう使い終わった件数（古い「ジェネシス」を拾い直さない）
  const lastResultLenRef = useRef(0);
  const [recError, setRecError] = useState<string | null>(null);
  const [ptt, setPtt] = useState(false);
  const [wakeOn, setWakeOn] = useState(false); // 画面表示用（wantListening は ref なので再描画されない）
  const [wakeHint, setWakeHint] = useState(false); // #248: 待受をまだ一度も選んでいない＋マイク未許可 → 待受ボタンを光らせる
  const speakGen = useRef(0); // 読み上げの世代。割り込まれたら古い世代の音は捨てる
  const [level, setLevel] = useState(0);
  // #246: 呼びかけ待ちの間にブラウザが何を聞き取っているか（「反応しない」の切り分け用に見せる）
  const [preview, setPreview] = useState("");

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

  /* ---------- 声を出す（#245: 文ごとに作って、最初の1文から喋り始める） ---------- */
  const stopSpeaking = useCallback(() => {
    speakGen.current += 1;
    const el = audioRef.current;
    if (el) {
      try {
        el.pause();
        el.src = "";
      } catch {
        /* noop */
      }
    }
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;
      // 自分の声を聞いて自分に返事をしないよう、読み上げ前にブラウザ認識は止める
      // （音量VADのマイクは動かしたまま＝割り込みを聞く。エコーキャンセルが効く）
      stopRec();
      setMode(wantListening.current ? "waiting" : "off");
      const gen = ++speakGen.current;
      const sentences = splitSentences(text);
      if (sentences.length === 0) return;
      speakingRef.current = true;
      setSpeaking(true);
      // 全文ぶんを同時に頼み、届いた順ではなく文の順で再生する
      const fetches = sentences.map((sn) =>
        fetch("/api/jarvis/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: sn }) })
          .then(async (res) => (res.status === 200 ? await res.blob() : null))
          .catch(() => null)
      );
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      let anyPlayed = false;
      for (let i = 0; i < sentences.length; i++) {
        if (speakGen.current !== gen) return; // 割り込まれた
        const blob = await fetches[i];
        if (speakGen.current !== gen) return;
        if (!blob) {
          // 高品質音声が取れない文はブラウザ内蔵で読む（無音にしない）
          await new Promise<void>((done) => browserSpeak(sentences[i], (v) => { if (!v) done(); }));
          anyPlayed = true;
          continue;
        }
        const url = URL.createObjectURL(blob);
        try {
          await new Promise<void>((done, fail) => {
            el.onended = () => done();
            el.onerror = () => fail(new Error("play"));
            el.src = url;
            el.play().then(() => setNeedsGesture(false)).catch(fail);
          });
          anyPlayed = true;
        } catch {
          if (!anyPlayed) setNeedsGesture(true);
          break;
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      if (speakGen.current === gen) {
        speakingRef.current = false;
        setSpeaking(false);
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
      resultBaseRef.current = lastResultLenRef.current; // ここまでの聞き取りは使い終わり
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

  /* #248: 呼びかけに気づいたら小さく「ピコッ」と鳴らす（聞こえたことが分かるように。喋りはしない） */
  const chime = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== "running") return;
    try {
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      g.connect(ctx.destination);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(880, t);
      o.frequency.setValueAtTime(1320, t + 0.09);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.24);
    } catch {
      /* 鳴らなくても動作は続ける */
    }
  }, []);

  /* #247: 呼びかけに気づいた瞬間、直近5秒ぶんから録り始める（一息で言っても頭から録れる） */
  const beginCaptureFromWake = useCallback(() => {
    chime();
    // #248: 画面を触る前は音の処理が一時停止中＝直近の音が無い。そのときは文字の保険に任せる
    if (!micReadyRef.current || capturingRef.current || ctxRef.current?.state !== "running") return;
    const vad = vadRef.current;
    capturingRef.current = true;
    // #248: さかのぼるのは3秒（呼びかけの前の雑談まで文字起こしに混ぜない。認識の遅れは実測1秒弱）
    const back = Math.ceil(3000 / (frameMsRef.current || 85));
    pcmRef.current = ringRef.current.slice(-back);
    if (vad && !vad.speaking) {
      // もう喋り終わっている → 少しだけ待って（語尾を拾う）そのまま文字にする
      setTimeout(() => {
        if (capturingRef.current && !(vadRef.current?.speaking ?? false)) void finishRef.current?.();
      }, 350);
    }
  }, [chime]);
  const finishRef = useRef<(() => Promise<void>) | null>(null);


  /* ---------- 常時待受の本体 ---------- */
  const startRec = useCallback(() => {
    if (!(wantListening.current || pttRef.current) || recRef.current || busyRef.current) return;
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
      setRecError(null);
      resultBaseRef.current = 0;
      lastResultLenRef.current = 0;
      setMode(inConversation.current ? "listening" : "waiting");
    };

    rec.onresult = (e) => {
      if (busyRef.current) return;
      let text = "";
      lastResultLenRef.current = e.results.length;
      for (let i = resultBaseRef.current; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? "";

      if (!inConversation.current) {
        const { hit, rest } = detectWake(text);
        setPreview(text.slice(-40));
        if (!hit) return; // 呼びかけが無いうちは何も拾わない
        setPreview("");
        inConversation.current = true;
        if (followupTimer.current) clearTimeout(followupTimer.current);
        setMode("listening");
        bufferRef.current = rest;
        setHeard(rest);
        beginCaptureFromWake();
      } else {
        // 会話モードに入ったあとは、呼びかけより後ろを丸ごと用件とみなす
        const { hit, rest } = detectWake(text);
        const body = hit ? rest : text;
        bufferRef.current = body;
        setHeard(body);
      }

      // #245: 音量VADが録っている間は区切りは音で測る（文字の間で送らない）
      // #247: VADが録っていない（呼びかけの取りこぼし等）ときは、文字の間で送る保険を必ず残す
      if (micReadyRef.current && capturingRef.current) return;
      // 無音がこの長さ続いたら「言い終わった」とみなす（#184）
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      pauseTimer.current = setTimeout(() => {
        if (capturingRef.current) return; // その間にVADが録り始めた＝そちらに任せる
        const q = bufferRef.current.trim();
        if (!q) return; // 呼びかけただけ。用件が来るまで待つ
        void send(q, "voice");
      }, pauseMs(speedRef.current));
    };

    rec.onerror = (ev) => {
      const err = String(ev?.error ?? "");
      // #247: 黙っていただけ（no-speech / aborted）以外は画面に出す。「反応しない」の原因がここに出る
      if (err && err !== "no-speech" && err !== "aborted") setRecError(err);
      // no-speech / aborted は「黙っていただけ」。止めずに起こし直す
      if (err === "not-allowed" || err === "service-not-allowed") {
        wantListening.current = false;
        setWakeOn(false);
        setMode("off");
        setMicError("マイクの使用が許可されていません。アドレスバー左の鍵マーク → マイク → 許可 にしてください。");
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
      if ((wantListening.current || pttRef.current) && !speakingRef.current) {
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

  /* ---------- #245: 音で聞く（録音→VAD→サーバーで文字起こし） ---------- */
  const finishUtterance = useCallback(async () => {
    const chunks = pcmRef.current;
    pcmRef.current = [];
    capturingRef.current = false;
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    if (pttTimer.current) clearTimeout(pttTimer.current);
    const wasPtt = pttRef.current;
    pttRef.current = false;
    setPtt(false);
    const ctx = ctxRef.current;
    const rate = ctx?.sampleRate ?? 48000;
    const fallback = bufferRef.current.trim();
    // 押して話す（待受ではない）ときは、録り終わったらマイクを離す
    if (wasPtt && !wantListening.current) {
      stopRecRef.current?.();
      stopMicRef.current?.();
      setMode("off");
    }
    if (chunks.length === 0) {
      if (fallback) void send(fallback, "voice");
      return;
    }
    const wavBlob = encodeWav16k(chunks, rate);
    setBusy(true);
    let text = "";
    try {
      const res = await fetch("/api/jarvis/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: wavBlob, signal: AbortSignal.timeout(9000) });
      if (res.status === 200) text = cleanTranscript(String(((await res.json()) as { text?: string }).text ?? ""));
    } catch {
      /* 保険へ */
    } finally {
      setBusy(false);
    }
    const q = text || cleanTranscript(fallback);
    if (q) void send(q, "voice");
    else setHeard("");
  }, [send]);
  finishRef.current = finishUtterance;

  const startMic = useCallback(async (): Promise<boolean> => {
    if (micRef.current) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const frameMs = (4096 / ctx.sampleRate) * 1000;
      frameMsRef.current = frameMs;
      const ringMax = Math.ceil(5000 / frameMs);
      const vad = createVad({ silenceMs: pauseMs(speedRef.current), minSpeechMs: 180, ratio: 2.5, minRms: 0.012, frameMs });
      // 読み上げ中の割り込みは、スピーカーの漏れで誤爆しないよう厳しめ
      const barge = createVad({ silenceMs: 400, minSpeechMs: 350, ratio: 4, minRms: 0.03, frameMs });
      vadRef.current = vad;
      bargeVadRef.current = barge;
      micRef.current = stream;
      ctxRef.current = ctx;
      procRef.current = proc;
      micReadyRef.current = true;
      let tick = 0;
      let lastAt = performance.now();
      proc.onaudioprocess = (ev) => {
        const nowAt = performance.now();
        const dt = nowAt - lastAt;
        lastAt = nowAt;
        const input = ev.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        if ((tick++ & 3) === 0) setLevel(Math.min(1, rms * 8));
        // 直近5秒は常に持っておく（呼びかけに遅れて気づいても頭から録れる）
        ringRef.current.push(new Float32Array(input));
        if (ringRef.current.length > ringMax) ringRef.current.shift();
        if (!wantListening.current && !pttRef.current) return;

        if (speakingRef.current) {
          // 喋っている最中に人の声 → 黙って聞く（割り込み）
          if (barge.feed(rms, dt) === "start") {
            stopSpeaking();
            inConversation.current = true;
            if (followupTimer.current) clearTimeout(followupTimer.current);
            setMode("listening");
            capturingRef.current = true;
            pcmRef.current = [...prerollRef.current, new Float32Array(input)];
            (vadRef.current ?? vad).reset();
          }
          return;
        }
        // 頭が欠けないよう直前の数フレームを持っておく
        prerollRef.current.push(new Float32Array(input));
        if (prerollRef.current.length > 4) prerollRef.current.shift();

        const evt = (vadRef.current ?? vad).feed(rms, dt);
        if (!inConversation.current) return; // 呼びかけ待ち＝ブラウザ認識に任せる
        if (evt === "start" && !capturingRef.current) {
          capturingRef.current = true;
          pcmRef.current = [...prerollRef.current];
          setHeard("");
        }
        if (capturingRef.current) {
          pcmRef.current.push(new Float32Array(input));
          const tooLong = pcmRef.current.length * frameMs > 20000; // 20秒で強制送信
          if (evt === "end" || tooLong) void finishUtterance();
        }
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      return true;
    } catch (e) {
      micReadyRef.current = false; // 許可されなかった等 → ブラウザ認識だけで動く（従来どおり）
      const name = (e as { name?: string })?.name ?? "";
      setMicError(
        name === "NotAllowedError"
          ? "マイクの使用が許可されていません。アドレスバー左の鍵マーク → マイク → 許可 にしてください。"
          : name === "NotFoundError"
            ? "マイクが見つかりません。パソコンにマイクがつながっているか確認してください。"
            : `マイクを開けませんでした（${name || "不明なエラー"}）。`
      );
      return false;
    }
  }, [finishUtterance, stopSpeaking]);

  const stopMic = useCallback(() => {
    micReadyRef.current = false;
    capturingRef.current = false;
    pcmRef.current = [];
    ringRef.current = [];
    try {
      procRef.current?.disconnect();
      micRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    } catch {
      /* noop */
    }
    procRef.current = null;
    micRef.current = null;
    ctxRef.current = null;
    setLevel(0);
  }, []);
  const stopMicRef = useRef<(() => void) | null>(null);
  const stopRecRef = useRef<(() => void) | null>(null);
  stopMicRef.current = stopMic;
  stopRecRef.current = stopRec;

  /* ---------- #247: 押して話す（ヒアリングボタン）----------
     呼びかけ無しで、押した瞬間から聞く。話し終わったら（無音で）自動で送る。
     もう一度押すとその場で送る。待受にしていなくても使える。 */
  const listenNow = useCallback(async () => {
    if (busyRef.current) return;
    if (pttRef.current || capturingRef.current) {
      void finishUtterance();
      return;
    }
    stopSpeaking();
    clearTimers();
    setMicError(null);
    pttRef.current = true;
    setPtt(true);
    inConversation.current = true;
    bufferRef.current = "";
    setHeard("");
    setMode("listening");
    const ok = await startMic();
    // ブラウザ認識も並べて走らせる（サーバーの文字起こしが使えないときの保険・聞き取り中の文字の表示）
    startRec();
    if (!pttRef.current) return;
    if (ok) {
      vadRef.current?.reset();
      capturingRef.current = true;
      pcmRef.current = [...prerollRef.current];
    } else if (!recRef.current) {
      pttRef.current = false;
      setPtt(false);
      inConversation.current = false;
      setMode(wantListening.current ? "waiting" : "off");
      return;
    }
    // 8秒たっても何も話さなければやめる／30秒で強制的に送る
    pttTimer.current = setTimeout(() => {
      if (!pttRef.current) return;
      if (vadRef.current?.speaking) {
        // まだ話している → 最長30秒まで待つ
        pttTimer.current = setTimeout(() => pttRef.current && void finishUtterance(), 22000);
        return;
      }
      if (bufferRef.current.trim()) {
        // 音量では区切れなかったが言葉は取れている（小さい声・雑音の多い部屋）→ ここで送る
        void finishUtterance();
        return;
      }
      pttRef.current = false;
      setPtt(false);
      capturingRef.current = false;
      pcmRef.current = [];
      inConversation.current = false;
      if (!wantListening.current) {
        stopRec();
        stopMic();
        setMode("off");
      } else setMode("waiting");
      setHeard("");
    }, 8000);
  }, [finishUtterance, startMic, startRec, stopMic, stopRec, stopSpeaking]);

  /** 「いま送る」: 録音中ならそこまでを送る */
  useEffect(() => {
    if (vadRef.current) {
      // 待ちの長さ（はやい/ふつう/ゆっくり）を変えたら VAD にも反映
      const ctx = ctxRef.current;
      if (ctx) vadRef.current = createVad({ silenceMs: pauseMs(speed), minSpeechMs: 180, ratio: 2.5, minRms: 0.012, frameMs: (4096 / ctx.sampleRate) * 1000 });
    }
  }, [speed]);

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
    // #248: 前回オン、またはまだ選んでいなくてマイクが許可済みなら、開いた時点で待受にする
    // （ユーザー指摘「ジェネシスと呼んでも反応しない」＝実機の Edge で待受を一度も押していなかった）
    // 自分でオフにした人は触らない。未許可の人に開いた瞬間の許可の窓は出さない（待受ボタンを光らせる）
    if (ok) {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(WAKE_KEY);
      } catch {
        /* noop */
      }
      const begin = (perm: string | null) => {
        const d = wakeStartup(stored, perm);
        if (d === "hint") setWakeHint(true);
        if (d !== "auto" || wantListening.current) return;
        wantListening.current = true;
        setWakeOn(true);
        setMode("waiting");
        setTimeout(() => {
          startRec();
          void startMic();
        }, 600);
      };
      const perms = (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
      if (stored === "on" || stored === "off" || !perms) begin(null);
      else
        perms
          .query({ name: "microphone" })
          .then((p) => begin(p.state))
          .catch(() => begin(null));
    }
    return () => {
      wantListening.current = false;
      clearTimers();
      stopRec();
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #247: 開き直したとき、ブラウザは音の処理を「一時停止」で始める（クリックするまで音量が測れない）。
  // 画面のどこかを最初に触ったら再開する
  useEffect(() => {
    const resume = () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
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
    setWakeOn(next);
    try {
      window.localStorage.setItem(WAKE_KEY, next ? "on" : "off");
    } catch {
      /* noop */
    }
    setWakeHint(false);
    if (next) {
      setMicError(null);
      setMode("waiting");
      startRec();
      void startMic();
    } else {
      clearTimers();
      inConversation.current = false;
      bufferRef.current = "";
      setHeard("");
      stopRec();
      stopMic();
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
      if (!next) stopSpeaking();
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
    if (capturingRef.current) {
      void finishUtterance();
      return;
    }
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
        <Orb state={orbState} level={level} />
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
            title={wakeOn ? "待受をやめる" : "常時待受にする（「ジェネシス」と呼ぶだけで会話に入る）"}
            className={`flex h-9 shrink-0 items-center justify-center rounded-lg border px-2 ${
              wakeOn
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                : wakeHint
                  ? "animate-pulse border-amber-500 bg-amber-950/40 text-amber-200"
                  : "border-(--color-line) text-(--color-dim)"
            }`}
          >
            <Icon name="ear" size={16} />
            <span className="ml-1 hidden text-xs md:inline">{wakeOn ? "待受中" : "待受"}</span>
          </button>
        )}
        {/* #247 ヒアリングボタン: 押した瞬間から聞く（呼びかけ不要）。もう一度押すと送る */}
        <button
          type="button"
          onClick={() => void listenNow()}
          disabled={busy}
          title={ptt ? "押すと、ここまでを送ります" : "押してから話してください（「ジェネシス」は不要）"}
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold disabled:opacity-40 ${
            ptt ? "animate-pulse bg-red-500 text-white" : "bg-(--color-accent) text-[#06121c]"
          }`}
        >
          <Icon name="mic" size={18} />
          <span>{ptt ? "聞いています（押すと送る）" : "話す"}</span>
        </button>
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
      {recError && !micError && (
        <p className="px-4 pb-2 text-xs text-amber-300">
          音声認識が止まっています（{recError === "network" ? "ネットにつながらない" : recError === "audio-capture" ? "マイクの音が取れない" : recError === "language-not-supported" ? "日本語に未対応のブラウザ" : recError}）。
          「話す」ボタンは使えます。{recError === "network" ? "Chrome か Edge でお試しください。" : ""}
        </p>
      )}
      {mode === "off" && !micError && (
        <p className="px-4 pb-2 text-xs text-(--color-faint)">
          「話す」を押してそのまま話しかけてください。
          {sttSupported
            ? wakeHint
              ? "「ジェネシス」と呼んで使うには、光っている【待受】を一度だけ押してマイクを許可してください（次からは開いただけで待受になります）。"
              : "「待受」をオンにすると、以後は「ジェネシス」と呼ぶだけで会話に入ります。"
            : "（このブラウザは「ジェネシス」の呼びかけに未対応です。Chrome か Edge なら使えます）"}
        </p>
      )}
      {mode === "waiting" && !busy && !speaking && (
        <p className="truncate px-4 pb-2 text-xs text-(--color-faint)">
          聞こえている言葉：{preview || "（まだ何も）"}　— 「ジェネシス」と呼ぶと会話に入ります
        </p>
      )}
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
function Orb({ state, level = 0 }: { state: "idle" | "waiting" | "thinking" | "listening" | "speaking"; level?: number }) {
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
      <span className="relative rounded-full bg-sky-100" style={{ width: `${10 + level * 14}px`, height: `${10 + level * 14}px`, transition: "width 60ms, height 60ms" }} />
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

/**
 * 録った音（ブラウザのサンプルレート・float）を 16kHz mono 16bit の WAV にする（#245）。
 * サーバー側（Gemini）が確実に読める形式で、5秒で約160KB。
 */
function encodeWav16k(chunks: Float32Array[], inRate: number): Blob {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  const outRate = 16000;
  const ratio = inRate / outRate;
  const outLen = Math.floor(merged.length / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    // 区間平均（単純な間引きだと高い音が折り返す）
    const start = Math.floor(i * ratio);
    const end = Math.min(merged.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j];
    const v = end > start ? sum / (end - start) : 0;
    pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true);
  dv.setUint32(28, outRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}
