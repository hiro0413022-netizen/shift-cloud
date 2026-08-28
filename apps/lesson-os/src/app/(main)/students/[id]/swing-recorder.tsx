"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimatePhases, type Phases } from "@/lib/phases";
import { capturePoster } from "@/lib/poster";
import { CLUBS } from "@/lib/lesson";

/**
 * 撮影モジュール（DECISIONS #51 / 2026-08-22 ガイド線を廃止）
 *
 * ガイド（後方DTL・正面フェースオンの枠線＋説明テキスト）は削除した。
 * 理由: 実機では説明テキストが枠幅からはみ出て切れ、線も被写体に重なって
 *       かえって構図が取りづらい、とユーザーから指摘（2026-08-22）。
 *       画角を揃えたいだけなら、9:16の固定枠に収めてもらえば足りる。
 * ※ 復活させる場合は、SVGのviewBox幅(90)を超える長さのtextを置かないこと。
 *
 * レイアウト: プレビューは 9:16 固定枠（object-cover）。
 * シャッターはプレビュー上に重ねる（カメラアプリと同じ）ので、スクロールしても必ず押せる。
 *
 * 2026-08-22: 撮ったあとの「クラブ・飛距離・メモ → 登録」までこの画面で完結させた。
 * それまでは【この動画を使う】で閉じたあと、カルテを下までスクロールして【⬆登録】を
 * 押す必要があり、打った直後の現場では確実に忘れる導線だった。
 *
 * 2026-08-26（現場フィードバック2件）:
 *  (1) カウントダウンを 0秒／3秒 で選べるようにした。既定は 0秒＝押した瞬間に録画開始。
 *      理由: 一人で撮るとき以外は3秒待つぶんだけ無駄玉になる。選択は端末に記憶する。
 *  (2) 撮った直後のプレビューが iPhone/iPad で再生も表示もされない問題を直した。
 *      原因: Blob の type に codecs パラメータ（video/mp4;codecs=avc1...）が入ったままだと
 *            iOS Safari が blob: URL のメディアを読み込めない。ここで必ず `video/mp4` /
 *            `video/webm` の素の type に正規化する。
 *            ※ この type はそのまま Storage の Content-Type にも渡るので、
 *              一覧からの再生（署名URL）にも効く。codecs 付きに戻さないこと。
 *      あわせて、それでも再生できない端末のために
 *        枠を固定高さにする（メタデータ未取得で高さ0に潰れるのを防ぐ）
 *        → 失敗したら data: URL で再試行 → それでもだめなら1コマ目の静止画を出す
 *      の三段構えにして、「何も映らないまま登録することになる」状態を無くした。
 */

const MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** iOS Safari は codecs 付きの type を持つ blob: を再生できない。素の type に落とす */
const baseMime = (m: string) => (m.split(";")[0] || "video/webm").trim();

/** data: URL 再試行の上限（端末メモリを踏み抜かないため） */
const DATAURL_MAX = 12 * 1024 * 1024;

const CD_KEY = "lsn.rec.countdown";
const LIMIT_KEY = "lsn.rec.limit";
const GHOST_KEY = "lsn.rec.ghost";

const readNum = (key: string, allow: number[], fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const v = Number(window.localStorage.getItem(key));
  return allow.includes(v) ? v : fallback;
};

export type Captured = {
  blob: Blob;
  url: string;
  ext: string;
  phases: Phases | null;
  duration: number;
  /** 撮影直後に切り出した1コマ目。登録時のサムネにそのまま使う（取れなければ null） */
  poster: Blob | null;
};

