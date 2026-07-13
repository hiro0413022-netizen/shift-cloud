"use client";

import { PHASES, type PhaseKey, type Phases } from "@/lib/phases";

/**
 * フェーズ移動バー（DECISIONS #51）
 * アドレス／テークバック／トップ／切り返し／インパクト／フォロー／フィニッシュにワンタップで飛ぶ。
 * edit=true のときはタップで「今の位置をそのフェーズに設定」に変わる。
 * コーチ画面（dark）と生徒共有ページ（light）の両方で使う。
 */
export function PhaseBar({
  phases,
  duration,
  current,
  onJump,
  edit = false,
  onSet,
  theme = "dark",
}: {
  phases: Phases | null;
  duration: number;
  current: number;
  onJump: (t: number) => void;
  edit?: boolean;
  onSet?: (k: PhaseKey) => void;
  theme?: "dark" | "light";
}) {
  const light = theme === "light";
  const active = (k: PhaseKey) => {
    const t = phases?.[k];
    return typeof t === "number" && Math.abs(t - current) < 0.05;
  };

  return (
    <div className="space-y-1.5">
      {/* タイムライン上のマーカー */}
      {duration > 0 && (
        <div className={`relative h-1.5 w-full rounded-full ${light ? "bg-[#dde4ec]" : "bg-(--color-panel-2)"}`}>
          <div
            className={`absolute top-0 h-1.5 rounded-full ${light ? "bg-[#1e5da8]/40" : "bg-(--color-active)/40"}`}
            style={{ width: `${Math.min(100, (current / duration) * 100)}%` }}
          />
          {PHASES.map(({ key, short }) => {
            const t = phases?.[key];
            if (typeof t !== "number") return null;
            return (
              <button
                key={key}
                onClick={() => onJump(t)}
                title={`${short} ${t.toFixed(2)}s`}
                className={`absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 ${
                  light ? "border-white bg-[#1e5da8]" : "border-(--color-bg) bg-(--color-gold)"
                }`}
                style={{ left: `${Math.min(100, (t / duration) * 100)}%` }}
              />
            );
          })}
        </div>
      )}

      {/* フェーズボタン */}
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-7">
        {PHASES.map(({ key, label }) => {
          const t = phases?.[key];
          const set = typeof t === "number";
          const on = active(key);
          const base = "rounded-lg border px-1 py-1.5 text-[11px] leading-tight transition-colors";
          const cls = light
            ? on
              ? "border-[#1e5da8] bg-[#1e5da8] text-white"
              : set
              ? "border-[#c8d4e2] bg-white text-[#1e5da8]"
              : "border-dashed border-[#d8dee6] text-gray-400"
            : on
            ? "border-(--color-gold) bg-(--color-gold)/15 text-(--color-gold)"
            : set
            ? "border-(--color-line) text-(--color-txt)"
            : "border-dashed border-(--color-line) text-(--color-dim)";
          return (
            <button
              key={key}
              onClick={() => (edit ? onSet?.(key) : set && onJump(t))}
              disabled={!edit && !set}
              className={`${base} ${cls} ${edit ? "!border-(--color-active) !text-(--color-active)" : ""}`}
            >
              {label}
              <span className="block text-[9px] opacity-70">
                {edit ? "ここに設定" : set ? `${t.toFixed(2)}s` : "未設定"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
