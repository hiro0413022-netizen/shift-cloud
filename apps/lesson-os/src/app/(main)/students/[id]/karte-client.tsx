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

type Tab = "lesson" | "measure" | "progress" | "profile" | "skill" | "compare";
const TABS: { id: Tab; label: string }[] = [
  { id: "lesson", label: "本日のレッスン" },
  { id: "measure", label: "計測" },
  { id: "progress", label: "進捗" },
  { id: "profile", label: "基本情報" },
  { id: "skill", label: "詳細情報" },
  { id: "compare", label: "比較再生" },
];

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function KarteClient({
  student,
  videos,
  progress,
  compareSources,
  measurements,
}: {
  student: StudentData;
  videos: VideoItem[];
  progress: ProgressItem[];
  compareSources: CompareSource[];
  measurements: MeasurementItem[];
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
      <div className="flex items-center gap-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        {student.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.photoUrl} alt={student.name} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-(--color-panel-2) text-xl font-semibold text-(--color-gold)">
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
        <div className="shrink-0 text-right">
          {shareUrl ? (
            <div className="max-w-[220px]">
              <p className="mb-1 text-[10px] text-(--color-dim)">生徒に送るURL（LINE等で共有）</p>
              <div className="flex gap-1">
                <input readOnly value={shareUrl} className="input-dark w-full !py-1 text-[10px]" onFocus={(e) => e.currentTarget.select()} />
                <button onClick={() => { void navigator.clipboard?.writeText(shareUrl); setMsg("コピーしました"); }} className="btn-ghost !px-2 !py-1 text-xs">📋</button>
              </div>
              <button onClick={() => startTransition(async () => { await revokeShareLink(student.id); setShareUrl(null); setMsg("共有を停止しました"); })} className="mt-1 text-[10px] text-(--color-dim) underline">共有を停止する</button>
            </div>
          ) : (
            <button onClick={share} disabled={pending} className="btn-ghost text-xs">🔗 生徒へ共有リンク</button>
          )}
        </div>
      </div>

      {/* タブ */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-(--color-line) bg-(--color-panel) p-1 text-center text-xs md:grid-cols-6 md:text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg py-2 ${tab === t.id ? "bg-(--color-active) font-semibold text-white" : "text-(--color-dim)"}`}
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

          {/* 動画タイムライン */}
          {videos.length === 0 && <p className="text-sm text-(--color-dim)">まだスイングがありません</p>}
          {videos.map((v) => (
            <div key={v.id} className={`overflow-hidden rounded-xl border bg-(--color-panel) ${v.isBest ? "border-(--color-gold)" : "border-(--color-line)"}`}>
              <div className="flex flex-wrap items-center gap-2 px-4 pt-4 text-sm">
                <span className="font-medium">{v.shotAt}</span>
                {v.club && <span className="rounded bg-(--color-header)/40 px-2 py-0.5 text-xs">{v.club}</span>}
                {v.distanceYd != null && <span className="rounded bg-(--color-panel-2) px-2 py-0.5 text-xs text-(--color-dim)">{v.distanceYd}yd</span>}
                {v.isBest && <span className="rounded bg-(--color-gold)/20 px-2 py-0.5 text-xs text-(--color-gold)">★ ベストスイング</span>}
                <span className="ml-auto text-xs text-(--color-dim)">{v.uploadedBy}</span>
              </div>
              {v.note && <p className="px-4 pt-1 text-sm text-(--color-dim)">{v.note}</p>}

              {/* 押す前から1コマ目が見えていて、押せばその場で再生される */}
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

              {/* コーチコメント */}
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
                    onChange={(e) => setDrafts({ ...drafts, [v.id]: e.target.value })}
                    placeholder="アドバイス・次回の課題を書く"
                    className="input-dark min-w-0 flex-1"
                  />
                  <button onClick={() => comment(v.id)} disabled={pending || !(drafts[v.id] ?? "").trim()} className="btn-gold !px-3">送信</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "measure" && <MeasurePanel studentId={student.id} items={measurements} />}
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
