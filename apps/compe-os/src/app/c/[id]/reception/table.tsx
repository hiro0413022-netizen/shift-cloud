"use client";

import { useMemo, useState, useTransition } from "react";
import type { Participant, ReceptionField } from "@/lib/compe";
import { setCheckIn, setCustomField, setNotes, setPaid, saveReceptionFields } from "../actions";
import { timeJst } from "@/lib/format";
import { Badge, btnGhostCls, inputCls } from "@/components/ui";

export function ReceptionTable({
  compId,
  participants,
  fields,
}: {
  compId: string;
  participants: Participant[];
  fields: ReceptionField[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"" | "checked" | "unchecked">("");
  const [editCols, setEditCols] = useState(false);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => fields.filter((f) => f.visible !== false), [fields]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return participants.filter((p) => {
      const hitQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.kana ?? "").toLowerCase().includes(q) ||
        (p.org ?? "").toLowerCase().includes(q);
      const hitF =
        !filter || (filter === "checked" && p.checked_in) || (filter === "unchecked" && !p.checked_in);
      return hitQ && hitF;
    });
  }, [participants, query, filter]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・フリガナ・所属で探す"
          className={`${inputCls} max-w-xs`}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as "" | "checked" | "unchecked")} className={`${inputCls} w-32`}>
          <option value="">全員</option>
          <option value="checked">受付済み</option>
          <option value="unchecked">未受付</option>
        </select>
        <button type="button" onClick={() => setEditCols((v) => !v)} className={`${btnGhostCls} ml-auto`}>
          {editCols ? "列の編集を閉じる" : "列をカスタマイズ"}
        </button>
      </div>

      {editCols && <ColumnEditor compId={compId} fields={fields} onDone={() => setEditCols(false)} />}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-(--color-accent) text-left text-white">
              <th className="w-10 px-3 py-2">#</th>
              <th className="px-3 py-2">氏名</th>
              <th className="px-3 py-2">フリガナ</th>
              <th className="px-3 py-2">所属</th>
              <th className="px-3 py-2 text-center">HCP</th>
              {visible.map((f) => (
                <th key={f.id} className="px-3 py-2 text-center whitespace-nowrap">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className={`border-b border-(--color-line) ${p.checked_in ? "bg-emerald-50/60" : ""}`}>
                <td className="px-3 py-2 text-center text-xs text-(--color-dim)">{i + 1}</td>
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{p.name}</td>
                <td className="px-3 py-2 text-xs text-(--color-dim)">{p.kana ?? ""}</td>
                <td className="px-3 py-2 text-xs">{p.org ?? ""}</td>
                <td className="px-3 py-2 text-center">{p.hcp ?? "—"}</td>
                {visible.map((f) => (
                  <td key={f.id} className="px-3 py-2 text-center">
                    {f.type === "checkin" && (
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          defaultChecked={p.checked_in}
                          onChange={(e) =>
                            startTransition(() => {
                              void setCheckIn(compId, p.id, e.target.checked);
                            })
                          }
                        />
                        {p.checked_in ? <Badge tone="ok">受付済</Badge> : <Badge>未受付</Badge>}
                      </label>
                    )}
                    {f.type === "paid" && (
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          defaultChecked={p.paid}
                          onChange={(e) =>
                            startTransition(() => {
                              void setPaid(compId, p.id, e.target.checked);
                            })
                          }
                        />
                        {p.paid ? <Badge tone="ok">徴収済</Badge> : <Badge tone="danger">未徴収</Badge>}
                      </label>
                    )}
                    {f.type === "time" && <span className="text-xs text-(--color-dim)">{timeJst(p.check_in_at)}</span>}
                    {f.type === "notes" && (
                      <input
                        defaultValue={p.notes ?? ""}
                        placeholder="—"
                        className="w-32 rounded border border-transparent px-1 py-0.5 text-xs hover:border-(--color-line) focus:border-(--color-accent) focus:outline-none"
                        onBlur={(e) =>
                          startTransition(() => {
                            void setNotes(compId, p.id, e.target.value);
                          })
                        }
                      />
                    )}
                    {f.type === "check" && (
                      <input
                        type="checkbox"
                        defaultChecked={Boolean(p.custom_fields?.[f.id])}
                        onChange={(e) =>
                          startTransition(() => {
                            void setCustomField(compId, p.id, f.id, e.target.checked);
                          })
                        }
                      />
                    )}
                    {f.type === "text" && (
                      <input
                        defaultValue={String(p.custom_fields?.[f.id] ?? "")}
                        placeholder="—"
                        className="w-28 rounded border border-transparent px-1 py-0.5 text-xs hover:border-(--color-line) focus:border-(--color-accent) focus:outline-none"
                        onBlur={(e) =>
                          startTransition(() => {
                            void setCustomField(compId, p.id, f.id, e.target.value);
                          })
                        }
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-(--color-dim)">
        チェックを入れた時刻が「受付時刻」に入ります。全員をまとめて受付済みにする操作は用意していません（当日、実際に来た人だけに印を付けるため）。
      </p>
    </>
  );
}

function ColumnEditor({
  compId,
  fields,
  onDone,
}: {
  compId: string;
  fields: ReceptionField[];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<ReceptionField[]>(fields);
  const [pending, startTransition] = useTransition();

  const update = (id: string, patch: Partial<ReceptionField>) =>
    setDraft((d) => d.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const add = (type: "check" | "text") =>
    setDraft((d) => [
      ...d,
      {
        id: `rf_${Math.random().toString(36).slice(2, 9)}`,
        label: type === "check" ? "新しいチェック項目" : "新しい記入欄",
        type,
        visible: true,
      },
    ]);

  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const next = [...d];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="mb-4 rounded-xl border border-(--color-line) bg-(--color-panel-2) p-4">
      <p className="mb-3 text-xs text-(--color-dim)">
        懇親会・弁当・送迎など、その回だけ必要な確認欄をここで足せます。氏名・フリガナ・所属・HCPは常に表示されます。
      </p>
      <div className="space-y-2">
        {draft.map((f, i) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2">
            <Badge tone={f.builtin ? "ok" : "gray"}>{f.builtin ? "組み込み" : f.type === "check" ? "チェック" : "記入"}</Badge>
            <input
              value={f.label}
              onChange={(e) => update(f.id, { label: e.target.value })}
              className="min-w-32 flex-1 rounded border border-(--color-line) px-2 py-1 text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-(--color-dim)">
              <input type="checkbox" checked={f.visible !== false} onChange={(e) => update(f.id, { visible: e.target.checked })} />
              表示
            </label>
            <button type="button" onClick={() => move(i, -1)} className="rounded border border-(--color-line) px-2 py-1 text-xs">
              ▲
            </button>
            <button type="button" onClick={() => move(i, 1)} className="rounded border border-(--color-line) px-2 py-1 text-xs">
              ▼
            </button>
            {!f.builtin && (
              <button
                type="button"
                onClick={() => setDraft((d) => d.filter((x) => x.id !== f.id))}
                className="px-2 text-sm text-red-600"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => add("check")} className={btnGhostCls}>
          チェック欄を追加
        </button>
        <button type="button" onClick={() => add("text")} className={btnGhostCls}>
          記入欄を追加
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveReceptionFields(compId, draft);
              onDone();
            })
          }
          className="ml-auto rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
        >
          {pending ? "保存中..." : "列を保存する"}
        </button>
      </div>
    </div>
  );
}
