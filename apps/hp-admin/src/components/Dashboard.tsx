"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { arpc, edge, type SiteInfo } from "@/lib/api";
import { Spinner, fmtDate } from "./ui";

type Stats = {
  days: number;
  from: string;
  summary: { views: number; visitors: number; sessions: number; prev_views: number; prev_visitors: number; mobile_rate: number | null };
  daily: { day: string; views: number; visitors: number; impressions: number; clicks: number }[];
  pages: { path: string; title: string | null; views: number; visitors: number }[];
  sources: { source: string; views: number; visitors: number }[];
  posts: { slug: string; title: string; views: number; visitors: number }[];
  gsc: {
    connected: boolean;
    property: string | null;
    last_sync: string | null;
    impressions: number;
    clicks: number;
    prev_impressions: number;
    position: number | null;
    queries: { query: string; impressions: number; clicks: number; position: number | null }[];
  };
};

const SOURCE_LABEL: Record<string, string> = {
  google: "Google検索",
  yahoo: "Yahoo!検索",
  bing: "Bing検索",
  instagram: "Instagram",
  facebook: "Facebook",
  line: "LINE",
  x: "X（旧Twitter）",
  ai: "AI（ChatGPT等）",
  direct: "直接（ブックマーク・URL入力など）",
  other: "その他のサイト",
};

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("ja-JP");

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return <span className="text-[11px] text-soft">前の期間：データなし</span>;
  const r = Math.round(((now - prev) / prev) * 100);
  return (
    <span className={`text-[11px] font-semibold ${r >= 0 ? "text-emerald-600" : "text-red-600"}`}>
      前の期間より {r >= 0 ? "+" : ""}
      {r}%
    </span>
  );
}

