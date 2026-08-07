// 「この先に、いま、送ってよいか」の判定。
//
// このパッケージで最も壊してはいけない場所。メールは取り消せないので、
// 判定が緩むと取り返しがつかない。したがって **DBに触らない純粋関数** にして単体テストで固定し、
// 送信側は必ずここを通す（server.ts が唯一の呼び出し元）。
//
// 判定は「送ってよい理由が揃っているか」で書く。除外条件を並べる書き方だと、
// 条件を1つ足し忘れたときに「送れてしまう」方向に倒れるため。

import type { OutSettings, SendCandidate, SendDecision } from "./types";

/** 送信の法的根拠として認めるアドレスの出どころ。サイトでの公表のみ（特定電子メール法3条1項3号） */
const PUBLIC_SOURCES = new Set(["site"]);

export interface PolicyContext {
  settings: OutSettings;
  /** 抑止リスト（メールアドレス・小文字）と抑止ドメイン */
  suppressedEmails: Set<string>;
  suppressedDomains: Set<string>;
  /** 今日すでに送った通数 */
  sentToday: number;
  /** 今日の上限（dailyCap で算出したもの） */
  dailyCap: number;
  /** この点数未満は送らない */
  minScore: number;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

export function domainOf(email: string): string {
  return email.split("@")[1] ?? "";
}

export function decideSend(c: SendCandidate, ctx: PolicyContext): SendDecision {
  if (!ctx.settings.enabled) return { ok: false, reason: "disabled", note: "送信が有効化されていません" };
  if (ctx.settings.paused_at) return { ok: false, reason: "paused", note: ctx.settings.paused_reason ?? "自動停止中" };

  const email = normalizeEmail(c.email);
  if (!email) return { ok: false, reason: "no_email" };

  // 出どころが「先方サイトでの公表」でなければ送らない。
  // 名簿やPlacesから来たアドレスは、公表主体が先方本人とは限らないため根拠にならない。
  if (!PUBLIC_SOURCES.has(c.emailSource ?? "")) {
    return { ok: false, reason: "email_not_public", note: `出どころ: ${c.emailSource ?? "不明"}` };
  }

  if (c.noSolicit) return { ok: false, reason: "no_solicit", note: "サイトに営業お断りの記載" };
  if (ctx.suppressedEmails.has(email)) return { ok: false, reason: "suppressed" };
  if (ctx.suppressedDomains.has(domainOf(email))) return { ok: false, reason: "suppressed", note: "ドメイン単位で抑止" };
  if (c.alreadySent) return { ok: false, reason: "already_sent" };

  // 見せるものが無い状態では送らない。この営業の型は「完成イメージを見せる」ことが中身なので、
  // デモが無いメールはただの売り込みになる。
  if (!c.hasDemo) return { ok: false, reason: "no_demo" };

  if ((c.score ?? 0) < ctx.minScore) return { ok: false, reason: "low_score", note: `${c.score ?? 0}点 < ${ctx.minScore}点` };
  if (ctx.sentToday >= ctx.dailyCap) return { ok: false, reason: "daily_cap", note: `本日${ctx.sentToday}/${ctx.dailyCap}通` };

  return { ok: true };
}

/**
 * その日の送信上限（ウォームアップ）。
 *
 * 新しい送信ドメインからいきなり50通/日を出すと、受信側に「見慣れない送信元が急に大量送信した」と
 * 判定されて迷惑メール扱いになる。初日10通から1日10通ずつ増やし、上限で頭打ちにする。
 * warmup_start が未設定なら「今日が初日」として最小値を返す。
 */
export function dailyCap(warmupStart: string | null, today: string, max: number): number {
  const step = 10;
  if (!warmupStart) return Math.min(step, max);
  const d0 = Date.parse(warmupStart + "T00:00:00+09:00");
  const d1 = Date.parse(today + "T00:00:00+09:00");
  if (Number.isNaN(d0) || Number.isNaN(d1)) return Math.min(step, max);
  const days = Math.max(0, Math.floor((d1 - d0) / 86_400_000));
  return Math.max(step, Math.min(max, step * (days + 1)));
}

/**
 * 自動停止（キルスイッチ）の判定。
 *
 * バウンス（届かない）と苦情（迷惑メール報告）は、放置すると送信ドメインの信用が壊れ、
 * 会社の**普段のメールまで届かなくなる**。人が気づくのを待たず、数字で自動的に止める。
 * 母数が少ないうちに率で判定すると1通で止まるので、最低件数を置く。
 */
export function shouldPause(stats: { sent: number; bounced: number; complained: number }): { pause: boolean; reason?: string } {
  if (stats.complained >= 2) {
    return { pause: true, reason: `迷惑メール報告が${stats.complained}件。送信を停止しました` };
  }
  if (stats.sent >= 20) {
    const rate = stats.bounced / stats.sent;
    if (rate >= 0.08) {
      return { pause: true, reason: `宛先不明が${Math.round(rate * 100)}%（${stats.bounced}/${stats.sent}）。アドレスの取得方法を見直してください` };
    }
  }
  return { pause: false };
}
