import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { formatDuration, getLinkByResource, listSessions } from "@yozan/track/server";
import { requireActor } from "@/lib/auth";
import { cardCls, inputCls, btnCls } from "@/components/ui";
import { ColorField, GalleryField, ImageField } from "@/components/demo-media";
import { QuoteBuilder, type OptionRow, type PlanRow } from "@/components/quote-builder";
import { createQuote, setQuoteStatus } from "@/app/quote-actions";
import { ANALYSIS_ITEMS, INDUSTRIES, STATUSES, LOST_REASONS, HERO_STYLES, type AnalysisItemKey, type IndustryKey, type StatusKey } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import { addActivity, generateDemo, generateDocs, revertToNegotiation, setDemoAccess, transferToProject, updateProspect } from "@/app/actions";

export const dynamic = "force-dynamic";

const DOC_LABELS: Record<string, string> = {
  proposal: "1枚提案書",
  phone_talk: "電話営業トーク",
  visit_talk: "訪問営業トーク",
  email: "メール・問い合わせ文章",
  thanks_mail: "面談後お礼メール（5種）",
  quote: "見積書案",
};
const ACT_LABELS: Record<string, string> = {
  call: "電話",
  visit: "訪問",
  mail: "メール",
  meeting: "面談",
  edit_request: "修正指示",
  status: "ステータス",
  note: "メモ",
  directive: "指示",
};

/** 日時をJSTで「7/27 14:05」表示（サーバーはUTC・#73） */
const jstAt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

