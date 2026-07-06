"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
    >
      🖨 印刷する
    </button>
  );
}
