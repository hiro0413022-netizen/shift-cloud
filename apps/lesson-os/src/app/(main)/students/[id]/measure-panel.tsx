"use client";

import { useRef, useState, useTransition } from "react";
import { CLUBS } from "@/lib/lesson";
import { TRACKMAN_FIELDS, TM_GROUP_LABEL, summarize, type TrackmanValues } from "@/lib/trackman";
import { createMeasureUploadUrl, readMeasurePhoto, saveMeasurement, removeMeasurement, measurePhotoUrl } from "./actions";

/**
 * 計測タブ（2026-08-22 ユーザー依頼）
 *
 *   トラックマンの画面をスマホで撮る → AIが数値を読む → 画面に出た値を人が直す → 保存
 *
 * AIは「入力の下書き」担当。保存されるのは必ずコーチが見た後の値なので、
 * 誤読があってもデータは汚れない（AIの生結果は ai_raw に別で残る）。
 * ANTHROPIC_API_KEY が無い環境では読み取りだけ効かず、手入力の計測台帳として使える。
 */

export type MeasurementItem = {
  id: string;
  measuredAt: string;
  club: string | null;
  note: string | null;
  hasPhoto: boolean;
  values: TrackmanValues;
};

const MAX_EDGE = 1600; // AIに送る前に縮める（通信・API上限・料金のすべてに効く）

