"use client";

import { btnCls } from "@/components/ui";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className={btnCls}>
      印刷 / PDF保存
    </button>
  );
}
