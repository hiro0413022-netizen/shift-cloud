"use client";

import { useRef, useState, useTransition } from "react";
import { CLUBS, type Annotations } from "@/lib/lesson";
import type { Phases } from "@/lib/phases";
import { capturePoster } from "@/lib/poster";
import { SwingRecorder, type Captured, type RecordMeta } from "./swing-recorder";
import { VideoPlayer } from "./video-player";
import { CompareView, type CompareSource } from "./compare-view";
import { ProgressPanel, type ProgressItem } from "./progress-panel";
import { ProfileForm } from "./profile-form";
import { MeasurePanel, type MeasurementItem } from "./measure-panel";
import { LessonNotePanel } from "./lesson-note";
import { TRACKMAN_FIELDS } from "@/lib/trackman";
import type { LessonNoteItem } from "./actions";
import {
  createVideoUploadUrl,
  createPosterUploadUrl,
  registerVideo,
  addComment,
  markBest,
  removeVideo,
  issueShareLink,
  revokeShareLink,
} from "./actions";

export type VideoItem = {
  id: string;
  shotAt: string;
  club: string | null;
  distanceYd: number | null;
  note: string | null;
  isBest: boolean;
  uploadedBy: string;
  annotations: Annotations | null;
  phases: Phases | null;
  /** 再生URL（ページ表示時にまとめて発行済み・30分有効） */
  url: string | null;
  /** 1コマ目のJPEG。あればこれだけ先に出して動画は押されるまで読まない */
  posterUrl: string | null;
  comments: { id: string; body: string; coach: string; at: string }[];
};

export type StudentData = {
  id: string;
  name: string;
  kana: string | null;
  memberCode: string | null;
  goal: string | null;
  memo: string | null;
  photoUrl: string | null;
  profile: Record<string, string>;
  skill: Record<string, string>;
};

type Tab = "lesson" | "note" | "measure" | "progress" | "profile" | "skill" | "compare";
const TABS: { id: Tab; label: string }[] = [
  { id: "lesson", label: "本日のレッスン" },
  { id: "note", label: "会話メモ" },
  { id: "measure", label: "計測" },
  { id: "progress", label: "進捗" },
  { id: "profile", label: "基本情報" },
  { id: "skill", label: "詳細情報" },
  { id: "compare", label: "比較再生" },
];

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 本日のレッスンの1件（2026-09-03）
 *
 * それまで「本日のレッスン」は動画の羅列で、会話メモは別タブ、計測はさらに別タブだった。
 * レッスン中にタブを行き来しないと今日の全体が見えないので、
 * **スイング動画を軸に、その動画に紐づいた会話メモと計測を同じカードにまとめる**。
 * 動画の無い日のメモは、日付だけのカードとして同じ並びに混ぜる（消さない）。
 */
type LessonEntry = {
  key: string;
  date: string;
  video: VideoItem | null;
  notes: LessonNoteItem[];
  measures: MeasurementItem[];
};

function buildEntries(
  videos: VideoItem[],
  notes: LessonNoteItem[],
  measures: MeasurementItem[]
): LessonEntry[] {
  // その日の最後のスイング＝保存したときに紐づく先。まだ保存していないメモも
  // ここに出しておく（保存前と保存後で場所が変わると「消えた」と思われる）
  const latestOfDay = new Map<string, string>();
  for (const v of videos) if (!latestOfDay.has(v.shotAt)) latestOfDay.set(v.shotAt, v.id);

  const entries: LessonEntry[] = videos.map((v) => ({
    key: v.id,
    date: v.shotAt,
    video: v,
    notes: notes.filter(
      (n) => n.videoId === v.id || (!n.videoId && latestOfDay.get(n.lessonDate) === v.id)
    ),
    measures: measures.filter((m) => m.videoId === v.id),
  }));

  // その日に動画が1本も無いメモだけ、日付だけのレッスンとして並べる
  const loose = notes.filter((n) => !n.videoId && !latestOfDay.has(n.lessonDate));
  const dates = Array.from(new Set(loose.map((n) => n.lessonDate)));
  for (const d of dates) {
    entries.push({
      key: `date-${d}`,
      date: d,
      video: null,
      notes: loose.filter((n) => n.lessonDate === d),
      // その日の、どの動画にも紐づいていない計測も一緒に見せる
      measures: measures.filter((m) => !m.videoId && m.measuredAt === d),
    });
  }
  // 新しい順。同じ日なら動画のあるカードを先に出す
  return entries.sort((a, b) => (a.date === b.date ? (a.video ? -1 : 1) : a.date < b.date ? 1 : -1));
}