/** デモ生成フォームのセクション枠（番号バッジ＋タイトル＋補足） */
function FormSec({ no, title, hint, children }: { no: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-(--color-line) p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-(--color-accent) text-xs font-bold text-white">{no}</span>
        <span className="text-sm font-semibold">{title}</span>
        {hint && <span className="text-xs text-(--color-dim)">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: p } = await admin.from("dms_prospects").select("*").eq("id", id).eq("company_id", actor.companyId).is("deleted_at", null).single();
  if (!p) notFound();

  const [{ data: demos }, { data: docs }, { data: acts }, { data: plans }, { data: project }, { data: options }, { data: quotes }, { data: qsettings }] =
    await Promise.all([
      admin.from("dms_demos").select("*").eq("prospect_id", id).is("deleted_at", null).order("version", { ascending: false }),
      admin.from("dms_documents").select("*").eq("prospect_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
      admin.from("dms_activities").select("*").eq("prospect_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(30),
      admin.from("dms_plans").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort"),
      admin.from("dms_projects").select("*").eq("prospect_id", id).is("deleted_at", null).maybeSingle(),
      admin.from("dms_options").select("*").eq("company_id", actor.companyId).eq("active", true).is("deleted_at", null).order("sort"),
      admin.from("dms_quotes").select("*").eq("prospect_id", id).is("deleted_at", null).order("version", { ascending: false }),
      admin.from("dms_quote_settings").select("*").eq("company_id", actor.companyId).maybeSingle(),
    ]);

  const latestDemo = demos?.[0] ?? null;

  // 閲覧計測（@yozan/track #95）。デモが未生成なら何も出さない
  const trackLink = latestDemo ? await getLinkByResource(admin, "demo-sales", "demo", latestDemo.id) : null;
  const trackSessions = trackLink ? await listSessions(admin, trackLink.id, { limit: 10 }) : [];
  // 前回見積のオプション選択を引き継ぐ（面談中の作り直しを速くする）
  const lastQuote = quotes?.[0] ?? null;
  const lastSelected: Record<string, number> | undefined = lastQuote
    ? Object.fromEntries(((lastQuote.items ?? []) as { key: string; qty: number }[]).map((i) => [i.key, i.qty]))
    : undefined;
  const tpl = getTemplate(p.industry);
  const brief = (latestDemo?.brief ?? {}) as Record<string, unknown>;
  const bstr = (k: string) => (typeof brief[k] === "string" ? (brief[k] as string) : "");
  const upd = updateProspect.bind(null, id);
  const gen = generateDemo.bind(null, id);
  const act = addActivity.bind(null, id);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) hover:text-(--color-txt)">← 営業司令へ戻る</Link>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-sm text-(--color-dim)">
            {INDUSTRIES[p.industry as IndustryKey] ?? p.industry}
            {p.city ? `・${p.city}` : ""}・担当: {p.owner_name}
          </p>
        </div>
        <form action={upd} className="flex items-center gap-2">
          <input type="hidden" name="_prev_status" value={p.status} />
          <select name="status" defaultValue={p.status} className={inputCls}>
            {Object.entries(STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className={btnCls}>変更</button>
        </form>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 基本情報 */}
        <section className={cardCls}>
          <h2 className="mb-3 font-semibold">基本情報</h2>
          <form action={upd} className="grid gap-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <input name="city" defaultValue={p.city ?? ""} placeholder="市区町村" className={inputCls} />
              <input name="phone" defaultValue={p.phone ?? ""} placeholder="電話番号" className={inputCls} />
            </div>
            <input name="address" defaultValue={p.address ?? ""} placeholder="住所" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input name="email" defaultValue={p.email ?? ""} placeholder="メール" className={inputCls} />
              <input name="contact_name" defaultValue={p.contact_name ?? ""} placeholder="院長・担当者名" className={inputCls} />
            </div>
            <input name="website_url" defaultValue={p.website_url ?? ""} placeholder="ホームページURL" className={inputCls} />
            <input name="gmap_url" defaultValue={p.gmap_url ?? ""} placeholder="GoogleマップURL" className={inputCls} />
            <div className="flex items-center gap-3">
              <button className={btnCls}>保存</button>
              {p.website_url && (
                <a href={p.website_url} target="_blank" className="text-xs text-(--color-accent) hover:underline">現サイトを開く ↗</a>
              )}
              {p.gmap_url && (
                <a href={p.gmap_url} target="_blank" className="text-xs text-(--color-accent) hover:underline">Googleマップ ↗</a>
              )}
            </div>
          </form>
        </section>

        {/* 自動計測の内訳（@yozan/prospect #110）。人が上書きした所見と混ざらないよう、観測値は読み取り専用で出す */}
        {p.audited_at ? (
          <section className={cardCls}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">自動計測の内訳</h2>
              <span className="text-xs text-(--color-dim)">
                計測 {new Date(p.audited_at as string).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {p.auto_demo_at ? " ／ デモは自動生成" : ""}
              </span>
            </div>
            <div className="grid gap-1 text-xs sm:grid-cols-2">
              {Object.entries(((p.analysis as { items?: Record<string, { score?: number; note?: string }> })?.items ?? {})).map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-2 border-b border-(--color-line) py-1">
                  <span className="w-8 shrink-0 font-mono" title={`${v.score ?? "—"} / 5`}>
                    {"●".repeat(Math.max(0, Math.min(5, v.score ?? 0)))}
                    <span className="opacity-25">{"●".repeat(5 - Math.max(0, Math.min(5, v.score ?? 0)))}</span>
                  </span>
                  <span className="w-32 shrink-0 text-(--color-dim)">{ANALYSIS_ITEMS[k as AnalysisItemKey] ?? k}</span>
                  <span className="opacity-80">{v.note}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-(--color-dim)">
              機械が見た観測値です。下の「分析・営業スコア」で上書きすると、そちらが正になります（次回の自動計測では戻りません）。
            </p>
          </section>
        ) : null}

        {/* 分析・営業スコア */}
        <section className={cardCls}>
          <h2 className="mb-3 font-semibold">現サイト分析・営業スコア</h2>
          <form action={upd} className="grid gap-2 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-(--color-dim)">総合スコア(0-100)
                <input name="score" defaultValue={p.score ?? ""} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim)">デモ優先度(1=最優先)
                <input name="demo_priority" defaultValue={p.demo_priority ?? ""} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim)">成約可能性
                <select name="close_probability" defaultValue={p.close_probability ?? ""} className={inputCls}>
                  <option value="">—</option>
                  <option value="high">高</option>
                  <option value="mid">中</option>
                  <option value="low">低</option>
                </select>
              </label>
            </div>
            <label className="text-xs text-(--color-dim)">現サイトの良い点（営業で必ず先に伝える）
              <textarea name="good_points" defaultValue={p.good_points ?? ""} rows={2} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">改善余地
              <textarea name="improve_points" defaultValue={p.improve_points ?? ""} rows={2} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">営業時の注意（否定的に伝えてはいけない点）
              <textarea name="caution_points" defaultValue={p.caution_points ?? ""} rows={2} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">提案しやすいポイント
              <textarea name="sales_points" defaultValue={p.sales_points ?? ""} rows={2} className={inputCls} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-(--color-dim)">推奨プラン
                <select name="suggested_plan_key" defaultValue={p.suggested_plan_key ?? "basic"} className={inputCls}>
                  {(plans ?? []).map((pl) => (
                    <option key={pl.key} value={pl.key}>{pl.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-(--color-dim)">想定制作費(円)
                <input name="est_build_price" defaultValue={p.est_build_price ?? ""} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim)">想定月額(円)
                <input name="est_monthly_fee" defaultValue={p.est_monthly_fee ?? ""} className={inputCls} />
              </label>
            </div>
            <label className="text-xs text-(--color-dim)">分析総評
              <textarea name="analysis_summary" defaultValue={(p.analysis as { summary?: string })?.summary ?? ""} rows={2} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">改善効果の見込み
              <input name="analysis_effect" defaultValue={(p.analysis as { effect?: string })?.effect ?? ""} className={inputCls} />
            </label>
            <button className={`${btnCls} w-fit`}>分析を保存</button>
          </form>
        </section>
      </div>

      {/* デモサイト */}
      <section className={`${cardCls} mt-6 border-(--color-accent)`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">営業デモサイト</h2>
          {latestDemo && (
            <div className="flex gap-3 text-sm">
              {/* preview=1 … 社内プレビュー扱い（閲覧計測の集計から除外される） */}
              <a href={`/d/${latestDemo.token}?preview=1`} target="_blank" className={btnCls}>デモを開く（v{latestDemo.version}）</a>
              <Link href={`/p/${id}/compare`} className={`${btnCls} bg-(--color-ok)`}>現サイトと比較</Link>
            </div>
          )}
        </div>

        {latestDemo && (
          <div className="mb-4 rounded-lg bg-(--color-panel-2) p-3 text-xs text-(--color-dim)">
            <p>
              非公開URL: <code className="select-all">/d/{latestDemo.token}</code>（noindex・DEMOラベル付き・
              {latestDemo.expires_on ? `${latestDemo.expires_on}まで有効` : "無期限"}
              {latestDemo.passcode ? "・パスコードあり" : "・パスコードなし"}）
            </p>
            <form action={setDemoAccess.bind(null, latestDemo.id)} className="mt-2 flex flex-wrap items-center gap-2">
              <input name="passcode" defaultValue={latestDemo.passcode ?? ""} placeholder="閲覧パスコード（空=なし）" className={`${inputCls} max-w-56`} />
              <input name="expires_on" type="date" defaultValue={latestDemo.expires_on ?? ""} className={`${inputCls} max-w-44`} />
              <button className={`${btnCls} px-3 py-1.5`}>共有設定を保存</button>
            </form>
          </div>
        )}

        {/* 閲覧状況（#95）— 「見てくれた先にだけ電話する」ための材料 */}
        {latestDemo && (
          <div
            className={`mb-4 rounded-lg p-3 text-sm ${
              trackLink?.firstViewedAt ? "bg-(--color-ok)/10 border border-(--color-ok)" : "bg-(--color-panel-2)"
            }`}
          >
            {trackLink?.firstViewedAt ? (
              <>
                <p className="font-semibold text-(--color-ok)">
                  先方が閲覧しました（{trackLink.viewCount}回・合計{formatDuration(trackLink.totalSeconds)}）
                </p>
                <p className="mt-1 text-xs text-(--color-dim)">
                  初回 {jstAt(trackLink.firstViewedAt)} ／ 最終 {jstAt(trackLink.lastViewedAt)}
                  ・開封直後の架電がもっとも繋がります
                </p>
                {trackSessions.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {trackSessions.map((sv) => (
                      <li key={sv.id} className="flex flex-wrap gap-x-3 text-(--color-dim)">
                        <span className="text-(--color-fg)">{jstAt(sv.startedAt)}</span>
                        <span>{sv.device === "mobile" ? "スマホ" : "PC"}</span>
                        <span>{formatDuration(sv.seconds)}</span>
                        <span>{sv.pageViews + 1}ページ</span>
                        {sv.pages.length > 0 && <span className="truncate">{sv.pages.join(" → ")}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-(--color-dim)">
                まだ閲覧されていません。開かれるとここに日時・滞在時間・見たページが出ます（社内プレビューは除外）。
              </p>
            )}
          </div>
        )}

        <details open={!latestDemo}>
          <summary className="cursor-pointer text-sm font-medium text-(--color-accent)">
            {latestDemo ? "デモを修正して再生成（面談中の要望はここに入力）" : "デモを生成する"}
          </summary>
          <form action={gen} className="mt-4 grid gap-5 text-sm">
            <input type="hidden" name="mode" value={latestDemo ? "update" : "create"} />
            <input type="hidden" name="industry" value={p.industry} />

            <p className="rounded-lg bg-(--color-panel-2) px-3 py-2 text-xs text-(--color-dim)">
              6ページ構成（ホーム／{tpl.vocab.services}／{tpl.vocab.firstVisit}／院長・院内紹介／アクセス／Web予約デモ）で生成されます。
              <b>空欄はうすい文字の内容（業種標準・※仮）で自動補完</b>。写真未設定の箇所はサンプルイラスト（※仮画像ラベル付き）が入ります。
            </p>

            {/* ① 基本設定 */}
            <FormSec no="1" title="基本設定" hint="院名・色・連絡先">
              <div className="grid gap-2 lg:grid-cols-2">
                <label className="text-xs text-(--color-dim)">院名（デモ表示名）
                  <input name="clinicName" defaultValue={bstr("clinicName") || p.name} className={inputCls} />
                </label>
                <ColorField name="colorPrimary" initial={bstr("colorPrimary")} templateColor={tpl.palette.primary} />
                <label className="text-xs text-(--color-dim)">電話番号
                  <input name="phone" defaultValue={bstr("phone") || (p.phone ?? "")} placeholder="00-0000-0000（空=仮表記）" className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">住所
                  <input name="address" defaultValue={bstr("address") || (p.address ?? "")} placeholder="住所を掲載します（空=仮表記）" className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">交通アクセス
                  <input name="access" defaultValue={bstr("access")} placeholder="例: ○○駅から徒歩5分" className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">駐車場
                  <input name="parking" defaultValue={bstr("parking")} placeholder="例: 医院前に5台分あり" className={inputCls} />
                </label>
              </div>
            </FormSec>

            {/* ② 文章 */}
            <FormSec no="2" title="文章" hint="キャッチコピー・ごあいさつ・採用">
              <div className="grid gap-2 lg:grid-cols-2">
                <label className="text-xs text-(--color-dim)">キャッチコピー
                  <textarea name="tagline" defaultValue={bstr("tagline")} rows={2} placeholder={tpl.defaults.tagline.replace(/\n/g, "")} className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">導入文
                  <textarea name="intro" defaultValue={bstr("intro")} rows={2} placeholder={tpl.defaults.intro} className={inputCls} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-(--color-dim)">院長肩書
                    <input name="directorTitle" defaultValue={bstr("directorTitle") || "院長"} className={inputCls} />
                  </label>
                  <label className="text-xs text-(--color-dim)">院長名
                    <input name="directorName" defaultValue={bstr("directorName")} placeholder="空=仮表記" className={inputCls} />
                  </label>
                </div>
                <label className="text-xs text-(--color-dim)">院長メッセージ（院長・院内紹介ページに全文掲載）
                  <textarea name="directorMessage" defaultValue={bstr("directorMessage")} rows={2} placeholder="空=仮文章（院長先生のお考えを伺って作成します）" className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">採用メッセージ
                  <input name="recruit" defaultValue={bstr("recruit")} placeholder="例: 受付スタッフ・看護師を募集しています（空=仮文章）" className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">お知らせ（1行1件「日付|内容」）
                  <textarea name="news" rows={2} placeholder={"2026.07|ホームページをリニューアルしました\n2026.07|Web予約を開始しました"} className={inputCls} defaultValue={Array.isArray(brief.news) ? (brief.news as { date: string; text: string }[]).map((n) => `${n.date}|${n.text}`).join("\n") : ""} />
                </label>
              </div>
            </FormSec>

            {/* ③ 診療内容・診療時間 */}
            <FormSec no="3" title={`${tpl.vocab.services}・${tpl.vocab.hours}`} hint="Web予約デモの休診日はこの時間表から自動判定">
              <div className="grid gap-2 lg:grid-cols-2">
                <label className="text-xs text-(--color-dim)">診療・サービス（1行1件「名前: 説明」）
                  <textarea name="services" rows={3} placeholder={tpl.defaults.services.map((sv) => `${sv.name}: ${sv.desc}`).join("\n")} className={inputCls} defaultValue={Array.isArray(brief.services) ? (brief.services as { name: string; desc: string }[]).map((sv) => `${sv.name}: ${sv.desc}`).join("\n") : ""} />
                </label>
                <label className="text-xs text-(--color-dim)">強み（1行1件・「選ばれる理由」に表示）
                  <textarea name="strengths" rows={3} placeholder={tpl.defaults.strengths.join("\n")} className={inputCls} defaultValue={Array.isArray(brief.strengths) ? (brief.strengths as string[]).join("\n") : ""} />
                </label>
                <label className="text-xs text-(--color-dim)">初診案内（1行1件・「{tpl.vocab.firstVisit}」ページに表示）
                  <textarea name="firstVisit" rows={3} placeholder={tpl.defaults.firstVisit.join("\n")} className={inputCls} defaultValue={Array.isArray(brief.firstVisit) ? (brief.firstVisit as string[]).join("\n") : ""} />
                </label>
                <label className="text-xs text-(--color-dim)">診療時間表（1行=1段・セルは | 区切り。1行目=曜日ヘッダ。●=診療 休=休診）
                  <textarea name="hours" rows={3} placeholder={tpl.defaults.hoursRows.map((r) => r.join("|")).join("\n")} className={inputCls} defaultValue={Array.isArray(brief.hoursRows) ? (brief.hoursRows as string[][]).map((r) => r.join("|")).join("\n") : ""} />
                </label>
                <label className="text-xs text-(--color-dim)">休診日等の注記
                  <input name="hoursNote" defaultValue={bstr("hoursNote")} placeholder={tpl.defaults.hoursNote} className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">予約方法の説明
                  <input name="reserveNote" defaultValue={bstr("reserveNote")} placeholder={tpl.defaults.reserveNote} className={inputCls} />
                </label>
              </div>
            </FormSec>

            {/* ④ 写真 */}
            <FormSec no="4" title="写真" hint="未設定の箇所はサンプルイラスト（※仮画像）で自動補完・アップロードすれば実写真が優先">
              <div className="grid gap-3 sm:grid-cols-2">
                <ImageField
                  prospectId={id}
                  name="logoImage"
                  label="ロゴ（ヘッダー院名の左・フッターに表示）"
                  hint="PNG推奨（透過のまま表示）。未設定ならロゴなしで院名テキストのみ"
                  initial={bstr("logoImage")}
                  transparent
                />
                <ImageField
                  prospectId={id}
                  name="heroImage"
                  label="ヘッダー（トップの大きな写真）"
                  hint="外観・待合室・スタッフ集合など。未設定ならサンプルイラスト（※仮画像）"
                  initial={bstr("heroImage")}
                />
                <label className="text-xs text-(--color-dim)">ヒーロー写真の見せ方（実写真がある時のみ有効）
                  <select name="heroStyle" defaultValue={bstr("heroStyle") || "overlay"} className={inputCls}>
                    {Object.entries(HERO_STYLES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <ImageField
                  prospectId={id}
                  name="directorImage"
                  label="院長・スタッフ写真（ごあいさつ欄）"
                  hint="未設定ならシルエットのサンプル画像"
                  initial={bstr("directorImage")}
                />
                <GalleryField
                  prospectId={id}
                  name="gallery"
                  initial={Array.isArray(brief.gallery) ? (brief.gallery as { url: string; caption?: string }[]) : []}
                />
              </div>
            </FormSec>

            {/* ⑤ 生成 */}
            <div className="rounded-lg border border-(--color-accent) bg-(--color-panel-2) p-3">
              <label className="text-xs text-(--color-dim)">修正指示（履歴に残る。例:「院長先生の希望で緑基調に」「猫専用待合室を強調」）
                <input name="instruction" placeholder="今回の変更内容・面談中の要望" className={inputCls} />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button className={btnCls}>{latestDemo ? `デモを再生成（v${latestDemo.version + 1}）` : "デモを生成"}</button>
                <span className="text-xs text-(--color-dim)">生成は即時（数秒）。面談中のその場修正にも使えます。</span>
              </div>
            </div>
          </form>
        </details>
      </section>

      {/* 見積 */}
      <section className={`${cardCls} mt-6`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">見積（プラン＋オプション）</h2>
          <Link href="/settings" className="text-xs text-(--color-accent) hover:underline">料金・オプションの設定 →</Link>
        </div>

        {(quotes ?? []).length > 0 && (
          <div className="mb-4 space-y-2">
            {(quotes ?? []).map((qq) => (
              <div key={qq.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-(--color-panel-2) px-3 py-2 text-sm">
                <span>
                  <b>{qq.quote_no}</b>（v{qq.version}）
                  <span className="ml-2 text-xs text-(--color-dim)">
                    初期 {Number(qq.total_build).toLocaleString()}円 ／ 月額 {Number(qq.total_monthly).toLocaleString()}円（税込）・{String(qq.issue_date)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/q/${qq.id}`} className={`${btnCls} px-3 py-1.5`}>見積書を開く（印刷）</Link>
                  {qq.status !== "sent" && (
                    <form action={setQuoteStatus.bind(null, qq.id, id, "sent")}>
                      <button className="text-xs text-(--color-dim) hover:text-(--color-txt)">提出済みにする</button>
                    </form>
                  )}
                  {qq.status === "sent" && <span className="text-xs text-(--color-ok)">提出済み</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        <details open={(quotes ?? []).length === 0}>
          <summary className="cursor-pointer text-sm font-medium text-(--color-accent)">
            {(quotes ?? []).length ? "新しい見積を作る（面談中の条件変更もここで）" : "見積を作成する"}
          </summary>
          <div className="mt-3">
            <QuoteBuilder
              action={createQuote.bind(null, id)}
              plans={(plans ?? []).filter((pl) => pl.active !== false) as PlanRow[]}
              options={(options ?? []) as OptionRow[]}
              taxRate={Number(qsettings?.tax_rate ?? 0.1)}
              validDays={Number(qsettings?.valid_days ?? 30)}
              defaultPlanKey={p.suggested_plan_key}
              defaultSelected={lastSelected}
            />
          </div>
        </details>
      </section>

      {/* 営業ドキュメント */}
      <section className={`${cardCls} mt-6`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">営業ドキュメント（提案書・トーク・メール・見積）</h2>
          <form action={generateDocs.bind(null, id)}>
            <button className={btnCls}>一括生成{(docs ?? []).length > 0 ? "（最新の分析・デモで作り直す）" : ""}</button>
          </form>
        </div>
        {(docs ?? []).length === 0 ? (
          <p className="text-sm text-(--color-dim)">未生成。「一括生成」で提案書・電話/訪問トーク・メール・お礼メール5種・見積書案を作成します（分析欄が埋まっているほど内容が具体化します）。</p>
        ) : (
          <div className="space-y-2">
            {(docs ?? []).map((d) => (
              <details key={d.id} className="rounded-lg border border-(--color-line)">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                  {DOC_LABELS[d.kind] ?? d.kind} <span className="ml-2 text-xs text-(--color-dim)">{String(d.created_at).slice(0, 10)}</span>
                </summary>
                <pre className="overflow-x-auto whitespace-pre-wrap border-t border-(--color-line) bg-(--color-panel-2) p-4 text-xs leading-relaxed">{d.content}</pre>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* 営業履歴・次回アクション */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={cardCls}>
          <h2 className="mb-3 font-semibold">活動を記録</h2>
          <form action={act} className="grid gap-2 text-sm">
            <select name="kind" className={inputCls} defaultValue="call">
              {Object.entries(ACT_LABELS).filter(([k]) => k !== "status" && k !== "directive").map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <textarea name="content" rows={3} placeholder="内容（例: 受付の方対応。院長は木曜午後が手すき。折り返し依頼済み）" className={inputCls} required />
            <label className="text-xs text-(--color-dim)">次回連絡日
              <input name="next_contact_on" type="date" className={inputCls} />
            </label>
            <button className={`${btnCls} w-fit`}>記録する</button>
          </form>

          <h3 className="mb-2 mt-5 text-sm font-semibold">次のアクション（AI提案はGENESISが更新）</h3>
          <form action={upd} className="flex gap-2">
            <input name="next_action" defaultValue={p.next_action ?? ""} placeholder="例: 木曜14時に電話→院長へ" className={inputCls} />
            <button className={btnCls}>保存</button>
          </form>
        </section>

        <section className={cardCls}>
          <h2 className="mb-3 font-semibold">営業履歴</h2>
          <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
            {(acts ?? []).map((a) => (
              <li key={a.id} className="border-b border-(--color-line) pb-2">
                <span className="mr-2 rounded bg-(--color-panel-2) px-1.5 py-0.5 text-xs">{ACT_LABELS[a.kind] ?? a.kind}</span>
                {a.content}
                <span className="ml-2 text-xs text-(--color-dim)">{String(a.created_at).slice(0, 16).replace("T", " ")}・{a.created_by ?? ""}</span>
              </li>
            ))}
            {(acts ?? []).length === 0 && <li className="text-(--color-dim)">履歴なし</li>}
          </ul>
        </section>
      </div>

      {/* 成約 → 正式制作へ */}
      <section className={`${cardCls} mt-6 ${project ? "border-(--color-ok)" : ""}`}>
        <h2 className="mb-2 font-semibold">成約 → 正式制作へ移行</h2>
        {project ? (
          <>
            <p className="text-sm text-(--color-ok)">
              ✅ 正式制作案件へ移行済み（{String(project.created_at).slice(0, 10)}・プラン: {project.plan_key}・状態: {project.status}）。
              顧客情報・分析・デモ・要望・見積は dms_projects.handover に引き継ぎ済み。制作タスクはWEB DEVELOPMENT側で開始できます。
            </p>
            <form action={revertToNegotiation.bind(null, id)} className="mt-3">
              <button className="text-xs text-(--color-dim) underline hover:text-(--color-danger)">
                間違えて押した場合 — 成約を取り消して商談中に戻す（正式制作案件は取り下げ・再成約で復活）
              </button>
            </form>
          </>
        ) : (
          <>
            <form action={transferToProject.bind(null, id)} className="flex items-center gap-3">
              <button className={`${btnCls} bg-(--color-ok)`}>成約 — 正式制作案件を作成</button>
              <p className="text-xs text-(--color-dim)">顧客情報・現サイト分析・デモ・営業履歴・見積を再入力なしで引き継ぎます。</p>
            </form>
            {["won", "transferred"].includes(p.status) && (
              <form action={revertToNegotiation.bind(null, id)} className="mt-3">
                <button className="text-xs text-(--color-dim) underline hover:text-(--color-danger)">
                  間違えて成約にした場合 — 商談中に戻す
                </button>
              </form>
            )}
          </>
        )}
        {p.status === "lost" && (
          <form action={upd} className="mt-3 flex items-center gap-2">
            <select name="lost_reason" defaultValue={p.lost_reason ?? ""} className={inputCls}>
              <option value="">失注理由を選択…</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button className={btnCls}>保存</button>
          </form>
        )}
      </section>
    </main>
  );
}
