import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { loadFeatures } from "@/lib/plan";
import ImportClient from "./import-client";

export const dynamic = "force-dynamic";
// Excel数千件取込のServer Actionが時間切れしないよう延長（Vercel Pro）
export const maxDuration = 60;

export default async function SettingsPage() {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const features = await loadFeatures(actor.companyId);
  const [{ count: symptomCount }, { count: knowledgeCount }] = await Promise.all([
    admin.from("sc_symptoms").select("id", { count: "exact", head: true }).eq("company_id", actor.companyId),
    admin.from("sc_knowledge").select("id", { count: "exact", head: true }).eq("company_id", actor.companyId),
  ]);

  const isPro = features.plan === "pro";

  return (
    <div className="p-5 pb-8">
      <h1 className="mb-4 text-xl font-bold text-slate-900">設定・データ</h1>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4">
        <div>
          <div className="text-sm font-semibold text-slate-800">エディション</div>
          <div className="text-[11px] text-slate-500">
            {isPro ? "Pro — 全機能（生徒カルテCRM含む）" : "Standard — 診断・ライブラリ・インサイト・AIコメント作成"}
          </div>
        </div>
        <span
          className={
            "rounded-full px-3 py-1 text-xs font-bold " +
            (isPro ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600")
          }
        >
          {isPro ? "PRO" : "STANDARD"}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{symptomCount ?? 0}</div>
          <div className="text-[10px] text-slate-400">登録症状</div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{knowledgeCount ?? 0}</div>
          <div className="text-[10px] text-slate-400">知識項目</div>
        </div>
      </div>

      <ImportClient />

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">項目マスタをExcelで書き出し</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                データの正はこのシステム（DB）です。現在の症状・チェック項目・原因/対処/ドリル/説明を、いつでもExcelに出せます（バックアップ・共有用）。
              </div>
            </div>
            <a
              href="/api/export"
              className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-xs font-bold text-white"
            >
              ⬇ 書き出し
            </a>
          </div>
        </div>
        <a href="/manage" className="block rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">項目マスタを編集</div>
              <div className="mt-0.5 text-[11px] text-slate-500">症状・確認項目・原因/対処/ドリル/説明をこの画面（DB）で直接追加・編集・削除。</div>
            </div>
            <span className="text-slate-300">›</span>
          </div>
        </a>
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">現在のコーチ</div>
          <div className="mt-1 text-xs text-slate-500">{actor.name} でログイン中</div>
          <form action="/api/logout" method="post" className="mt-2">
            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">ログアウト</button>
          </form>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="text-sm font-semibold text-slate-800">SaaS・テナント（今後）</div>
          <div className="mt-1 text-xs leading-relaxed text-slate-500">
            AI解析（コメント→原因/処方の自動構造化）・AI設定コンシェルジュ・Stripe課金・店舗権限は
            SYSTEM.md のフェーズ計画に沿って追加します。
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[11px] text-slate-300">SWING CORTEX · Genesis連携版 P1</div>
    </div>
  );
}
