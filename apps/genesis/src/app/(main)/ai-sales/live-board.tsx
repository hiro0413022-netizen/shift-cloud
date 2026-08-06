"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { AiSalesLive } from "@/lib/ai-sales-live";
import { fetchAiSalesLive, runContentLoopNow, refreshMetricsNow } from "./actions";

/**
 * AI営業ライブボード（#101）。15秒ごとにサーバーアクションで再取得。
 * タブが非表示の間はポーリングを止める（無駄なDB往復をしない）。
 */

const REFRESH_MS = 15_000;

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  awaiting_approval: { label: "承認待ち", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  scheduled: { label: "投稿予約", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  posted: { label: "投稿済み", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  failed: { label: "失敗", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  rejected: { label: "却下", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  draft: { label: "下書き", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
};

const PRODUCT_SHORT: Record<string, string> = {
  pganote: "PGA NOTE",
  "swing-cortex": "SWING CORTEX",
  webdesign: "HP制作",
  yozan: "YOZAN公式", // 会社紹介など売り込みではない発信（0096）
};

function rel(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

function jstTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-(--color-line) bg-(--color-panel) p-4 ${className}`}>{children}</div>
  );
}

export function LiveBoard({ initial }: { initial: AiSalesLive }) {
  const [data, setData] = useState<AiSalesLive>(initial);
  const [live, setLive] = useState(true);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      fetchAiSalesLive()
        .then((d) => {
          setData(d);
          setLive(true);
        })
        .catch(() => setLive(false));
    };
    timer.current = setInterval(tick, REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const f = data.funnel;
  const p = data.pipeline;

  const warnings: string[] = [];
  if (data.config.loopEnabled === false) warnings.push("SNSコンテンツループが無効です（gn_loops sns_content）");
  if (!data.config.aiConfigured) warnings.push("ANTHROPIC_API_KEY 未設定 → 投稿文はテンプレート生成になります");
  if (!data.config.igConfigured)
    warnings.push("@swingcortex_jp 未接続（IG_ACCESS_TOKEN / IG_BUSINESS_ID）→ 承認済み投稿は接続後に自動配信されます");
  if (!data.config.igWebConfigured)
    warnings.push("@yozan_web_jp 未接続（IG_ACCESS_TOKEN_WEB / IG_BUSINESS_ID_WEB）→ HP制作の投稿は接続後に自動配信されます");
  if (!data.config.xConfigured)
    warnings.push(
      "X @YOZAN_inc 未接続（X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET）→ 承認済み投稿は接続後に自動配信されます"
    );

  const funnelSteps = [
    { label: "投稿（30日）", value: f.posts30d, icon: "📸" },
    { label: "LP閲覧", value: f.lpViews30d, icon: "👀" },
    { label: "新規リード", value: f.leads30d, icon: "📨" },
    { label: "商談中", value: f.deals, icon: "🤝" },
    { label: "導入（累計）", value: f.adopted, icon: "🏆" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ステータスバー */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-2 rounded-full border border-(--color-line) bg-(--color-panel) px-3 py-1.5">
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-red-400"}`} />
          {live ? "LIVE" : "接続エラー"}
          <span className="text-xs text-(--color-dim)">更新 {jstTime(data.generatedAt)}（15秒ごと）</span>
        </span>
        {data.config.xAuto && (
          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300">
            X @YOZAN_inc は承認なしで自動投稿（Instagramのみ承認制）
          </span>
        )}
        {data.lastRun && (
          <span className="text-xs text-(--color-dim)">
            AIの直近判断: {data.lastRun.date}{" "}
            {data.lastRun.decision === "act" ? "投稿を起案" : `スキップ（${data.lastRun.reason}）`}
          </span>
        )}
        <button
          onClick={() => startTransition(async () => setData(await runContentLoopNow().then(() => fetchAiSalesLive())))}
          disabled={pending}
          className="ml-auto rounded-lg border border-(--color-line) px-3 py-1.5 text-xs text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt) disabled:opacity-50"
        >
          {pending ? "実行中..." : "今日の投稿案をいま作る"}
        </button>
        {/* 通常は日次cronが取り込む。押しても同じ投稿はUTC日内で重複課金されない（#109） */}
        <button
          onClick={() => startTransition(async () => setData(await refreshMetricsNow().then(() => fetchAiSalesLive())))}
          disabled={pending || !data.config.xConfigured}
          className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt) disabled:opacity-50"
          title="Xの反応数を取り込みます（通常は毎朝の自動処理で更新されます）"
        >
          {pending ? "実行中..." : "反応数をいま取り込む"}
        </button>
      </div>

      {/* 設定の警告 */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
          {warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}

      {/* ファネル */}
      <Card>
        <p className="mb-3 text-xs tracking-widest text-(--color-dim)">FUNNEL — SNS → LP → リード → 商談</p>
        <div className="flex flex-wrap items-stretch gap-2">
          {funnelSteps.map((st, i) => (
            <div key={st.label} className="flex items-center gap-2">
              <div className="min-w-28 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-4 py-3 text-center">
                <p className="text-2xl font-bold">{st.value}</p>
                <p className="mt-1 text-xs text-(--color-dim)">
                  {st.icon} {st.label}
                </p>
              </div>
              {i < funnelSteps.length - 1 && <span className="text-(--color-dim)">→</span>}
            </div>
          ))}
          {f.demoHot > 0 && (
            <div className="ml-auto self-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-red-300">{f.demoHot}</p>
              <p className="mt-1 text-xs text-red-200">🔥 デモ開封・未対応</p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 投稿パイプライン */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs tracking-widest text-(--color-dim)">POST PIPELINE — 生成 → 承認 → 予約 → 投稿</p>
            <p className="text-xs text-(--color-dim)">
              承認待ち {p.awaiting} ・ 予約中 {p.scheduled}
              {p.nextScheduledAt ? ` ・ 次回 ${jstTime(p.nextScheduledAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {data.posts.length === 0 && (
              <p className="py-6 text-center text-sm text-(--color-dim)">
                まだ投稿がありません。毎朝6時に自動生成されます（上の「いま作る」でも試せます）
              </p>
            )}
            {data.posts.map((post) => {
              const chip = STATUS_CHIP[post.status] ?? STATUS_CHIP.draft;
              return (
                <div key={post.id} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${chip.cls}`}>{chip.label}</span>
                    <span className="text-[11px] text-(--color-dim)">{PRODUCT_SHORT[post.product] ?? post.product}</span>
                    <span className="ml-auto text-[11px] text-(--color-dim)">
                      {post.postedAt ? `投稿 ${jstTime(post.postedAt)}` : post.scheduledAt ? `予定 ${jstTime(post.scheduledAt)}` : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{post.hook}</p>
                  {/* チャネル別の配信状況（1投稿をInstagramとXの両方へ・#103） */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                    <span
                      className={`rounded border px-1.5 py-0.5 ${
                        post.igPosted
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-(--color-line) text-(--color-dim)"
                      }`}
                    >
                      IG {post.igPosted ? "投稿済み" : "未"}
                    </span>
                    {post.xUrl ? (
                      <a
                        href={post.xUrl}
                        target="_blank"
                        className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 hover:underline"
                      >
                        X {post.threadParts > 0 ? "スレッド" : "投稿済み"} ↗
                      </a>
                    ) : (
                      <span className="rounded border border-(--color-line) px-1.5 py-0.5 text-(--color-dim)">
                        {data.config.xAuto ? "X 自動投稿を待機中" : "X 未"}
                      </span>
                    )}
                    {/* 連投の進捗（0096）。途中で止まっているのが一目で分かるようにする */}
                    {post.threadParts > 0 && (
                      <span
                        className={`rounded border px-1.5 py-0.5 ${
                          post.threadPosted >= post.threadParts
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        連投 {post.threadPosted}/{post.threadParts}
                        {post.threadPosted > 0 && post.threadPosted < post.threadParts ? "（続きを投稿中）" : ""}
                      </span>
                    )}
                  </div>
                  {/* 反応数（#109・日次cronで取得。スレッドは連投全体の合計） */}
                  {post.reactions && (
                    <div className="mt-1.5 flex flex-wrap gap-2.5 text-[11px] text-(--color-dim)">
                      {post.reactions.impressions != null && <span>👁 {post.reactions.impressions.toLocaleString()}</span>}
                      <span>♡ {post.reactions.likes}</span>
                      <span>↻ {post.reactions.reposts}</span>
                      <span>💬 {post.reactions.replies}</span>
                    </div>
                  )}
                  {post.error && <p className="mt-1 text-xs text-red-300">IG: {post.error}</p>}
                  {post.xError && !post.xPosted && <p className="mt-1 text-xs text-red-300">X: {post.xError}</p>}
                  <div className="mt-2 flex gap-3 text-[11px]">
                    <a
                      href={`/api/public/ai-sales/card/${post.id}`}
                      target="_blank"
                      className="text-sky-300 hover:underline"
                    >
                      カード画像
                    </a>
                    {post.status === "awaiting_approval" && (
                      <a href="/" className="text-amber-300 hover:underline">
                        ホームで承認・修正 →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-3 border-t border-(--color-line) pt-3 text-[11px] text-(--color-dim)">
            LP:
            <a href="/lp/pganote?preview=1" target="_blank" className="text-sky-300 hover:underline">
              PGA NOTE
            </a>
            <a href="/lp/swing-cortex?preview=1" target="_blank" className="text-sky-300 hover:underline">
              SWING CORTEX
            </a>
            <a href="/lp/webdesign?preview=1" target="_blank" className="text-sky-300 hover:underline">
              HP制作
            </a>
            <span className="ml-auto">社内リンクは ?preview=1（計測から除外）</span>
          </div>
        </Card>

        {/* 活動フィード */}
        <Card>
          <p className="mb-3 text-xs tracking-widest text-(--color-dim)">ACTIVITY — AIと見込み客のうごき</p>
          <div className="flex max-h-[520px] flex-col gap-1 overflow-y-auto pr-1">
            {data.activity.length === 0 && (
              <p className="py-6 text-center text-sm text-(--color-dim)">まだ活動がありません</p>
            )}
            {data.activity.map((a, i) => (
              <div key={`${a.at}-${i}`} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-(--color-panel-2)">
                <span className="mt-0.5 text-base">{a.icon}</span>
                <div className="min-w-0 flex-1">
                  {a.href ? (
                    <a href={a.href} target="_blank" className="text-sm leading-snug text-sky-300 hover:underline">
                      {a.text} ↗
                    </a>
                  ) : (
                    <p className="text-sm leading-snug">{a.text}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-(--color-dim)">
                    {a.tag} ・ {rel(a.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
