"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">
      印刷・PDFに保存
    </button>
  );
}
