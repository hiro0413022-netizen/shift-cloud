"use client";

import { useEffect, useState } from "react";

/**
 * LIFF（LINE内ブラウザ）連携（DECISIONS #56）
 *
 * 公式LINEのリッチメニューから開かれた場合、LIFF SDKで userId が取れる。
 * これがあると受付確認・確定連絡を LINE Push で自動送信できる（n8n経由）。
 *
 * 設計上の前提:
 *   - NEXT_PUBLIC_LIFF_ID 未設定 / LINE外からのアクセス / SDK読込失敗 → すべて「LINEなし」に倒す。
 *     予約フォーム自体は必ず動くこと（LINEはあくまで連絡手段の一つ）。
 *   - ログインは強制しない（liff.login() へのリダイレクトはしない）。
 *     LIFF内なら既にログイン済みなので getProfile() がそのまま通る。
 */

export type LiffProfile = {
  userId: string;
  displayName: string | null;
};

type LiffLike = {
  init: (c: { liffId: string }) => Promise<void>;
  isInClient: () => boolean;
  isLoggedIn: () => boolean;
  getProfile: () => Promise<{ userId: string; displayName?: string }>;
};

declare global {
  interface Window {
    liff?: LiffLike;
  }
}

const SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.liff) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("liff sdk load error")));
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("liff sdk load error"));
    document.head.appendChild(s);
  });
}

/** 戻り値: ready=判定完了 / profile=LINEから開かれた場合のみ非null */
export function useLiff(liffId: string | undefined): { ready: boolean; profile: LiffProfile | null } {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<LiffProfile | null>(null);

  useEffect(() => {
    let canceled = false;
    if (!liffId) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        await loadSdk();
        const liff = window.liff;
        if (!liff) throw new Error("liff undefined");
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) return; // LINE外（PCブラウザ等）→ メール運用にフォールバック
        const p = await liff.getProfile();
        if (!canceled && p?.userId) {
          setProfile({ userId: p.userId, displayName: p.displayName ?? null });
        }
      } catch (e) {
        // LINE連携に失敗しても申込は通す（メールでの連絡にフォールバック）
        console.warn("[liff] 初期化に失敗:", e);
      } finally {
        if (!canceled) setReady(true);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [liffId]);

  return { ready, profile };
}