export default function Dashboard({ site, onError }: { site: SiteInfo; onError: (e: unknown) => void }) {
  const [days, setDays] = useState(28);
  const [s, setS] = useState<Stats | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    arpc<Stats>("hp_admin_stats", { p_site: site.code, p_days: days }).then(setS).catch(onError);
  }, [site.code, days, onError]);

  useEffect(() => {
    setS(null);
    load();
  }, [load]);

  // 検索の数字は開いたときに取り込む（連携済みのサイトだけ・12時間に1回まで）
  const canSync = !!(s?.gsc.connected && s?.gsc.property);
  const synced = useRef(false);
  useEffect(() => {
    if (!canSync || synced.current) return;
    synced.current = true;
    edge<{ skipped?: boolean }>("gsc_sync", { site: site.code })
      .then((r) => {
        if (!r.skipped) load();
      })
      .catch(() => {});
  }, [canSync, site.code, load]);

  if (!s) return <Spinner />;
  const g = s.gsc;
  const gscReady = g.connected && !!g.property;
  const maxViews = Math.max(1, ...s.daily.map((d) => d.views));
  const maxImp = Math.max(1, ...s.daily.map((d) => d.impressions));
  const totalSrc = s.sources.reduce((a, b) => a + b.views, 0) || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold text-navy">アクセスの数字</h2>
        {[7, 28, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${days === d ? "bg-navy text-white" : "border border-line bg-white text-soft"}`}
          >
            {d === 7 ? "7日" : d === 28 ? "28日" : "90日"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="閲覧数（ページが見られた回数）" value={n(s.summary.views)} sub={<Delta now={s.summary.views} prev={s.summary.prev_views} />} />
        <Kpi label="訪問者数（見に来た人の数）" value={n(s.summary.visitors)} sub={<Delta now={s.summary.visitors} prev={s.summary.prev_visitors} />} />
        <Kpi
          label="Google検索での表示回数"
          value={gscReady ? n(g.impressions) : "—"}
          sub={gscReady ? <Delta now={g.impressions} prev={g.prev_impressions} /> : <span className="text-[11px] text-soft">連携待ち</span>}
          accent
        />
        <Kpi
          label="検索からのクリック"
          value={gscReady ? n(g.clicks) : "—"}
          sub={
            <span className="text-[11px] text-soft">
              {gscReady && g.position ? `平均掲載順位 ${g.position}位` : gscReady ? "" : "連携待ち"}
            </span>
          }
          accent
        />
      </div>

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-soft">
          <span className="font-semibold text-ink">日ごとの推移</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-navy-2" />閲覧数</span>
          {gscReady && <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-gold" />検索の表示回数</span>}
          {s.summary.mobile_rate != null && <span className="ml-auto">スマホからの閲覧 {s.summary.mobile_rate}%</span>}
        </div>
        <div className="relative h-44">
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {s.daily.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t bg-navy-2/80 group-hover:bg-navy" style={{ height: `${(d.views / maxViews) * 100}%`, minHeight: d.views ? 2 : 0 }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-[11px] text-white group-hover:block">
                  {d.day.slice(5).replace("-", "/")}：閲覧 {d.views}・訪問者 {d.visitors}
                  {gscReady ? `・検索表示 ${d.impressions}` : ""}
                </div>
              </div>
            ))}
          </div>
          {gscReady && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${s.daily.length} 100`} preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="#b8923a"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                points={s.daily.map((d, i) => `${i + 0.5},${100 - (d.impressions / maxImp) * 96}`).join(" ")}
              />
            </svg>
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-soft">
          <span>{s.daily[0]?.day.slice(5).replace("-", "/")}</span>
          <span>今日</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold">どこから来たか</h3>
          {s.sources.length === 0 ? (
            <p className="text-sm text-soft">まだデータがありません</p>
          ) : (
            <ul className="space-y-2">
              {s.sources.map((x) => (
                <li key={x.source}>
                  <div className="flex justify-between text-[13px]">
                    <span>{SOURCE_LABEL[x.source] ?? `キャンペーン：${x.source}`}</span>
                    <span className="font-semibold">{n(x.views)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-bg">
                    <div className="h-1.5 rounded bg-gold" style={{ width: `${(x.views / totalSrc) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold">よく見られているページ</h3>
          <Table
            head={["ページ", "閲覧", "人"]}
            rows={s.pages.map((p) => [
              <a key="p" href={`https://${site.domain}${p.path}`} target="_blank" rel="noopener" className="line-clamp-1 hover:underline">
                {pageName(p.path, p.title)}
              </a>,
              n(p.views),
              n(p.visitors),
            ])}
          />
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold">ブログ記事ごとの閲覧</h3>
          <Table
            head={["記事", "閲覧", "人"]}
            rows={s.posts.map((p) => [<span key="t" className="line-clamp-1">{p.title}</span>, n(p.views), n(p.visitors)])}
            empty="公開中の記事はまだありません"
          />
        </div>

        <div className="card p-4">
          <h3 className="mb-1 text-sm font-bold">Googleで検索されたキーワード</h3>
          {!gscReady ? (
            <p className="text-[13px] leading-relaxed text-soft">
              Google Search Console とつなぐと、検索結果に何回出たか（表示回数）と、どんな言葉で探されたかがここに出ます。
              {g.connected ? "このサイトのプロパティ設定が残っています（設定タブ・オーナー）。" : "設定はオーナーが「設定」タブから行います。"}
            </p>
          ) : (
            <>
              <p className="mb-3 text-[11px] text-soft">
                Googleの数字は2〜3日遅れて確定します。最終取り込み：{fmtDate(g.last_sync)}
                <button
                  className="ml-2 underline disabled:opacity-50"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await edge("gsc_sync", { site: site.code, force: true });
                      load();
                    } catch (e) {
                      onError(e);
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  {syncing ? "取り込み中…" : "今すぐ取り込む"}
                </button>
              </p>
              <Table
                head={["キーワード", "表示", "クリック", "順位"]}
                rows={g.queries.map((q) => [<span key="q" className="line-clamp-1">{q.query}</span>, n(q.impressions), n(q.clicks), q.position ?? "-"])}
                empty="この期間の検索データはまだありません"
              />
            </>
          )}
        </div>
      </div>
      <p className="text-[11px] text-soft">
        閲覧数・訪問者数はホームページに入れた計測タグで数えています（{s.from} から今日まで・社内の方の閲覧も含みます）。
      </p>
    </div>
  );
}

function pageName(path: string, title: string | null) {
  const map: Record<string, string> = { "/": "トップページ", "/blog": "ブログ一覧" };
  if (map[path]) return map[path];
  const t = (title ?? "").split("|")[0].trim();
  return t ? `${t}（${path}）` : path;
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "bg-gold-soft/50" : ""}`}>
      <div className="text-[11px] font-semibold leading-tight text-soft">{label}</div>
      <div className="mt-1.5 text-2xl font-bold text-navy">{value}</div>
      <div className="mt-0.5">{sub}</div>
    </div>
  );
}

function Table({ head, rows, empty = "まだデータがありません" }: { head: string[]; rows: React.ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-soft">{empty}</p>;
  return (
    <table className="w-full table-fixed text-[13px]">
      <thead>
        <tr className="text-left text-[11px] text-soft">
          {head.map((h, i) => (
            <th key={h} className={`pb-1.5 font-semibold ${i === 0 ? "" : "w-16 text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">
            {r.map((c, j) => (
              <td key={j} className={`py-1.5 ${j === 0 ? "pr-2" : "text-right tabular-nums"}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
