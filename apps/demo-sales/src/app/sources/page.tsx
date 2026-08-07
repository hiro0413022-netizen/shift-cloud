import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { cardCls, inputCls, btnCls } from "@/components/ui";
import { INDUSTRIES } from "@/lib/types";
import { saveSource, deleteSource, runNow } from "./actions";

export const dynamic = "force-dynamic";

type Source = {
  id: string;
  name: string;
  kind: string;
  industry: string;
  city: string | null;
  url: string | null;
  link_pattern: string | null;
  query: string | null;
  max_per_run: number;
  enabled: boolean;
  visit_detail: boolean;
  parser: string;
  sort: number;
  last_run_at: string | null;
  last_result: { picked?: number; candidates?: number; errors?: string[] } | null;
};

type Run = {
  started_at: string;
  finished_at: string | null;
  picked: number;
  skipped: number;
  audited: number;
  demos: number;
};

const jst = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function SourcesPage() {
  const actor = await requireActor();
  const admin = createAdmin();

  const [{ data: sources }, { data: runs }, { count: autoCount }, { count: uncheckedCount }] = await Promise.all([
    admin.from("prs_sources").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort"),
    admin.from("prs_runs").select("started_at,finished_at,picked,skipped,audited,demos").eq("company_id", actor.companyId).order("started_at", { ascending: false }).limit(7),
    admin.from("dms_prospects").select("id", { count: "exact", head: true }).eq("company_id", actor.companyId).eq("source", "auto").is("deleted_at", null),
    // 「サイトの有無を確認できていない」件数。ここが増えっぱなしなら採点が進んでいない合図（#119）
    admin
      .from("dms_prospects")
      .select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .eq("website_checked", false)
      .is("website_url", null),
  ]);

  const rows = (sources ?? []) as Source[];
  const runRows = (runs ?? []) as Run[];

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <label className="text-xs text-(--color-dim)">
      {label}
      {node}
      {hint ? <span className="mt-0.5 block text-[11px] opacity-70">{hint}</span> : null}
    </label>
  );

  const form = (src?: Source) => (
    <form key={src?.id ?? "new"} action={saveSource} className="grid gap-2 rounded-lg border border-(--color-line) p-3 text-sm">
      {src ? <input type="hidden" name="id" value={src.id} /> : null}
      <div className="grid gap-2 md:grid-cols-2">
        {field("名前", <input name="name" defaultValue={src?.name ?? ""} placeholder="伊丹市医師会 会員名簿" className={inputCls} />)}
        {field(
          "取得方法",
          <select name="kind" defaultValue={src?.kind ?? "directory"} className={inputCls}>
            <option value="directory">公開名簿ページを巡回</option>
            <option value="places">Google Places API</option>
          </select>,
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {field(
          "業種",
          <select name="industry" defaultValue={src?.industry ?? "other"} className={inputCls}>
            {Object.entries(INDUSTRIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>,
        )}
        {field("市区町村", <input name="city" defaultValue={src?.city ?? ""} placeholder="伊丹市" className={inputCls} />)}
        {field(
          "読み取り方",
          <select name="parser" defaultValue={src?.parser ?? "auto"} className={inputCls}>
            <option value="auto">自動（規則→ダメならAI）</option>
            <option value="rules">規則のみ（無料・速い）</option>
            <option value="ai">AIで読む（どんな構造でも）</option>
          </select>,
          "AIは一覧に書いてあることを写すだけ。存在しない店は作りません",
        )}
        {field("1回の上限", <input name="max_per_run" type="number" defaultValue={src?.max_per_run ?? 100} className={inputCls} />, "一覧1ページから拾える件数の上限")}
      </div>
      {field("一覧ページURL（公開名簿のとき）", <input name="url" defaultValue={src?.url ?? ""} placeholder="https://www.itami-med.or.jp/kikan/..." className={inputCls} />)}
      {field(
        "詳細ページの見分け方（正規表現・任意）",
        <input name="link_pattern" defaultValue={src?.link_pattern ?? ""} placeholder="cmd=dp" className={inputCls} />,
        "一覧ページの中から拾うリンクを絞り込みます。空なら同じサイト内の全リンクが対象",
      )}
      {field("検索語（Google Placesのとき）", <input name="query" defaultValue={src?.query ?? ""} placeholder="美容室 伊丹市" className={inputCls} />)}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="enabled" defaultChecked={src?.enabled ?? true} /> 巡回する
        </label>
        <label className="flex items-center gap-1 text-xs" title="1件ごとに1秒以上かかるため、ONにすると1回に拾える件数が大幅に減ります">
          <input type="checkbox" name="visit_detail" defaultChecked={src?.visit_detail ?? false} /> 詳細ページも開く（遅い）
        </label>
        <label className="text-xs text-(--color-dim)">
          並び <input name="sort" type="number" defaultValue={src?.sort ?? 0} className={`${inputCls} w-20`} />
        </label>
        <button className={btnCls}>{src ? "保存" : "追加"}</button>
      </div>
      {src?.last_result ? (
        <p className="text-[11px] text-(--color-dim)">
          前回（{jst(src.last_run_at)}）: 候補 {src.last_result.candidates ?? 0}件 → 新規 {src.last_result.picked ?? 0}件
          {src.last_result.errors?.length ? ` ／ 注意: ${src.last_result.errors[0]}` : ""}
        </p>
      ) : null}
    </form>
  );

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-(--color-dim) hover:text-(--color-txt)">
          ← 営業司令へ戻る
        </Link>
        <h1 className="text-2xl font-bold">営業先の自動ピックアップ</h1>
        <p className="text-sm text-(--color-dim)">
          毎日 朝5時と朝8時に、ここに登録した巡回元から新しい営業先を拾い、ホームページの現況を採点します。
          パソコンを開いていなくても動きます（Vercel Cron）。点数の高い先は自動でデモまで作られ、送るかどうかだけを判断できる状態になります。
          <b>ホームページが無い先は95点（最優先）</b>として扱います — 作るものが何も無い先こそ、この営業の本命だからです。
          ただし<b>「無い」と確認できた先だけ</b>です。まだ調べていない先は採点を保留します（持っている医院に「見当たりません」と送らないため）。
        </p>
      </header>

      <section className={`${cardCls} mb-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            自動で拾った営業先: <b>{autoCount ?? 0}</b> 件
            {uncheckedCount ? (
              <span className="ml-3 text-xs text-(--color-dim)">
                うち <b>{uncheckedCount}</b> 件はホームページの有無を確認中（確認できるまで採点しません）
              </span>
            ) : null}
          </div>
          <form action={runNow}>
            <button className={btnCls}>いま1回だけ試す（45秒）</button>
          </form>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-(--color-dim)">
              <tr>
                <th className="py-1 pr-3">実行</th>
                <th className="py-1 pr-3">新規</th>
                <th className="py-1 pr-3">重複で除外</th>
                <th className="py-1 pr-3">採点</th>
                <th className="py-1 pr-3">デモ生成</th>
                <th className="py-1 pr-3">状態</th>
              </tr>
            </thead>
            <tbody>
              {runRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-2 text-(--color-dim)">
                    まだ実行されていません
                  </td>
                </tr>
              ) : (
                runRows.map((r) => (
                  <tr key={r.started_at} className="border-t border-(--color-line)">
                    <td className="py-1 pr-3">{jst(r.started_at)}</td>
                    <td className="py-1 pr-3">{r.picked}</td>
                    <td className="py-1 pr-3">{r.skipped}</td>
                    <td className="py-1 pr-3">{r.audited}</td>
                    <td className="py-1 pr-3">{r.demos}</td>
                    <td className="py-1 pr-3">{r.finished_at ? "完了" : "実行中/中断"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">巡回元（{rows.length}件）</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((src) => (
            <div key={src.id} className="grid gap-1">
              {form(src)}
              <form action={deleteSource} className="text-right">
                <input type="hidden" name="id" value={src.id} />
                <button className="text-[11px] text-(--color-dim) hover:underline">この巡回元を削除</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">巡回元を追加</h2>
        {form()}
        <p className="mt-3 text-[11px] text-(--color-dim)">
          Google Places を使うには環境変数 <code>GOOGLE_PLACES_API_KEY</code> が必要です。未設定のあいだ Places の巡回元は自動で見送られ、公開名簿ページの巡回だけが動きます。
        </p>
      </section>
    </main>
  );
}

export const metadata = { title: "営業先の自動ピックアップ" };
