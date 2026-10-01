"use client";

import { useState } from "react";
import { btnGhostCls } from "@/components/ui";

/** レポートを文字でコピー（LINE・メールに貼る用）／印刷 */
export function ReportActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // クリップボードが使えない環境（古いブラウザ・http）向けの退避
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" onClick={copy} className={btnGhostCls}>{copied ? "コピーしました" : "文章をコピー"}</button>
      <button type="button" onClick={() => window.print()} className={btnGhostCls}>印刷</button>
    </div>
  );
}
