import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { JudgmentItem } from "@/lib/kernel";

/* ============================================================
   Legal OS 日次チェック（フェーズ2a / NEXT_TASKS 7・DECISIONS #30）
   Claude API不要のルールベース。runDailyCeoReport から呼ばれ、
   「今日、古川さんが判断すべきこと」へ合流する。
   チェック:
   1. 解約判断期日（next_action_date）が90日以内 — 自動更新の解約通知期限
   2. 契約満了（expiry_date）が60日以内で更新方針未決
   3. 高リスク契約（risk_level=high）が active/under_review に存在
   4. under_review（AI提案・確認待ち）が14日以上滞留
   ============================================================ */

const LEGAL_OS_URL = "https://legal-os-peach.vercel.app";

type LegDoc = {
  id: string;
  title: string;
  counterparty: string | null;
  status: string;
  expiry_date: string | null;
  next_action_date: string | null;
  auto_renew: boolean;
  risk_level: string | null;
  updated_at: string;
};

function daysFromToday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  return Math.ceil((d - Date.now()) / 86400000);
}

export async function runLegalChecks(companyId: string): Promise<JudgmentItem[]> {
  const admin = createAdmin();
  const items: JudgmentItem[] = [];

  const { data } = await admin
    .from("leg_documents")
    .select("id, title, counterparty, status, expiry_date, next_action_date, auto_renew, risk_level, updated_at")
    .eq("company_id", companyId)
    .in("status", ["draft", "under_review", "pending_approval", "active"])
    .is("deleted_at", null);
  const docs = (data ?? []) as LegDoc[];

  for (const d of docs) {
    const label = `${d.title}${d.counterparty ? `（${d.counterparty}）` : ""}`;

    // 1. 解約判断期日の接近（過ぎている場合も含む）
    if (d.next_action_date) {
      const days = daysFromToday(d.next_action_date);
      if (days <= 90) {
        items.push({
          kind: "approval",
          title:
            days < 0
              ? `⚠契約の解約判断期日超過: ${label}（${-days}日超過）`
              : `契約の解約判断: ${label}（期日まで${days}日）`,
          detail: d.auto_renew
            ? "自動更新契約。継続なら何もしない／解約なら通知期限内に相手方へ通知が必要"
            : "更新・終了の方針を決める期日です",
          href: LEGAL_OS_URL,
          // 期日超過は取り返しがつかない（自動更新が確定する）ため重い（DECISIONS #43）
          weight: days < 0 ? 10 : 5,
          scoreLabel: days < 0 ? "契約の期日超過" : "契約の判断期日接近",
        });
        continue; // 同一契約の重複起票を避ける（最重要の1件のみ）
      }
    }

    // 2. 契約満了の接近（解約判断期日が無い契約向け）
    if (d.expiry_date) {
      const days = daysFromToday(d.expiry_date);
      if (days >= 0 && days <= 60) {
        items.push({
          kind: "approval",
          title: `契約満了が接近: ${label}（あと${days}日）`,
          detail: "更新契約の締結 or 終了処理の判断が必要です",
          href: LEGAL_OS_URL,
          weight: 5,
          scoreLabel: "契約満了の接近",
        });
        continue;
      }
    }

    // 3. 高リスク契約
    if (d.risk_level === "high") {
      items.push({
        kind: "risk",
        title: `高リスク契約の確認: ${label}`,
        detail: "legal_ai/担当者が高リスクと評価。条項の見直し・専門家相談を検討",
        href: LEGAL_OS_URL,
        weight: 6,
        scoreLabel: "高リスク契約",
      });
      continue;
    }

    // 4. AI提案の確認待ち滞留（14日以上）
    if (d.status === "under_review") {
      const staleDays = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000);
      if (staleDays >= 14) {
        items.push({
          kind: "approval",
          title: `契約書の確認待ちが滞留: ${label}（${staleDays}日）`,
          detail: "legal_aiの抽出提案が未確認のまま。Legal OSで内容を確定してください",
          href: LEGAL_OS_URL,
          weight: 2,
          scoreLabel: "契約書の確認滞留",
        });
      }
    }
  }

  return items;
}
