"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ⑥ 今日やることをキーボードで（#244）。
 * ↑↓ で行を選ぶ / Enter で右パネルを開く / A で選んだ行の主ボタン（承認など）を押す。
 * 入力欄にフォーカスがある間・パネルが開いている間は何もしない（誤爆防止）。
 * 行は data-todo-row / data-panel-href / 主ボタンは data-primary で印を付ける。
 */
export function TodoHotkeys({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState(-1);

  useEffect(() => {
    const rows = () => Array.from(document.querySelectorAll<HTMLElement>("[data-todo-row]"));
    const paint = (i: number) => rows().forEach((r, k) => r.setAttribute("data-selected", String(k === i)));
    paint(sel);
    const onKey = (e: KeyboardEvent) => {
      if (!enabled) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const list = rows();
      if (list.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setSel((s) => Math.min(list.length - 1, s + 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter" && sel >= 0) {
        const href = list[sel]?.getAttribute("data-panel-href");
        if (href) router.push(href);
      } else if ((e.key === "a" || e.key === "A") && sel >= 0) {
        const btn = list[sel]?.querySelector<HTMLButtonElement>("[data-primary]");
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, sel, router]);

  useEffect(() => {
    const el = document.querySelectorAll<HTMLElement>("[data-todo-row]")[sel];
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return null;
}