/** 前回のレッスン（今日より前でいちばん新しい、中身のあるメモ） */
function previousNote(notes: LessonNoteItem[], today: string): LessonNoteItem | null {
  const past = notes
    .filter((n) => n.lessonDate < today && (n.body || n.summary))
    .sort((a, b) => (a.lessonDate < b.lessonDate ? 1 : -1));
  return past[0] ?? null;
}

export function KarteClient({
  student,
  videos,
  progress,
  compareSources,
  measurements,
  lessonNotes,
}: {
  student: StudentData;
  videos: VideoItem[];
  progress: ProgressItem[];
  compareSources: CompareSource[];
  measurements: MeasurementItem[];
  lessonNotes: LessonNoteItem[];
}) {
  const [tab, setTab] = useState<Tab>("lesson");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [recOpen, setRecOpen] = useState(false);
  const [fileMode, setFileMode] = useState(false);
  /** 描画・フェーズ編集を開いている動画（通常のタップはその場で再生するだけ） */
  const [editVideo, setEditVideo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 本日のレッスン＝スイング動画＋その動画に紐づいた会話メモ・計測（2026-09-03）
  const entries = buildEntries(videos, lessonNotes, measurements);
  const prev = previousNote(lessonNotes, jstToday());
  // 紐づけ先の選択に出す動画（会話メモ・計測の両方で使う）
  const linkVideos = videos.map((v) => ({ id: v.id, shotAt: v.shotAt, club: v.club }));

  const fileRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const clubRef = useRef<HTMLSelectElement>(null);
  const distRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  /**
   * 動画1本を登録する（撮影モジュールからもファイル選択からもここを通る）。
   *
   * サムネイル（1コマ目JPEG）もここで作る。取れなくても登録は続行する
   * ＝サムネのために「登録できませんでした」にはしない。
   */
  const registerBlob = async (
    blob: Blob,
    meta: RecordMeta,
    opts: {
      fileName?: string;
      phases?: Phases | null;
      duration?: number;
      source: "recorder" | "upload";
      /** 撮影モジュールで切り出し済みのサムネ。あれば作り直さない */
      poster?: Blob | null;
    }
  ): Promise<string | null> => {
    const name = opts.fileName ?? `swing_${Date.now()}.mp4`;
    setProgressText("準備中…");
    const r = await createVideoUploadUrl(student.id, name, blob.size);
    if (!r.url || !r.path) return r.error ?? "URL発行に失敗しました";

    setProgressText(`アップロード中…（${(blob.size / 1024 / 1024).toFixed(1)}MB）`);
    // codecs 付きの Content-Type（video/mp4;codecs=avc1...）で保存すると
    // iOS Safari が署名URLからの再生に失敗するため、素の type に落とす（2026-08-26）
    const ctype = (blob.type || "video/mp4").split(";")[0].trim() || "video/mp4";
    const res = await fetch(r.url, { method: "PUT", headers: { "Content-Type": ctype }, body: blob });
    if (!res.ok) return `アップロードに失敗しました（${res.status}）`;

    // サムネイル（任意）
    let posterPath: string | null = null;
    try {
      setProgressText("サムネイルを作成中…");
      const poster = opts.poster ?? (await capturePoster(blob));
      if (poster) {
        const pu = await createPosterUploadUrl(student.id, poster.size);
        if (pu.url && pu.path) {
          const pr = await fetch(pu.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: poster });
          if (pr.ok) posterPath = pu.path;
        }
      }
    } catch {
      /* サムネは無くても動く（poster_path null で従来表示にフォールバック） */
    }

    setProgressText("登録中…");
    const dist = Number(meta.distanceYd);
    const reg = await registerVideo(student.id, {
      path: r.path,
      posterPath,
      shotAt: meta.shotAt || jstToday(),
      club: meta.club || undefined,
      distanceYd: Number.isFinite(dist) && dist > 0 ? dist : undefined,
      note: meta.note || undefined,
      size: blob.size,
      phases: opts.phases ?? null,
      duration: opts.duration,
      source: opts.source,
    });
    return reg.error ?? null;
  };

  /** 撮影モジュールからの登録 */
  const registerFromRecorder = async (c: Captured, meta: RecordMeta): Promise<string | null> => {
    setBusy(true);
    try {
      const err = await registerBlob(c.blob, meta, {
        fileName: `swing_${Date.now()}.${c.ext}`,
        phases: c.phases,
        duration: c.duration,
        source: "recorder",
        poster: c.poster,
      });
      setMsg(err ?? "スイングを登録しました");
      return err;
    } catch {
      const e = "通信エラー。もう一度お試しください";
      setMsg(e);
      return e;
    } finally {
      setBusy(false);
      setProgressText(null);
    }
  };

  /** ファイルを選んで登録（カメラアプリで撮ったものを取り込む場合） */
  const uploadFile = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg("動画を選択してください"); return; }
    setBusy(true);
    try {
      const err = await registerBlob(
        file,
        {
          club: clubRef.current?.value ?? "",
          distanceYd: distRef.current?.value ?? "",
          note: noteRef.current?.value ?? "",
          shotAt: dateRef.current?.value || jstToday(),
        },
        { fileName: file.name, source: "upload" }
      );
      setMsg(err ?? "スイングを登録しました");
      if (!err && fileRef.current) fileRef.current.value = "";
    } catch {
      setMsg("通信エラー。もう一度お試しください");
    } finally {
      setBusy(false);
      setProgressText(null);
    }
  };

  const comment = (id: string) => {
    const body = drafts[id] ?? "";
    if (!body.trim()) return;
    startTransition(async () => {
      const r = await addComment(id, body);
      if (!r.error) setDrafts({ ...drafts, [id]: "" });
      else setMsg(r.error);
    });
  };

  const share = () =>
    startTransition(async () => {
      const r = await issueShareLink(student.id);
      if (r.url) setShareUrl(`${window.location.origin}${r.url}`);
      else setMsg(r.error ?? "発行に失敗しました");
    });

  return (
    <div className="space-y-4">
      {/* 生徒ヘッダ（PGA NOTE風: 写真＋名前＋受講理由/目標） */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-(--color-line) bg-(--color-panel) p-3 md:gap-4 md:p-4">
        {student.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.photoUrl} alt={student.name} className="h-14 w-14 rounded-lg object-cover md:h-16 md:w-16" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-(--color-panel-2) text-xl font-semibold text-(--color-gold) md:h-16 md:w-16">
            {student.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            {student.name}
            {student.kana && <span className="ml-2 text-xs font-normal text-(--color-dim)">{student.kana}</span>}
          </h1>
          <p className="truncate text-sm text-(--color-dim)">
            {student.goal ? `🎯 ${student.goal}` : "目標未設定"}
            {student.memberCode ? ` ・ 会員 ${student.memberCode}` : ""}
          </p>
        </div>
        {/* スマホでは名前の下に回す（右に置くと名前が潰れる） */}
        <div className="w-full shrink-0 md:w-auto md:text-right">
          {shareUrl ? (
            <div className="md:max-w-[220px]">
              <p className="mb-1 text-[10px] text-(--color-dim)">生徒に送るURL（LINE等で共有）</p>
              <div className="flex gap-1">
                <input readOnly value={shareUrl} className="input-dark w-full !py-1 text-[10px]" onFocus={(e) => e.currentTarget.select()} />
                <button onClick={() => { void navigator.clipboard?.writeText(shareUrl); setMsg("コピーしました"); }} className="btn-ghost !px-2 !py-1 text-xs">📋</button>
              </div>
              <button onClick={() => startTransition(async () => { await revokeShareLink(student.id); setShareUrl(null); setMsg("共有を停止しました"); })} className="mt-1 text-[10px] text-(--color-dim) underline">共有を停止する</button>
            </div>
          ) : (
            <button onClick={share} disabled={pending} className="btn-ghost w-full text-xs md:w-auto">🔗 生徒へ共有リンク</button>
          )}
        </div>
      </div>

      {/* タブ。スマホは横に流す（7つを2〜3列に折ると縦に伸びて、下の内容が画面から押し出される） */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-(--color-line) bg-(--color-panel) p-1 text-sm md:grid md:grid-cols-7 md:text-center">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-2 whitespace-nowrap md:px-2 ${
              tab === t.id ? "bg-(--color-active) font-semibold text-white" : "text-(--color-dim)"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {msg && <p className="text-xs text-(--color-dim)">{msg}</p>}

      {tab === "lesson" && (
        <div className="space-y-4">
          {/* 撮る導線。ここが主役なので大きく1つだけ置く */}
          <button
            onClick={() => setRecOpen(true)}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-gold) py-4 text-base font-semibold text-black disabled:opacity-50"
          >
            📹 スイングを撮影する
          </button>
          <p className="-mt-2 text-center text-[11px] text-(--color-dim)">
            押すとカメラが開きます。3秒カウント→自動停止→クラブを選んで登録まで、この画面で終わります
          </p>

          {/* すでにカメラアプリで撮ってある動画を取り込む場合だけ開く */}
          {!fileMode ? (
            <button onClick={() => setFileMode(true)} className="w-full text-center text-xs text-(--color-dim) underline">
              動画ファイルから取り込む
            </button>
          ) : (
            <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-(--color-gold)">動画ファイルから取り込む</p>
                <button onClick={() => setFileMode(false)} className="text-xs text-(--color-dim) underline">閉じる</button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <input ref={fileRef} type="file" accept="video/*" className="col-span-2 text-sm file:mr-3 file:rounded-lg file:border file:border-(--color-line) file:bg-(--color-panel-2) file:px-3 file:py-1.5 file:text-sm file:text-(--color-txt) md:col-span-1" />
                <input ref={dateRef} type="date" defaultValue={jstToday()} className="input-dark" />
                <select ref={clubRef} className="input-dark" defaultValue="">
                  <option value="">クラブ</option>
                  {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input ref={distRef} type="number" placeholder="飛距離(yd)" className="input-dark" />
                <input ref={noteRef} placeholder="メモ" className="input-dark" />
              </div>
              <div className="mt-3">
                <button onClick={uploadFile} disabled={busy} className="btn-gold">{busy ? progressText ?? "処理中…" : "⬆ 登録"}</button>
              </div>
            </div>
          )}

          {busy && progressText && <p className="text-center text-xs text-(--color-active)">{progressText}</p>}

          {recOpen && (
            <SwingRecorder
              onClose={() => setRecOpen(false)}
              onRegister={registerFromRecorder}
              // 前回の画角に合わせるためのゴースト。三脚を毎回据えるのは現場で続かない（2026-08-28）
              ghostUrl={videos.find((v) => v.posterUrl)?.posterUrl ?? null}
            />
          )}

          {/* 前回のふりかえり（2026-09-03）。今日いちばん最初に見たいのはこれ */}
          {prev && (
            <div className="rounded-xl border border-(--color-active)/50 bg-(--color-panel) p-4">
              <p className="text-sm font-medium text-(--color-active)">前回のレッスン（{prev.lessonDate}）で話したこと</p>
              {prev.summary && (
                <div className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
                  {([
                    ["直したこと", prev.summary.today],
                    ["出した宿題", prev.summary.homework],
                    ["次回みるところ", prev.summary.next],
                  ] as [string, string[]][])
                    .filter(([, v]) => v.length)
                    .map(([label, v]) => (
                      <div key={label}>
                        <span className="text-(--color-dim)">{label}</span>
                        <ul className="ml-4 list-disc">{v.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    ))}
                </div>
              )}
              {prev.body && <p className="mt-2 whitespace-pre-wrap text-sm text-(--color-dim)">{prev.body}</p>}
              {!prev.summary && !prev.body && (
                <p className="mt-1 text-xs text-(--color-dim)">前回のメモはまだ確定していません</p>
              )}
            </div>
          )}

          {/* レッスンの並び（スイング動画＋その日の会話メモ＋計測） */}
          {entries.length === 0 && <p className="text-sm text-(--color-dim)">まだスイングがありません</p>}
          {entries.map((e) => {
            const v = e.video;
            return (
            <div key={e.key} className={`overflow-hidden rounded-xl border bg-(--color-panel) ${v?.isBest ? "border-(--color-gold)" : "border-(--color-line)"}`}>
              <div className="flex flex-wrap items-center gap-2 px-4 pt-4 text-sm">
                <span className="font-medium">{e.date}</span>
                {v?.club && <span className="rounded bg-(--color-header)/40 px-2 py-0.5 text-xs">{v.club}</span>}
                {v?.distanceYd != null && <span className="rounded bg-(--color-panel-2) px-2 py-0.5 text-xs text-(--color-dim)">{v.distanceYd}yd</span>}
                {v?.isBest && <span className="rounded bg-(--color-gold)/20 px-2 py-0.5 text-xs text-(--color-gold)">★ ベストスイング</span>}
                {!v && <span className="rounded bg-(--color-panel-2) px-2 py-0.5 text-xs text-(--color-dim)">スイング動画なし</span>}
                <span className="ml-auto text-xs text-(--color-dim)">{v?.uploadedBy}</span>
              </div>
              {v?.note && <p className="px-4 pt-1 text-sm text-(--color-dim)">{v.note}</p>}

              {/* 押す前から1コマ目が見えていて、押せばその場で再生される */}
              {v && (
                <div className="mt-3">
                  {editVideo === v.id && v.url ? (
                    <div className="px-4">
                      <VideoPlayer videoId={v.id} src={v.url} initial={v.annotations} initialPhases={v.phases} />
                      <button onClick={() => setEditVideo(null)} className="btn-ghost mt-2 text-xs">描画・フェーズを閉じる</button>
                    </div>
                  ) : v.url ? (
                    <video
                      src={v.posterUrl ? v.url : `${v.url}#t=0.1`}
                      poster={v.posterUrl ?? undefined}
                      controls
                      playsInline
                      // サムネイルがあるなら動画本体は押されるまで読まない（4Gでの待ちとギガを節約）
                      preload={v.posterUrl ? "none" : "metadata"}
                      className="max-h-[70vh] w-full bg-black"
                    />
                  ) : (
                    <p className="px-4 pb-2 text-xs text-(--color-danger)">再生URLを取得できませんでした。再読み込みしてください</p>
                  )}
                </div>
              )}

              {v && (
                <div className="flex flex-wrap gap-2 px-4 pt-2 text-xs">
                  {editVideo !== v.id && (
                    <button onClick={() => setEditVideo(v.id)} disabled={!v.url} className="btn-ghost !py-1.5 disabled:opacity-40">
                      ✎ 描画・フェーズ・スロー
                    </button>
                  )}
                  <button onClick={() => startTransition(async () => { await markBest(v.id); })} disabled={pending} className="btn-ghost !py-1.5 hover:text-(--color-gold)">
                    {v.isBest ? "★ ベスト解除" : "☆ ベストにする"}
                  </button>
                  <button
                    onClick={() => { if (window.confirm("この動画を削除しますか？")) startTransition(async () => { await removeVideo(v.id); }); }}
                    disabled={pending}
                    className="btn-ghost !py-1.5"
                  >
                    🗑 削除
                  </button>
                </div>
              )}

              {/* このスイングの計測（レッスンデータ）。紐づけていなければ何も出さない */}
              {e.measures.map((m) => (
                <div key={m.id} className="mt-3 border-t border-(--color-line) px-4 py-3">
                  <p className="text-xs font-medium text-(--color-gold)">
                    レッスンデータ{m.club ? ` ・ ${m.club}` : ""}
                  </p>
                  {m.note && <p className="mt-0.5 text-xs text-(--color-dim)">{m.note}</p>}
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
                    {TRACKMAN_FIELDS.filter((f) => typeof m.values[f.key] === "number").map((f) => (
                      <div key={f.key} className="flex justify-between border-b border-(--color-line)/40 py-0.5">
                        <span className="text-(--color-dim)">{f.label}</span>
                        <span className="tabular-nums">
                          {m.values[f.key]}
                          <span className="ml-0.5 text-(--color-dim)">{m.values._units?.[f.key] ?? f.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* このレッスンの会話メモ（本文はコピーせず、会話メモの正典をそのまま出す） */}
              {e.notes.map((n) => (
                <div key={n.id} className="mt-3 border-t border-(--color-line) px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-(--color-gold)">会話メモ</p>
                    {n.status !== "saved" && (
                      <span className="rounded bg-(--color-panel-2) px-2 py-0.5 text-[11px] text-(--color-dim)">
                        {n.status === "summarized" ? "下書き（未確定）" : n.status === "failed" ? "失敗" : "作成中"}
                      </span>
                    )}
                    <button onClick={() => setTab("note")} className="ml-auto text-[11px] text-(--color-dim) underline">
                      会話メモを開く
                    </button>
                  </div>
                  {n.body && <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>}
                  {n.shareBody && (
                    <div className="mt-2 rounded-lg border border-(--color-gold)/40 bg-(--color-panel-2) px-3 py-2">
                      <p className="text-[11px] text-(--color-gold)">お客様への説明（お客様の画面に出ています）</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{n.shareBody}</p>
                    </div>
                  )}
                  {n.symptoms.filter((t) => !t.rejected).length > 0 && (
                    <p className="mt-1.5 text-[11px] text-(--color-dim)">
                      症状: {n.symptoms.filter((t) => !t.rejected).map((t) => t.symptom).join(" / ")}
                    </p>
                  )}
                </div>
              ))}

              {/* コーチコメント */}
              {v && (
                <div className="mt-3 space-y-2 border-t border-(--color-line) px-4 py-3">
                  <p className="text-xs font-medium text-(--color-gold)">コーチからのアドバイス</p>
                  {v.comments.map((c) => (
                    <div key={c.id} className="rounded-lg bg-(--color-panel-2) px-3 py-2">
                      <p className="text-xs text-(--color-dim)">{c.coach} ・ {c.at}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={drafts[v.id] ?? ""}
                      onChange={(e2) => setDrafts({ ...drafts, [v.id]: e2.target.value })}
                      placeholder="アドバイス・次回の課題を書く"
                      className="input-dark min-w-0 flex-1"
                    />
                    <button onClick={() => comment(v.id)} disabled={pending || !(drafts[v.id] ?? "").trim()} className="btn-gold !px-3">送信</button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* 会話を録音してAIがメモの下書きを作る（2026-08-28）。確定はコーチが行う。
          **タブを移っても閉じない**（hidden にするだけ）。閉じてしまうと録音が止まり、
          裏で走っているAIの進み具合も見失う（2026-09-03） */}
      <div className={tab === "note" ? "" : "hidden"}>
        <LessonNotePanel studentId={student.id} initial={lessonNotes} videos={linkVideos} />
      </div>
      {tab === "measure" && <MeasurePanel studentId={student.id} items={measurements} videos={linkVideos} />}
      {tab === "progress" && <ProgressPanel studentId={student.id} items={progress} />}
      {tab === "profile" && (
        <ProfileForm
          studentId={student.id}
          kind="profile"
          values={student.profile}
          extra={{ goal: student.goal ?? "", memo: student.memo ?? "", memberCode: student.memberCode ?? "" }}
          photoUrl={student.photoUrl}
        />
      )}
      {tab === "skill" && <ProfileForm studentId={student.id} kind="skill" values={student.skill} />}
      {tab === "compare" && <CompareView sources={compareSources} />}
    </div>
  );
}
