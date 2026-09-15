/* ============================================================
   「止まっているもの」の判定（#244 ①・純粋な部分）

   2026-09-14〜15 に朝の出勤LINEが LINE公式の月200通上限（HTTP 429）で全件失敗していたのに、
   ホームには何も出なかった（[[line-monthly-limit]]）。同じく RESEND_API_KEY が無く
   入会・体験のお知らせメールが 9/2 から未送信だったのも、点検（#240）まで誰も気づかなかった。

   ここでは「失敗の生データ → 人が読める1行＋直し方」への変換だけを行う。
   DB もネットワークも触らない（node --test で固定する）。
   alerts-must-be-fixable: 集計値だけの警告は禁止＝必ず原因の名指しと直し方を付ける。
   ============================================================ */

export type StalledFix = { label: string; href: string; external?: boolean };

export type StalledItem = {
  /** 確認済みの判定キー（gn_alert_acks）。内容が変わればキーも変わり再表示される */
  key: string;
  title: string;
  detail: string;
  fix: StalledFix;
  severity: "danger" | "warn";
};

export type FailedAction = { action_type: string; error: string | null; count: number; last: string | null };

const ACTION_LABEL: Record<string, string> = {
  staff_directive: "スタッフへの朝の連絡（LINE）",
  line_broadcast: "LINE一斉配信",
  sns_post: "SNS投稿",
  report_generate: "日次レポート",
  line_push_contact: "個別LINE送信",
  prod_deploy: "本番デプロイ",
};

/** LINE公式アカウントの管理画面（プラン変更はここ） */
const LINE_MANAGER_URL = "https://manager.line.biz/";
const VERCEL_ENV_URL = "https://vercel.com/hironobu-s-projects/yozan-genesis/settings/environment-variables";

/** 失敗した AI 実行（action_type ごとにまとめた行）→ 止まっているもの */
export function stalledFromFailedActions(rows: FailedAction[]): StalledItem[] {
  const out: StalledItem[] = [];
  for (const r of rows) {
    if (r.count <= 0) continue;
    const label = ACTION_LABEL[r.action_type] ?? `AI実行（${r.action_type}）`;
    const err = (r.error ?? "").trim();
    const is429 = /429|monthly limit|月間.*上限|reached your monthly/i.test(err);
    if (is429) {
      out.push({
        key: `stalled::line429::${r.action_type}::${r.count}`,
        title: `${label}が送れていません（${r.count}件失敗）`,
        detail: "LINE公式アカウントの月の送信上限（無料プラン200通）に達しています。直すのはコードではなくプランです。",
        fix: { label: "LINE公式でプラン変更（ライトプラン）", href: LINE_MANAGER_URL, external: true },
        severity: "danger",
      });
      continue;
    }
    out.push({
      key: `stalled::failed::${r.action_type}::${r.count}`,
      title: `${label}が失敗しています（${r.count}件）`,
      detail: err ? err.slice(0, 120) : "エラー内容は「AI自動実行」で確認できます",
      fix: { label: "失敗した実行を見る", href: "/executions" },
      severity: "warn",
    });
  }
  return out;
}

/** メール送信の設定が無い（RESEND_API_KEY 未設定）＋ 直近のメール失敗件数 */
export function stalledFromMail(input: { hasResendKey: boolean; failedMails7d: number }): StalledItem[] {
  const out: StalledItem[] = [];
  if (!input.hasResendKey) {
    out.push({
      key: "stalled::mail::no-key",
      title: "入会・体験のお知らせメールが送れません（送信設定なし）",
      detail: `GENESIS に RESEND_API_KEY が設定されていません。${
        input.failedMails7d > 0 ? `この7日で ${input.failedMails7d} 件のメールが送れていません。` : ""
      }設定は Vercel の環境変数に1行足すだけです（OPERATIONS.md A-240）。`,
      fix: { label: "Vercel の環境変数を開く", href: VERCEL_ENV_URL, external: true },
      severity: "danger",
    });
  } else if (input.failedMails7d > 0) {
    out.push({
      key: `stalled::mail::failed::${input.failedMails7d}`,
      title: `お知らせメールが ${input.failedMails7d} 件送れていません（この7日）`,
      detail: "送信先アドレスの誤りか、送信サービス側のエラーです。出来事ログに1件ずつ残っています。",
      fix: { label: "出来事ログで確認", href: "/events" },
      severity: "warn",
    });
  }
  return out;
}

/** 毎朝の日次レポートが来ていない＝cron が止まっている疑い */
export function stalledFromCron(input: { lastDailyReportAt: string | null; now: Date }): StalledItem[] {
  if (!input.lastDailyReportAt) return [];
  const hours = (input.now.getTime() - new Date(input.lastDailyReportAt).getTime()) / 3_600_000;
  if (hours < 36) return [];
  return [
    {
      key: `stalled::cron::${Math.floor(hours / 24)}d`,
      title: `毎朝の日次レポートが ${Math.floor(hours / 24)} 日止まっています`,
      detail: "Vercel Cron が動いていないか、CRON_SECRET が合っていません（過去の実例: middleware の 307）。",
      fix: { label: "CEO AI 司令室で手動生成", href: "/command" },
      severity: "warn",
    },
  ];
}

/** LINE配信キュー（gn_line_outbox）のエラー */
export function stalledFromOutbox(input: { errorCount: number; lastError: string | null }): StalledItem[] {
  if (input.errorCount <= 0) return [];
  return [
    {
      key: `stalled::outbox::${input.errorCount}`,
      title: `スタッフへのLINE配信が ${input.errorCount} 件エラーです`,
      detail: (input.lastError ?? "").slice(0, 120) || "配信キューでエラーになっています",
      fix: { label: "スタッフへ連絡（履歴）を見る", href: "/notice" },
      severity: "warn",
    },
  ];
}

/** 全部を並べる（重いものが上） */
export function sortStalled(items: StalledItem[]): StalledItem[] {
  return [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1));
}
