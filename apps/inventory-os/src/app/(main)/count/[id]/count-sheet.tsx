"use client";

import { useMemo, useOptimistic, useState, useTransition, useRef, useEffect } from "react";
import { saveOne } from "../actions";

export type SheetItem = {
  itemId: string;
  code: string;
  name: string;
  variant: string | null;
  unit: string;
  location: string;
  location2: string | null;
  /** 前回の確定棚卸の数量（未登録品は null） */
  prev: number | null;
  /** 今回すでに入力済みの数量（未入力は null） */
  current: number | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * iPad前提の棚卸シート。
 * 設計の要点:
 *   - 保管場所で絞り込む。棚の前に立ったらその場所だけが見える状態にする
 *   - 前回値を大きく出す。「同じ」ならタップ1回で確定、違うときだけ数字を打つ
 *   - 入力のたびに自動保存する。「保存ボタンを押し忘れて全部消えた」を起こさない
 *   - タップ領域は最低44px。手袋・濡れた手でも押せるサイズにする
 */
export function CountSheet({
  sessionId,
  items,
  readOnly,
}: {
  sessionId: string;
  items: SheetItem[];
  readOnly: boolean;
}) {
  const locations = useMemo(() => {
    const m = new Map<string, SheetItem[]>();
    for (const it of items) {
      const arr = m.get(it.location) ?? [];
      arr.push(it);
      m.set(it.location, arr);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  const [active, setActive] = useState<string>(locations[0]?.[0] ?? "");
  const [q, setQ] = useState("");
  const [onlyUnfilled, setOnlyUnfilled] = useState(false);
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(items.map((i) => [i.itemId, i.current]))
  );
  const [states, setStates] = useState<Record<string, SaveState>>({});

  const filled = Object.values(values).filter((v) => v != null).length;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = term ? items : (locations.find(([l]) => l === active)?.[1] ?? []);
    if (term) {
      list = items.filter(
        (i) => i.code.toLowerCase().includes(term) || i.name.toLowerCase().includes(term)
      );
    }
    if (onlyUnfilled) list = list.filter((i) => values[i.itemId] == null);
    return list;
  }, [items, locations, active, q, onlyUnfilled, values]);

  function setValue(itemId: string, next: number | null) {
    setValues((v) => ({ ...v, [itemId]: next }));
  }

  return (
    <div className="space-y-4">
      {/* 保管場所タブ */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex gap-2 pb-1">
          {locations.map(([loc, list]) => {
            const done = list.filter((i) => values[i.itemId] != null).length;
            const isActive = loc === active && !q;
            return (
              <button
                key={loc}
                onClick={() => {
                  setQ("");
                  setActive(loc);
                }}
                className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  isActive
                    ? "border-(--color-accent) bg-(--color-accent)/10 text-(--color-txt)"
                    : "border-(--color-line) bg-(--color-panel) text-(--color-dim)"
                }`}
              >
                <span className="block max-w-[14rem] truncate font-medium">{loc}</span>
                <span className={`text-xs tabular-nums ${done === list.length ? "text-(--color-ok)" : ""}`}>
                  {done} / {list.length}
                  {done === list.length && " ✓"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 検索・絞り込み */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="管理番号・商品名で探す"
          className="min-w-0 flex-1 rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-3 text-base outline-none focus:border-(--color-accent)"
        />
        <button
          onClick={() => setOnlyUnfilled((v) => !v)}
          className={`shrink-0 rounded-lg border px-4 py-3 text-sm ${
            onlyUnfilled ? "border-(--color-accent) text-(--color-accent)" : "border-(--color-line) text-(--color-dim)"
          }`}
        >
          未入力だけ
        </button>
      </div>

      <p className="text-sm text-(--color-dim)">
        入力済み <span className="font-bold text-(--color-txt) tabular-nums">{filled}</span> / {items.length} 品番
        {q && `　検索結果 ${rows.length} 件`}
      </p>

      <ul className="space-y-2">
        {rows.map((it) => (
          <Row
            key={it.itemId}
            item={it}
            sessionId={sessionId}
            value={values[it.itemId] ?? null}
            state={states[it.itemId] ?? "idle"}
            readOnly={readOnly}
            onChange={setValue}
            onState={(id, s) => setStates((m) => ({ ...m, [id]: s }))}
          />
        ))}
        {rows.length === 0 && (
          <li className="rounded-lg border border-dashed border-(--color-line) py-8 text-center text-sm text-(--color-dim)">
            {onlyUnfilled ? "この場所は全部入力できています ✓" : "該当する品番がありません"}
          </li>
        )}
      </ul>
    </div>
  );
}

function Row({
  item,
  sessionId,
  value,
  state,
  readOnly,
  onChange,
  onState,
}: {
  item: SheetItem;
  sessionId: string;
  value: number | null;
  state: SaveState;
  readOnly: boolean;
  onChange: (id: string, v: number | null) => void;
  onState: (id: string, s: SaveState) => void;
}) {
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function commit(next: number) {
    onChange(item.itemId, next);
    onState(item.itemId, "saving");
    // 連打・打ち直しをまとめる。指を離してから400msで保存
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const r = await saveOne(sessionId, item.itemId, next);
        onState(item.itemId, r.error ? "error" : "saved");
      });
    }, 400);
  }

  const changed = value != null && item.prev != null && value !== item.prev;

  return (
    <li
      className={`rounded-xl border bg-(--color-panel) p-3 ${
        value == null ? "border-(--color-line)" : changed ? "border-(--color-warn)/50" : "border-(--color-ok)/30"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{item.name}</p>
          <p className="truncate text-xs text-(--color-dim)">
            {item.code}
            {item.variant && ` / ${item.variant}`}
            {item.location2 && ` / ${item.location2}`}
          </p>
          <p className="mt-0.5 text-xs text-(--color-dim)">
            前回 <span className="font-bold text-(--color-txt) tabular-nums">{item.prev ?? "—"}</span>
            {item.unit}
            {state === "saving" && <span className="ml-2 text-(--color-accent)">保存中…</span>}
            {state === "saved" && <span className="ml-2 text-(--color-ok)">保存しました</span>}
            {state === "error" && <span className="ml-2 text-(--color-danger)">保存できませんでした</span>}
          </p>
        </div>

        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1.5">
            {item.prev != null && value == null && (
              <button
                onClick={() => commit(item.prev!)}
                className="h-12 rounded-lg border border-(--color-line) px-3 text-sm text-(--color-dim)"
              >
                同じ
              </button>
            )}
            <button
              onClick={() => commit(Math.max(0, (value ?? item.prev ?? 0) - 1))}
              className="h-12 w-12 rounded-lg border border-(--color-line) text-xl"
              aria-label="1減らす"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={value ?? ""}
              placeholder={String(item.prev ?? 0)}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") return onChange(item.itemId, null);
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 0) commit(Math.trunc(n));
              }}
              className="h-12 w-20 rounded-lg border border-(--color-line) bg-(--color-panel-2) text-center text-xl font-bold tabular-nums outline-none focus:border-(--color-accent)"
            />
            <button
              onClick={() => commit((value ?? item.prev ?? 0) + 1)}
              className="h-12 w-12 rounded-lg border border-(--color-line) text-xl"
              aria-label="1増やす"
            >
              ＋
            </button>
          </div>
        )}

        {readOnly && (
          <span className="shrink-0 text-xl font-bold tabular-nums">
            {value ?? "—"}
            <span className="ml-1 text-xs font-normal text-(--color-dim)">{item.unit}</span>
          </span>
        )}
      </div>
    </li>
  );
}
