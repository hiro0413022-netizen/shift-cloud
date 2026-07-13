"use client";

import { useRef, useState, useTransition } from "react";
import { PROFILE_FIELDS, SKILL_FIELDS, type FieldDef } from "@/lib/lesson";
import { updateStudent, createPhotoUploadUrl, setPhoto } from "./actions";

/**
 * 基本情報・詳細情報の編集（PGA NOTE準拠のフィールド構成 / JSONB保存）
 * 顔写真のアップロードもここから（署名URL直PUT）。
 */
export function ProfileForm({
  studentId,
  kind,
  values,
  extra,
  photoUrl,
}: {
  studentId: string;
  kind: "profile" | "skill";
  values: Record<string, string>;
  extra?: { goal: string; memo: string; memberCode: string };
  photoUrl?: string | null;
}) {
  const fields: FieldDef[] = kind === "profile" ? PROFILE_FIELDS : SKILL_FIELDS;
  const [form, setForm] = useState<Record<string, string>>(values);
  const [goal, setGoal] = useState(extra?.goal ?? "");
  const [memo, setMemo] = useState(extra?.memo ?? "");
  const [code, setCode] = useState(extra?.memberCode ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const photoRef = useRef<HTMLInputElement>(null);

  const save = () =>
    startTransition(async () => {
      const input =
        kind === "profile"
          ? { profile: form, goal, memo, member_code: code }
          : { skill: form };
      const r = await updateStudent(studentId, input);
      setMsg(r.error ?? "保存しました");
    });

  const uploadPhoto = async () => {
    const file = photoRef.current?.files?.[0];
    if (!file) { setMsg("写真を選択してください"); return; }
    setBusy(true);
    try {
      const r = await createPhotoUploadUrl(studentId, file.name, file.size);
      if (!r.url || !r.path) { setMsg(r.error ?? "URL発行に失敗しました"); return; }
      const res = await fetch(r.url, { method: "PUT", headers: { "Content-Type": file.type || "image/jpeg" }, body: file });
      if (!res.ok) { setMsg(`アップロード失敗（${res.status}）`); return; }
      const s = await setPhoto(studentId, r.path);
      setMsg(s.error ?? "写真を登録しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
      {kind === "profile" && (
        <div className="mb-4 flex items-center gap-4 border-b border-[--color-line] pb-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="顔写真" className="h-20 w-20 rounded-lg object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-[--color-panel-2] text-2xl text-[--color-dim]">👤</div>
          )}
          <div className="min-w-0">
            <p className="mb-1 text-xs text-[--color-dim]">顔写真（カルテの取り違え防止）</p>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={photoRef} type="file" accept="image/*" className="text-xs file:mr-2 file:rounded-lg file:border file:border-[--color-line] file:bg-[--color-panel-2] file:px-2 file:py-1 file:text-xs file:text-[--color-txt]" />
              <button onClick={uploadPhoto} disabled={busy} className="btn-ghost !py-1.5 text-xs">{busy ? "登録中…" : "写真を登録"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {kind === "profile" && (
          <>
            <label className="block">
              <span className="text-xs text-[--color-dim]">目標設定</span>
              <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="例: いつも90台で回りたい" className="input-dark mt-1 w-full" />
            </label>
            <label className="block">
              <span className="text-xs text-[--color-dim]">会員番号（Smart Hallo）</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="input-dark mt-1 w-full" />
            </label>
          </>
        )}
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-xs text-[--color-dim]">{f.label}{f.unit ? `（${f.unit}）` : ""}</span>
            {f.type === "select" ? (
              <select
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="input-dark mt-1 w-full"
              >
                <option value="">未設定</option>
                {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="input-dark mt-1 w-full"
              />
            )}
          </label>
        ))}
        {kind === "profile" && (
          <label className="col-span-2 block md:col-span-3">
            <span className="text-xs text-[--color-dim]">メモ（体の特徴・注意点など）</span>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} className="input-dark mt-1 w-full" />
          </label>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={pending} className="btn-gold">{pending ? "保存中…" : "登録"}</button>
        {msg && <span className="text-xs text-[--color-dim]">{msg}</span>}
      </div>
    </div>
  );
}
