"use client";

import { useRef, useState, useTransition } from "react";
import { CLUBS, type Annotations } from "@/lib/lesson";
import { VideoPlayer } from "./video-player";
import { CompareView, type CompareSource } from "./compare-view";
import { ProgressPanel, type ProgressItem } from "./progress-panel";
import { ProfileForm } from "./profile-form";
import {
  createVideoUploadUrl,
  registerVideo,
  videoPlayUrls,
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

type Tab = "lesson" | "progress" | "profile" | "skill" | "compare";
const TABS: { id: Tab; label: string }[] = [
  { id: "lesson", label: "本日のレッスン" },
  { id: "progress", label: "進捗" },
  { id: "profile", label: "基本情報" },
  { id: "skill", label: "詳細情報" },
  { id: "compare", label: "比較再生" },
];

export function KarteClient({
  student,
  videos,
  progress,
  compareSources,
}: {
  student: StudentData;
  videos: VideoItem[];
  progress: ProgressItem[];
  compareSources: CompareSource[];
}) {
  const [tab, setTab] = useState<Tab>("lesson");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [playUrls, setPlayUrls] = useState<Record<string, string>>({});
  const [openVideo, setOpenVideo] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const clubRef = useRef<HTMLSelectElement>(null);
  const distRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg("動画を選択してください"); return; }
    setBusy(true);
    setProgressText("準備中…");
    try {
      const r = await createVideoUploadUrl(student.id, file.name, file.size);
      if (!r.url || !r.path) { setMsg(r.error ?? "URL発行に失敗しました"); return; }
      setProgressText(`アップロード中…（${(file.size / 1024 / 1024).toFixed(1)}MB）`);
      const res = await fetch(r.url, { method: "PUT", headers: { "Content-Type": file.type || "video/mp4" }, body: file });
      if (!res.ok) { setMsg(`アップロードに失敗しました（${res.status}）`); return; }
      const reg = await registerVideo(student.id, {
        path: r.path,
        shotAt: dateRef.current?.value || undefined,
        club: clubRef.current?.value || undefined,
        distanceYd: distRef.current?.value ? Number(distRef.current.value) : undefined,
        note: noteRef.current?.value || undefined,
        size: file.size,
      });
      setMsg(reg.error ?? "スイングを登録しました");
      if (!reg.error && fileRef.current) fileRef.current.value = "";
    } catch {
      setMsg("通信エラー。もう一度お試しください");
    } finally {
      setBusy(false);
      setProgressText(null);
    }
  };

  const open = (id: string) =>
    startTransition(async () => {
      if (playUrls[id]) { setOpenVideo(openVideo === id ? null : id); return; }
      const r = await videoPlayUrls([id]);
      if (r.urls) {
        setPlayUrls((p) => ({ ...p, ...r.urls }));
        setOpenVideo(id);
      } else setMsg(r.error ?? "再生できません");
    });

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

      {/* タブ（PGA NOTE: 本日のレッスン/基本情報/詳細情報…） */}
      <div className="grid grid-cols-5 gap-1 rounded-xl border border-(--color-line) bg-(--color-panel) p-1 text-center text-xs md:text-sm">
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
          {/* スイング撮影・登録 */}
          <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
            <p className="mb-3 text-sm font-medium text-(--color-gold)">スイング撮影・登録（スマホはその場で撮影できます）</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <input ref={fileRef} type="file" accept="video/*" className="col-span-2 text-sm file:mr-3 file:rounded-lg file:border file:border-(--color-line) file:bg-(--color-panel-2) file:px-3 file:py-1.5 file:text-sm file:text-(--color-txt) md:col-span-1" />
              <input ref={dateRef} type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input-dark" />
              <select ref={clubRef} className="input-dark" defaultValue="">
                <option value="">クラブ</option>
                {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input ref={distRef} type="number" placeholder="飛距離(yd)" className="input-dark" />
              <input ref={noteRef} placeholder="メモ" className="input-dark" />
            </div>
            <div className="mt-3">
              <button onClick={upload} disabled={busy} className="btn-gold">{busy ? progressText ?? "処理中…" : "⬆ 登録"}</button>
            </div>
          </div>

          {/* 動画タイムライン */}
          {videos.length === 0 && <p className="text-sm text-(--color-dim)">まだスイングがありません</p>}
          {videos.map((v) => (
            <div key={v.id} className={`rounded-xl border bg-(--color-panel) p-4 ${v.isBest ? "border-(--color-gold)" : "border-(--color-line)"}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{v.shotAt}</span>
                {v.club && <span className="rounded bg-(--color-header)/40 px-2 py-0.5 text-xs">{v.club}</span>}
                {v.distanceYd != null && <span className="rounded bg-(--color-panel-2) px-2 py-0.5 text-xs text-(--color-dim)">{v.distanceYd}yd</span>}
                {v.isBest && <span className="rounded bg-(--color-gold)/20 px-2 py-0.5 text-xs text-(--color-gold)">★ ベストスイング</span>}
                <span className="ml-auto text-xs text-(--color-dim)">{v.uploadedBy}</span>
              </div>
              {v.note && <p className="mt-1 text-sm text-(--color-dim)">{v.note}</p>}

              {openVideo === v.id && playUrls[v.id] ? (
                <div className="mt-3">
                  <VideoPlayer videoId={v.id} src={playUrls[v.id]} initial={v.annotations} />
                </div>
              ) : (
                <button onClick={() => open(v.id)} disabled={pending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-(--color-line) bg-black/40 py-6 text-sm text-(--color-dim) hover:text-(--color-txt) disabled:opacity-40">
                  ▶ 再生・描画をひらく
                </button>
              )}

              {/* コーチコメント */}
              <div className="mt-3 space-y-2 border-t border-(--color-line) pt-3">
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

              <div className="mt-3 flex gap-2 text-xs">
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
            </div>
          ))}
        </div>
      )}

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
