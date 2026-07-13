"use client";

import { useRef, useState, useTransition } from "react";
import {
  createVideoUploadUrl,
  registerVideo,
  videoPlayUrl,
  addComment,
  markBest,
  removeVideo,
  updateStudent,
} from "./actions";

export type VideoItem = {
  id: string;
  shotAt: string;
  club: string | null;
  note: string | null;
  isBest: boolean;
  uploadedBy: string;
  comments: { id: string; body: string; coach: string; at: string }[];
};

type Student = {
  id: string;
  name: string;
  kana: string | null;
  memberCode: string | null;
  goal: string | null;
  memo: string | null;
};

export function KarteClient({ student, videos }: { student: Student; videos: VideoItem[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editProfile, setEditProfile] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const clubRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const goalRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // 動画アップロード: 署名URLへブラウザから直接PUT
  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg("動画を選択してください"); return; }
    setBusy(true);
    setProgress("アップロード準備中…");
    try {
      const r = await createVideoUploadUrl(student.id, file.name, file.size);
      if (!r.url || !r.path) { setMsg(r.error ?? "URL発行に失敗しました"); return; }
      setProgress(`アップロード中…（${(file.size / 1024 / 1024).toFixed(1)}MB）`);
      const res = await fetch(r.url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!res.ok) { setMsg(`アップロードに失敗しました（${res.status}）`); return; }
      const reg = await registerVideo(student.id, {
        path: r.path,
        shotAt: dateRef.current?.value || undefined,
        club: clubRef.current?.value || undefined,
        note: noteRef.current?.value || undefined,
        size: file.size,
      });
      setMsg(reg.error ?? "アップロードしました");
      if (!reg.error && fileRef.current) fileRef.current.value = "";
    } catch {
      setMsg("通信エラー。もう一度お試しください");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const play = (id: string) =>
    startTransition(async () => {
      const r = await videoPlayUrl(id);
      if (r.url) setPlaying({ id, url: r.url });
      else setMsg(r.error ?? "再生できません");
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

  const saveProfile = () =>
    startTransition(async () => {
      const r = await updateStudent(student.id, {
        goal: goalRef.current?.value,
        memo: memoRef.current?.value,
        member_code: codeRef.current?.value,
      });
      setMsg(r.error ?? "保存しました");
      if (!r.error) setEditProfile(false);
    });

  return (
    <div className="space-y-5">
      {/* 生徒ヘッダ */}
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {student.name}
              {student.kana && <span className="ml-2 text-sm font-normal text-[--color-dim]">{student.kana}</span>}
            </h1>
            {!editProfile ? (
              <>
                <p className="mt-1 text-sm">{student.goal ? `🎯 ${student.goal}` : <span className="text-[--color-dim]">目標未設定</span>}</p>
                {student.memo && <p className="mt-1 whitespace-pre-wrap text-xs text-[--color-dim]">{student.memo}</p>}
                {student.memberCode && <p className="mt-1 text-xs text-[--color-dim]">会員番号: {student.memberCode}</p>}
              </>
            ) : (
              <div className="mt-2 space-y-2">
                <input ref={goalRef} defaultValue={student.goal ?? ""} placeholder="目標（例: 90台で回る）" className="w-full rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm" />
                <textarea ref={memoRef} defaultValue={student.memo ?? ""} rows={2} placeholder="メモ（体の特徴・注意点など）" className="w-full rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm" />
                <input ref={codeRef} defaultValue={student.memberCode ?? ""} placeholder="会員番号（Smart Hallo）" className="w-full rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm" />
                <button onClick={saveProfile} disabled={pending} className="rounded-lg bg-sky-500/20 px-4 py-1.5 text-sm text-sky-300 disabled:opacity-40">保存</button>
              </div>
            )}
          </div>
          <button onClick={() => setEditProfile(!editProfile)} className="shrink-0 rounded-lg border border-[--color-line] px-3 py-1.5 text-xs text-[--color-dim]">
            {editProfile ? "閉じる" : "✎ 編集"}
          </button>
        </div>
      </div>

      {/* アップロード（スマホはカメラ起動可） */}
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
        <p className="mb-3 text-sm font-medium">スイング動画を追加</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input ref={fileRef} type="file" accept="video/*" className="col-span-2 text-sm file:mr-3 file:rounded-lg file:border file:border-[--color-line] file:bg-[--color-panel-2] file:px-3 file:py-1.5 file:text-sm file:text-[--color-txt] md:col-span-1" />
          <input ref={dateRef} type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5 text-sm" />
          <input ref={clubRef} placeholder="クラブ（DR / 7I…）" className="rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5 text-sm" />
          <input ref={noteRef} placeholder="ひとことメモ" className="rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5 text-sm" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={upload} disabled={busy} className="rounded-lg bg-sky-500/20 px-4 py-2 text-sm text-sky-300 disabled:opacity-40">
            {busy ? progress ?? "処理中…" : "⬆ アップロード"}
          </button>
          {msg && <span className="text-xs text-[--color-dim]">{msg}</span>}
        </div>
      </div>

      {/* 動画タイムライン */}
      {videos.length === 0 && <p className="text-sm text-[--color-dim]">まだ動画がありません</p>}
      <div className="space-y-4">
        {videos.map((v) => (
          <div key={v.id} className={`rounded-xl border bg-[--color-panel] p-4 ${v.isBest ? "border-[--color-gold]" : "border-[--color-line]"}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{v.shotAt}</span>
              {v.club && <span className="rounded bg-[--color-panel-2] px-2 py-0.5 text-xs text-[--color-dim]">{v.club}</span>}
              {v.isBest && <span className="rounded bg-[--color-gold]/20 px-2 py-0.5 text-xs text-[--color-gold]">★ ベストスイング</span>}
              <span className="ml-auto text-xs text-[--color-dim]">{v.uploadedBy}</span>
            </div>
            {v.note && <p className="mt-1 text-sm text-[--color-dim]">{v.note}</p>}

            {playing?.id === v.id ? (
              <video src={playing.url} controls autoPlay playsInline className="mt-3 max-h-[70vh] w-full rounded-lg bg-black" />
            ) : (
              <button onClick={() => play(v.id)} disabled={pending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[--color-line] bg-[--color-panel-2] py-6 text-sm text-[--color-dim] hover:text-[--color-txt] disabled:opacity-40">
                ▶ 動画を再生
              </button>
            )}

            {/* コメント */}
            <div className="mt-3 space-y-2 border-t border-[--color-line] pt-3">
              {v.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-[--color-panel-2] px-3 py-2">
                  <p className="text-xs text-[--color-dim]">{c.coach} ・ {c.at}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={drafts[v.id] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [v.id]: e.target.value })}
                  placeholder="コーチコメントを書く"
                  className="min-w-0 flex-1 rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm"
                />
                <button onClick={() => comment(v.id)} disabled={pending || !(drafts[v.id] ?? "").trim()} className="rounded-lg bg-sky-500/20 px-3 py-2 text-sm text-sky-300 disabled:opacity-40">送信</button>
              </div>
            </div>

            <div className="mt-3 flex gap-2 text-xs">
              <button onClick={() => startTransition(async () => { await markBest(v.id); })} disabled={pending} className="rounded-lg border border-[--color-line] px-2.5 py-1.5 text-[--color-dim] hover:text-[--color-gold] disabled:opacity-40">
                {v.isBest ? "★ ベスト解除" : "☆ ベストにする"}
              </button>
              <button
                onClick={() => { if (window.confirm("この動画を削除しますか？")) startTransition(async () => { await removeVideo(v.id); }); }}
                disabled={pending}
                className="rounded-lg border border-[--color-line] px-2.5 py-1.5 text-[--color-dim] disabled:opacity-40"
              >
                🗑 削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
