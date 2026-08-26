"use client";

import { useEffect, useState } from "react";

/**
 * 「ホーム画面に追加」の案内（#154 / 構想 §3-4）
 *
 * 習慣化に一番効くのはアイコン化なので、ポータルを開いた人に一度だけ案内する。
 * - すでにホーム画面から開いている（standalone）なら出さない
 * - 閉じたら localStorage に覚えて二度と出さない（毎回出ると邪魔になる）
 * - iOS は共有ボタンからの手動追加しかできないので、文言をiOS用に変える
 */
export function AddToHome() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("frank.a2hs.dismissed") === "1") return;
    } catch {
      /* プライベートブラウズ等。出しても害はないので続行 */
    }
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    setShow(true);
  }, []);

  if (!show) return null;

  const close = () => {
    try { localStorage.setItem("frank.a2hs.dismissed", "1"); } catch { /* 記憶できないだけ */ }
    setShow(false);
  };

  return (
    <div className="mb-4 rounded-xl border border-(--color-gold)/40 bg-(--color-panel) px-4 py-3">
      <p className="text-sm font-semibold text-(--color-gold)">ホーム画面に追加しておくと便利です</p>
      <p className="mt-1 text-xs leading-relaxed text-(--color-dim)">
        {ios
          ? "画面下の共有ボタン（□に↑）→「ホーム画面に追加」で、アイコンから会員証をすぐ開けます。"
          : "ブラウザのメニュー →「ホーム画面に追加」で、アイコンから会員証をすぐ開けます。"}
      </p>
      <button onClick={close} className="mt-2 text-xs text-(--color-dim) underline underline-offset-4">
        閉じる
      </button>
    </div>
  );
}