async function downscale(file: File): Promise<{ blob: Blob; type: string }> {
  if (!file.type.startsWith("image/")) return { blob: file, type: file.type };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 3 * 1024 * 1024) return { blob: file, type: file.type };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, type: file.type };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ? { blob, type: "image/jpeg" } : { blob: file, type: file.type };
  } catch {
    return { blob: file, type: file.type };
  }
}

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function MeasurePanel({ studentId, items }: { studentId: string; items: MeasurementItem[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [aiRaw, setAiRaw] = useState<unknown>(null);
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [club, setClub] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setDraft(null);
    setUnits({});
    setAiRaw(null);
    setPath(null);
    setPreview(null);
    setClub("");
    setNote("");
    setWarn(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  /** 写真を選ぶ → 縮小 → アップロード → AI読取 → 下書きフォームを出す */
  const onPick = async (file: File) => {
    setMsg(null);
    setWarn(null);
    setBusy("写真を準備中…");
    try {
      const { blob, type } = await downscale(file);
      const url = await createMeasureUploadUrl(studentId, file.name || "trackman.jpg", blob.size);
      if (!url.url || !url.path) { setMsg(url.error ?? "アップロードURLの発行に失敗しました"); return; }
      setBusy("アップロード中…");
      const put = await fetch(url.url, { method: "PUT", headers: { "Content-Type": type }, body: blob });
      if (!put.ok) { setMsg(`アップロードに失敗しました（${put.status}）`); return; }
      setPath(url.path);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));

      setBusy("AIが数値を読み取り中…");
      const read = await readMeasurePhoto(studentId, url.path, type);
      const next: Record<string, string> = {};
      for (const f of TRACKMAN_FIELDS) {
        const v = read.values?.[f.key];
        next[f.key] = typeof v === "number" ? String(v) : "";
      }
      setDraft(next);
      setUnits((read.values?._units as Record<string, string> | undefined) ?? {});
      setAiRaw(read.raw ?? null);
      if (read.club) setClub(read.club);
      setWarn(read.error ?? read.warning ?? null);
      if (!read.error) setMsg("読み取りました。数値を確認して、違うところを直してから保存してください");
    } catch {
      setMsg("通信エラー。もう一度お試しください");
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    if (!draft) return;
    const values: TrackmanValues = {};
    for (const f of TRACKMAN_FIELDS) {
      const raw = (draft[f.key] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) values[f.key] = n;
    }
    if (Object.keys(units).length) values._units = units;
    startTransition(async () => {
      const r = await saveMeasurement(studentId, {
        path,
        measuredAt: date,
        club: club || undefined,
        note: note || undefined,
        values,
        aiRaw,
      });
      if (r.error) setMsg(r.error);
      else { setMsg("計測を保存しました"); reset(); }
    });
  };

  const openPhoto = (id: string) =>
    startTransition(async () => {
      const r = await measurePhotoUrl(id);
      if (r.url) window.open(r.url, "_blank", "noopener");
      else setMsg(r.error ?? "写真がありません");
    });

  return (
    <div className="space-y-4">
      {/* 取り込み */}
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        <p className="mb-1 text-sm font-medium text-(--color-gold)">トラックマンの数値を取り込む</p>
        <p className="mb-3 text-xs text-(--color-dim)">
          1ショットの計測画面をまっすぐ・明るく撮ってください。読み取った数値は保存前に直せます。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={!!busy || pending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); }}
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-(--color-line) file:bg-(--color-panel-2) file:px-3 file:py-1.5 file:text-sm file:text-(--color-txt) disabled:opacity-40"
        />
        {busy && <p className="mt-2 text-xs text-(--color-active)">{busy}</p>}
        {warn && <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">⚠ {warn}</p>}
        {msg && <p className="mt-2 text-xs text-(--color-dim)">{msg}</p>}
      </div>

      {/* 確認・修正フォーム */}
      {draft && (
        <div className="space-y-3 rounded-xl border border-(--color-active) bg-(--color-panel) p-4">
          <div className="flex flex-wrap items-start gap-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="撮影した計測画面" className="h-28 w-auto rounded-lg border border-(--color-line) object-contain" />
            )}
            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
              <label className="text-xs text-(--color-dim)">
                計測日
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-dark mt-1 w-full" />
              </label>
              <label className="text-xs text-(--color-dim)">
                クラブ
                <select value={club} onChange={(e) => setClub(e.target.value)} className="input-dark mt-1 w-full">
                  <option value="">未選択</option>
                  {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-xs text-(--color-dim)">
                メモ
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: finishでの詰まりを直した後" className="input-dark mt-1 w-full" />
              </label>
            </div>
          </div>

          {(["club", "ball", "flight"] as const).map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-xs font-medium text-(--color-gold)">{TM_GROUP_LABEL[g]}</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {TRACKMAN_FIELDS.filter((f) => f.group === g).map((f) => (
                  <label key={f.key} className="text-[11px] text-(--color-dim)">
                    {f.label}
                    <span className="ml-1 text-(--color-line)">{units[f.key] ?? f.unit}</span>
                    <input
                      inputMode="decimal"
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      placeholder="—"
                      className={`input-dark mt-1 w-full ${draft[f.key] ? "" : "opacity-60"}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <button onClick={reset} disabled={pending} className="btn-ghost">やめる</button>
            <button onClick={save} disabled={pending} className="btn-gold flex-1">{pending ? "保存中…" : "この内容で保存"}</button>
          </div>
        </div>
      )}

      {/* 保存済みの計測 */}
      {items.length === 0 && !draft && (
        <p className="text-sm text-(--color-dim)">まだ計測がありません</p>
      )}
      {items.map((m) => (
        <div key={m.id} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{m.measuredAt}</span>
            {m.club && <span className="rounded bg-(--color-header)/40 px-2 py-0.5 text-xs">{m.club}</span>}
            <span className="text-xs text-(--color-dim)">{summarize(m.values)}</span>
            <span className="ml-auto flex gap-2 text-xs">
              {m.hasPhoto && (
                <button onClick={() => openPhoto(m.id)} disabled={pending} className="btn-ghost !py-1">📷 写真</button>
              )}
              <button
                onClick={() => { if (window.confirm("この計測を削除しますか？")) startTransition(async () => { await removeMeasurement(m.id); }); }}
                disabled={pending}
                className="btn-ghost !py-1"
              >
                🗑
              </button>
            </span>
          </div>
          {m.note && <p className="mt-1 text-sm text-(--color-dim)">{m.note}</p>}
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
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
    </div>
  );
}