export type RecordMeta = { club: string; distanceYd: string; note: string; shotAt: string };

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function SwingRecorder({
  onRegister,
  onClose,
  ghostUrl,
}: {
  /** 登録処理。エラー文字列を返せば画面に出す。null なら成功でこのモジュールを閉じる */
  onRegister: (c: Captured, meta: RecordMeta) => Promise<string | null>;
  onClose: () => void;
  /**
   * 前回スイングの1コマ目。プレビューに薄く重ねて画角を合わせるために使う（2026-08-28）。
   *
   * なぜ枠線ガイドではなくこれか:
   *   角度や距離の数字は「前回との差」で読むものなので、毎回だいたい同じ画角で撮れていることが前提になる。
   *   三脚を毎回据えるのは現場で続かない、とユーザー判断（2026-08-28）。
   *   前回の絵そのものを薄く重ねて、人が見て合わせるほうが速いし、線より外れが分かりやすい。
   *   2026-08-22 に消した枠線ガイド（文字がはみ出て切れた）は復活させない。
   */
  ghostUrl?: string | null;
}) {
  const camRef = useRef<HTMLVideoElement>(null);
  const playRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [limit, setLimit] = useState(() => readNum(LIMIT_KEY, [5, 8, 12], 8));
  const [countdown, setCountdown] = useState(() => readNum(CD_KEY, [0, 3], 0));
  const [ghost, setGhost] = useState(() => readNum(GHOST_KEY, [0, 1], 1) === 1);
  const [count, setCount] = useState<number | null>(null);
  const [rec, setRec] = useState(false);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Captured | null>(null);
  const [ready, setReady] = useState(false);
  const [club, setClub] = useState("");
  const [dist, setDist] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  /* プレビュー再生まわり: playUrl は blob: → data: と切り替わることがある */
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [playStage, setPlayStage] = useState<0 | 1 | 2>(0); // 0=blob 1=data 2=あきらめ（静止画）
  const [playOk, setPlayOk] = useState(false);

  const supported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const stopStream = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setErr(null);
    stopStream();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: true, // 打球音でインパクトを検出するため必須
      });
      streamRef.current = s;
      if (camRef.current) {
        camRef.current.srcObject = s;
        await camRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch {
      setErr("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください");
    }
  }, [facing, stopStream]);

  useEffect(() => {
    if (supported && !preview) void start();
    return stopStream;
  }, [supported, preview, start, stopStream]);

  const pick = (key: string, set: (n: number) => void) => (n: number) => {
    set(n);
    try { window.localStorage.setItem(key, String(n)); } catch { /* プライベートモード等 */ }
  };

  const record = () => {
    const s = streamRef.current;
    if (!s) return;
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const type = baseMime(mime || "video/webm");
    const ext = type.includes("mp4") ? "mp4" : "webm";
    chunks.current = [];
    const mr = new MediaRecorder(s, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    recRef.current = mr;
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.onstop = async () => {
      setRec(false);
      const blob = new Blob(chunks.current, { type }); // ← codecs は付けない（iOS対策）
      setBusy("フェーズを自動推定中…");
      const phases = await estimatePhases(blob, limit);
      setBusy("サムネイルを作成中…");
      const poster = await capturePoster(blob).catch(() => null);
      setBusy(null);
      setPlayStage(0);
      setPlayOk(false);
      setPlayUrl(URL.createObjectURL(blob));
      setPosterUrl(poster ? URL.createObjectURL(poster) : null);
      setPreview({ blob, url: URL.createObjectURL(blob), ext, phases, duration: limit, poster });
      stopStream();
    };

    const begin = () => {
      setCount(null);
      setRec(true);
      setLeft(limit);
      mr.start();
      for (let i = 1; i <= limit; i++) timers.current.push(setTimeout(() => setLeft(limit - i), i * 1000));
      timers.current.push(setTimeout(() => mr.state !== "inactive" && mr.stop(), limit * 1000));
    };

    if (countdown <= 0) { begin(); return; } // 0秒＝押した瞬間に録画開始

    setCount(countdown);
    for (let i = 1; i < countdown; i++) timers.current.push(setTimeout(() => setCount(countdown - i), i * 1000));
    timers.current.push(setTimeout(begin, countdown * 1000));
  };

  const stopNow = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCount(null);
    if (recRef.current?.state === "recording") recRef.current.stop();
    else setRec(false);
  };

  /* --- プレビューが再生できないときの段階的フォールバック --- */

  const toDataUrl = useCallback((blob: Blob) => {
    if (blob.size > DATAURL_MAX) { setPlayStage(2); return; }
    const fr = new FileReader();
    fr.onload = () => { setPlayUrl(String(fr.result)); setPlayStage(1); };
    fr.onerror = () => setPlayStage(2);
    fr.readAsDataURL(blob);
  }, []);

  const playFailed = useCallback(() => {
    if (playOk) return;
    if (playStage === 0 && preview) toDataUrl(preview.blob);
    else setPlayStage(2);
  }, [playOk, playStage, preview, toDataUrl]);

  // 読み込みが始まらないまま黙って固まる端末があるので見張る（onerrorが飛ばないケース）
  useEffect(() => {
    if (!preview || playOk || playStage === 2) return;
    const t = setTimeout(() => {
      if ((playRef.current?.readyState ?? 0) < 2) playFailed();
    }, 3500);
    return () => clearTimeout(t);
  }, [preview, playOk, playStage, playFailed]);

  const onMeta = () => {
    const v = playRef.current;
    if (!v) return;
    setPlayOk(true);
    // MediaRecorder の webm は duration が Infinity になることがある（シークバーが効かない）
    if (!isFinite(v.duration)) {
      const back = () => { v.removeEventListener("seeked", back); v.currentTime = 0; };
      v.addEventListener("seeked", back);
      v.currentTime = 1e6;
    }
    void v.play().catch(() => {});
  };

  const revoke = (c: Captured) => {
    URL.revokeObjectURL(c.url);
    if (playUrl?.startsWith("blob:")) URL.revokeObjectURL(playUrl);
    if (posterUrl) URL.revokeObjectURL(posterUrl);
  };

  const retake = () => {
    if (preview) revoke(preview);
    setPreview(null);
    setPlayUrl(null);
    setPosterUrl(null);
    setSaveErr(null);
  };

  const register = async () => {
    if (!preview) return;
    setSaveErr(null);
    setSaving("登録中…");
    const err = await onRegister(preview, { club, distanceYd: dist, note, shotAt: jstToday() });
    setSaving(null);
    if (err) { setSaveErr(err); return; }
    revoke(preview);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black">
      {/* ヘッダ */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm">
        <span className="font-medium text-(--color-gold)">スイング撮影</span>
        <button onClick={() => { stopStream(); onClose(); }} className="btn-ghost ml-auto !py-1.5">✕ 閉じる</button>
      </div>

      {!supported ? (
        <div className="m-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-4 text-sm text-(--color-dim)">
          この端末のブラウザはアプリ内録画に対応していません。カメラアプリで撮影してから「動画を選ぶ」で登録してください。
        </div>
      ) : preview ? (
        /* ---- 撮り終わり: ここで登録まで終わらせる ---- */
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
          <div className="mx-auto w-full max-w-[440px]">
            {/* 高さを固定する: メタデータ未取得のときに高さ0へ潰れて「何も出ない」のを防ぐ */}
            <div className="relative mx-auto h-[42vh] w-full overflow-hidden rounded-lg bg-black">
              {playStage !== 2 && playUrl && (
                <video
                  ref={playRef}
                  key={playUrl}
                  src={playUrl}
                  poster={posterUrl ?? undefined}
                  controls
                  playsInline
                  autoPlay
                  loop
                  muted
                  preload="auto"
                  onLoadedMetadata={onMeta}
                  onError={playFailed}
                  className="h-full w-full object-contain"
                />
              )}
              {playStage === 2 && (
                posterUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={posterUrl} alt="撮影した1コマ目" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-6 text-center text-xs text-(--color-dim)">
                    プレビューを表示できませんでした
                  </div>
                )
              )}
            </div>

            {playStage === 2 && (
              <p className="mt-2 rounded-lg border border-(--color-line) bg-(--color-panel) p-2 text-[11px] text-(--color-dim)">
                この端末では撮影直後のその場再生に対応していないため、1コマ目だけ表示しています。
                <b className="text-(--color-txt)">登録すればカルテの一覧から通常どおり再生できます。</b>
              </p>
            )}

            <p className="mt-2 text-xs text-(--color-dim)">
              {preview.phases?._method === "audio"
                ? "✅ 打球音からインパクトを検出し、アドレス〜フィニッシュを自動マークしました"
                : preview.phases
                ? "⚠ 打球音を検出できず、尺から仮の位置を置きました（再生画面で調整できます）"
                : "⚠ フェーズは自動で置けませんでした（再生画面で手動設定できます）"}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-(--color-dim)">
                クラブ
                <select value={club} onChange={(e) => setClub(e.target.value)} className="input-dark mt-1 w-full">
                  <option value="">未選択</option>
                  {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-xs text-(--color-dim)">
                飛距離(yd)
                <input value={dist} onChange={(e) => setDist(e.target.value)} inputMode="numeric" placeholder="—" className="input-dark mt-1 w-full" />
              </label>
              <label className="col-span-2 text-xs text-(--color-dim)">
                メモ
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 切り返しを緩めた" className="input-dark mt-1 w-full" />
              </label>
            </div>

            {saveErr && <p className="mt-2 text-xs text-(--color-danger)">{saveErr}</p>}

            <div className="mt-3 flex gap-2">
              <button onClick={retake} disabled={!!saving} className="btn-ghost">↺ 撮り直す</button>
              <button onClick={register} disabled={!!saving} className="btn-gold flex-1">
                {saving ?? "この動画を登録する"}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-(--color-dim)">
              クラブ・飛距離はあとからでも直せます。まず登録してしまってください
            </p>
          </div>
        </div>
      ) : (
        /* ---- 撮影 ---- */
        <div className="flex min-h-0 flex-1 flex-col items-center px-3 pb-3">
          {/* 9:16固定枠 */}
          <div className="relative mx-auto aspect-[9/16] max-h-full w-full max-w-[440px] shrink overflow-hidden rounded-xl bg-black">
            <video
              ref={camRef}
              muted
              playsInline
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />

            {/* 前回の画角（薄く重ねる。撮影の邪魔にならないよう操作は素通し） */}
            {ghostUrl && ghost && !preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ghostUrl}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-screen"
              />
            )}

            {count !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-8xl font-bold text-(--color-gold)">
                {count}
              </div>
            )}
            {rec && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                REC 残り{left}秒
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-(--color-txt)">{busy}</div>
            )}

            {/* シャッター（プレビュー上に固定＝必ず押せる） */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent pb-4 pt-8">
              <button
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                disabled={rec || count !== null}
                className="text-2xl text-white disabled:opacity-30"
                aria-label="カメラ切替"
              >
                🔄
              </button>
              {rec || count !== null ? (
                <button
                  onClick={stopNow}
                  aria-label="停止"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-red-600"
                >
                  <span className="h-6 w-6 rounded bg-white" />
                </button>
              ) : (
                <button
                  onClick={record}
                  disabled={!ready || !!busy}
                  aria-label="録画開始"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/10 disabled:opacity-40"
                >
                  <span className="h-14 w-14 rounded-full bg-red-600" />
                </button>
              )}
              <span className="w-6 text-center text-xs text-white/80">{limit}s</span>
            </div>
          </div>

          {err && <p className="mt-2 text-xs text-(--color-danger)">{err}</p>}

          {/* 秒数・カウントダウン（シャッターとは別・下段） */}
          <div className="mt-2 flex w-full max-w-[440px] shrink-0 flex-wrap items-center justify-center gap-1.5 text-xs">
            {[5, 8, 12].map((s) => (
              <button
                key={s}
                onClick={() => pick(LIMIT_KEY, setLimit)(s)}
                disabled={rec || count !== null}
                className={`rounded-lg border px-2.5 py-1.5 ${limit === s ? "border-(--color-gold) text-(--color-gold)" : "border-(--color-line) text-(--color-dim)"}`}
              >
                {s}秒
              </button>
            ))}
            <span className="mx-1 text-(--color-line)">|</span>
            <span className="text-(--color-dim)">カウント</span>
            {[0, 3].map((c) => (
              <button
                key={c}
                onClick={() => pick(CD_KEY, setCountdown)(c)}
                disabled={rec || count !== null}
                className={`rounded-lg border px-2.5 py-1.5 ${countdown === c ? "border-(--color-gold) text-(--color-gold)" : "border-(--color-line) text-(--color-dim)"}`}
              >
                {c === 0 ? "なし" : "3秒"}
              </button>
            ))}
            {ghostUrl && (
              <>
                <span className="mx-1 text-(--color-line)">|</span>
                <button
                  onClick={() => {
                    const next = !ghost;
                    setGhost(next);
                    try { window.localStorage.setItem(GHOST_KEY, next ? "1" : "0"); } catch { /* 保存できなくても撮影は続けられる */ }
                  }}
                  disabled={rec || count !== null}
                  className={`rounded-lg border px-2.5 py-1.5 ${ghost ? "border-(--color-active) text-(--color-active)" : "border-(--color-line) text-(--color-dim)"}`}
                >
                  👻 前回に重ねる
                </button>
              </>
            )}
          </div>
          <p className="mt-1.5 shrink-0 text-center text-[11px] text-(--color-dim)">
            {countdown > 0 ? `${countdown}秒カウントダウン後に録画開始` : "押した瞬間に録画開始"}・{limit}秒で自動停止 ／ マイクを塞がないでください（打球音でインパクトを検出）
            {ghostUrl && ghost && <><br />前回のスイングを薄く重ねています。人と打席の位置が重なるように立ち位置を合わせると、前回との数字の比較が効きます</>}
          </p>
        </div>
      )}
    </div>
  );
}
