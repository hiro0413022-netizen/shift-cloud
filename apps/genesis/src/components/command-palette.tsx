"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchEverything, type SearchHit } from "@/app/(main)/search-actions";
import { Icon } from "./icons";

/**
 * Ctrl K：お客様・画面・操作を1か所で探す（#244 ⑤）
 * どの画面からでも開ける（layout に1つ置く）。開く合図はカスタムイベント＝
 * 左メニュー・スマホの下タブ・JARVIS（「〇〇を探して」）が同じ入口を使う。
 */
const OPEN_EVENT = "gn:palette";

export function openPalette(q = "") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { q } }));
}

type Row = { kind: "screen" | "person" | "action"; label: string; sub: string; href: string; external: boolean };

function flatten(hits: SearchHit[]): Row[] {
  const rows: Row[] = [];
  for (const h of hits) {
    if (h.kind === "screen") rows.push({ kind: "screen", label: h.label, sub: h.sub, href: h.href, external: false });
    else {
      const [first, ...rest] = h.actions;
      rows.push({ kind: "person", label: h.name, sub: h.sub, href: first?.href ?? "#", external: first?.external ?? true });
      for (const a of rest) rows.push({ kind: "action", label: `　${a.label}`, sub: h.name, href: a.href, external: a.external });
    }
  }
  return rows;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ q?: string }>).detail;
      setQ(d?.q ?? "");
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // 入力が止まってから検索（打つたびにサーバーへ行かない）
  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    if (!q.trim()) {
      setRows([]);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const hits = await searchEverything(q);
        if (my === seq.current) {
          setRows(flatten(hits));
          setSel(0);
        }
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback(
    (r: Row | undefined) => {
      if (!r) return;
      setOpen(false);
      if (r.external) window.open(r.href, "_blank", "noopener");
      else router.push(r.href);
    },
    [router]
  );

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="探す">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="absolute left-1/2 top-[8vh] w-[min(640px,94vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-panel) shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex h-14 items-center gap-3 border-b border-(--color-line) px-4">
          <Icon name="search" size={20} className="text-(--color-accent)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(rows.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(rows[sel]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="お名前・電話番号・会員番号・画面名"
            className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-(--color-faint)"
          />
          {busy && <span className="text-xs text-(--color-faint)">検索中…</span>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <p className="px-5 py-6 text-sm text-(--color-faint)">
              {q.trim() ? (busy ? "" : "見つかりませんでした") : "画面名でもお客様のお名前でも、そのまま打ってください"}
            </p>
          )}
          {rows.map((r, i) => (
            <button
              key={`${r.kind}-${r.href}-${i}`}
              type="button"
              onMouseEnter={() => setSel(i)}
              onClick={() => go(r)}
              className={`flex min-h-12 w-full items-center gap-3 px-5 text-left ${
                i === sel ? "bg-(--color-panel-2) shadow-[inset_3px_0_0_0_var(--color-accent)]" : ""
              }`}
            >
              <Icon
                name={r.kind === "screen" ? "arrow" : r.kind === "person" ? "user" : "send"}
                size={18}
                className={i === sel ? "text-(--color-accent)" : "text-(--color-dim)"}
              />
              <span className={`text-[15px] ${r.kind === "action" ? "text-(--color-dim)" : "font-bold"}`}>{r.label}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-(--color-faint)">{r.sub}</span>
              {r.external && <span className="text-[11px] text-(--color-faint)">別タブ</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-4 border-t border-(--color-line) px-5 py-2 text-xs text-(--color-faint)">
          <span>↑↓ 選ぶ</span>
          <span>Enter 開く</span>
          <span>Esc 閉じる</span>
          <span className="ml-auto">どの画面からでも Ctrl K</span>
        </div>
      </div>
    </div>
  );
}
