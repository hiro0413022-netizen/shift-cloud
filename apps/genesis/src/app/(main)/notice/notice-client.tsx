"use client";

import { useState, useRef } from "react";
import { sendNotice } from "./actions";
import type { LineGroup, NoticeRow } from "@/lib/staff-notice";

const LINE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "送信待ち", cls: "text-(--color-warn)" },
  sent: { label: "送信済み", cls: "text-(--color-ok)" },
  error: { label: "送信失敗", cls: "text-(--color-danger)" },
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function NoticeClient({ groups, notices }: { groups: LineGroup[]; notices: NoticeRow[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const hasGroup = groups.length > 0;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!msg.trim() || busy) return;
    setBusy(true);
    setFlash(null);
    const fd = new FormData(formRef.current!);
    const res = await sendNotice(fd);
    setBusy(false);
    if (res.ok) {
      setMsg("");
      setFlash({ ok: true, text: "送信しました（数分以内にLINEグループへ届きます）" });
    } else {
      setFlash({ ok: false, text: res.error ?? "送信に失敗しました" });
    }
  }

  return (
    <div>
      {!hasGroup && (
        <div className="mb-4 rounded-lg border border-(--color-danger) bg-(--color-panel) p-3 text-sm text-(--color-danger)">
          LINEの配信先グループが未登録です。公式アカウントをスタッフグループに追加すると自動で登録されます。
        </div>
      )}

      <form ref={formRef} onSubmit={onSubmit} className="rounded-lg border border-(--color-line) bg-(--color-panel) p-4">
        <textarea
          name="message"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="スタッフへの連絡を書いてください。1行目が件名になります。&#10;例）明日は10時開店です。オープン前の清掃をお願いします。"
          className="w-full resize-y rounded-lg border border-(--color-line) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
        />

        <div className="mt-3 flex flex-wrap items-center gap-4">
          {groups.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-(--color-dim)">
              配信先
              <select name="group_id" className="rounded border border-(--color-line) bg-(--color-bg) px-2 py-1 text-sm">
                {groups.map((g) => (
                  <option key={g.id} value={g.line_group_id}>
                    {g.label ?? "グループ"}
                    {g.is_default ? "（既定）" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-(--color-dim)">
            <input type="checkbox" name="as_task" className="h-4 w-4" />
            スタッフアプリの「やること」にも出す
          </label>
          <button
            type="submit"
            disabled={busy || !msg.trim() || !hasGroup}
            className="ml-auto rounded-lg bg-(--color-accent) px-5 py-2 text-sm font-semibold text-(--color-bg) disabled:opacity-40"
          >
            {busy ? "送信中…" : "LINEで送る"}
          </button>
        </div>

        {flash && (
          <p className={`mt-3 text-sm ${flash.ok ? "text-(--color-ok)" : "text-(--color-danger)"}`}>{flash.text}</p>
        )}
      </form>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-(--color-dim)">送った連絡</h2>
      {notices.length === 0 ? (
        <p className="py-6 text-center text-sm text-(--color-dim)">まだ連絡はありません</p>
      ) : (
        <ul className="space-y-2">
          {notices.map((n) => {
            const st = n.line_status ? LINE_STATUS[n.line_status] : null;
            return (
              <li key={n.id} className="rounded-lg border border-(--color-line) bg-(--color-panel) p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{n.title}</p>
                  <span className="shrink-0 text-xs text-(--color-dim)">{fmtWhen(n.created_at)}</span>
                </div>
                {n.body && n.body !== n.title && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-(--color-dim)">{n.body}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {st && <span className={st.cls}>LINE: {st.label}</span>}
                  {n.as_task && <span className="text-(--color-dim)">やること登録済み</span>}
                  {n.line_error && <span className="text-(--color-danger)">{n.line_error}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
