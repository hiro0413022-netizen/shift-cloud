import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { cardCls, inputCls, btnCls } from "@/components/ui";
import { ColorField, GalleryField, ImageField } from "@/components/demo-media";
import { INDUSTRIES, STATUSES, LOST_REASONS, HERO_STYLES, type IndustryKey, type StatusKey } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import { addActivity, generateDemo, generateDocs, setDemoAccess, transferToProject, updateProspect } from "@/app/actions";

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

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: p } = await admin.from("dms_prospects").select("*").eq("id", id).eq("company_id", actor.companyId).is("deleted_at", null).single();
  if (!p) notFound();

  const [{ data: demos }, { data: docs }, { data: acts }, { data: plans }, { data: project }] = await Promise.all([
    admin.from("dms_demos").select("*").eq("prospect_id", id).is("deleted_at", null).order("version", { ascending: false }),
    admin.from("dms_documents").select("*").eq("prospect_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("dms_activities").select("*").eq("prospect_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(30),
    admin.from("dms_plans").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort"),
    admin.from("dms_projects").select("*").eq("prospect_id", id).is("deleted_at", null).maybeSingle(),
  ]);

  const latestDemo = demos?.[0] ?? null;
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
              <a href={`/d/${latestDemo.token}`} target="_blank" className={btnCls}>デモを開く（v{latestDemo.version}）</a>
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

        <details open={!latestDemo}>
          <summary className="cursor-pointer text-sm font-medium text-(--color-accent)">
            {latestDemo ? "デモを修正して再生成（面談中の要望はここに入力）" : "デモを生成する"}
          </summary>
          <form action={gen} className="mt-3 grid gap-2 text-sm lg:grid-cols-2">
            <input type="hidden" name="mode" value={latestDemo ? "update" : "create"} />
            <input type="hidden" name="industry" value={p.industry} />
            <label className="text-xs text-(--color-dim)">院名（デモ表示名）
              <input name="clinicName" defaultValue={bstr("clinicName") || p.name} className={inputCls} />
            </label>
            <ColorField name="colorPrimary" initial={bstr("colorPrimary")} templateColor={tpl.palette.primary} />
            <label className="text-xs text-(--color-dim)">キャッチコピー（空=業種標準）
              <textarea name="tagline" defaultValue={bstr("tagline")} rows={2} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">導入文
              <textarea name="intro" defaultValue={bstr("intro")} rows={2} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">電話番号
              <input name="phone" defaultValue={bstr("phone") || (p.phone ?? "")} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">住所
              <input name="address" defaultValue={bstr("address") || (p.address ?? "")} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">交通アクセス
              <input name="access" defaultValue={bstr("access")} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">駐車場
              <input name="parking" defaultValue={bstr("parking")} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">診療時間表（1行=1段・セルは | 区切り。1行目=曜日ヘッダ）
              <textarea name="hours" rows={3} placeholder={"|月|火|水|木|金|土|日祝\n9:00〜12:00|●|●|●|●|●|●|休"} className={inputCls} defaultValue={Array.isArray(brief.hoursRows) ? (brief.hoursRows as string[][]).map((r) => r.join("|")).join("\n") : ""} />
            </label>
            <label className="text-xs text-(--color-dim)">休診日等の注記
              <input name="hoursNote" defaultValue={bstr("hoursNote")} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">診療・サービス（1行1件「名前: 説明」）
              <textarea name="services" rows={3} className={inputCls} defaultValue={Array.isArray(brief.services) ? (brief.services as { name: string; desc: string }[]).map((s) => `${s.name}: ${s.desc}`).join("\n") : ""} />
            </label>
            <label className="text-xs text-(--color-dim)">強み（1行1件）
              <textarea name="strengths" rows={3} className={inputCls} defaultValue={Array.isArray(brief.strengths) ? (brief.strengths as string[]).join("\n") : ""} />
            </label>
            <label className="text-xs text-(--color-dim)">初診案内（1行1件）
              <textarea name="firstVisit" rows={3} className={inputCls} defaultValue={Array.isArray(brief.firstVisit) ? (brief.firstVisit as string[]).join("\n") : ""} />
            </label>
            <label className="text-xs text-(--color-dim)">予約方法の説明
              <input name="reserveNote" defaultValue={bstr("reserveNote")} className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-(--color-dim)">院長肩書
                <input name="directorTitle" defaultValue={bstr("directorTitle") || "院長"} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim)">院長名
                <input name="directorName" defaultValue={bstr("directorName")} className={inputCls} />
              </label>
            </div>
            <label className="text-xs text-(--color-dim)">院長メッセージ
              <textarea name="directorMessage" defaultValue={bstr("directorMessage")} rows={2} className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-xs text-(--color-dim)">
              <input type="checkbox" name="webReserve" defaultChecked={brief.webReserve === true} />
              Web予約ボタンも見せる（電話中心なら外す）
            </label>
            <div className="lg:col-span-2 mt-2 grid gap-3 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 sm:grid-cols-2">
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
                hint="外観・待合室・スタッフ集合など。未設定なら業種カラーのグラデーション"
                initial={bstr("heroImage")}
              />
              <label className="text-xs text-(--color-dim)">ヒーロー写真の見せ方（写真がある時のみ）
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
                initial={bstr("directorImage")}
              />
              <GalleryField
                prospectId={id}
                name="gallery"
                initial={Array.isArray(brief.gallery) ? (brief.gallery as { url: string; caption?: string }[]) : []}
              />
            </div>
            <label className="text-xs text-(--color-dim) lg:col-span-2">修正指示（履歴に残る。例:「院長先生の希望で緑基調に」「猫専用待合室を強調」）
              <input name="instruction" placeholder="今回の変更内容・面談中の要望" className={inputCls} />
            </label>
            <button className={`${btnCls} w-fit lg:col-span-2`}>{latestDemo ? "デモを再生成（v" + (latestDemo.version + 1) + "）" : "デモを生成"}</button>
          </form>
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
          <p className="text-sm text-(--color-ok)">
            ✅ 正式制作案件へ移行済み（{String(project.created_at).slice(0, 10)}・プラン: {project.plan_key}・状態: {project.status}）。
            顧客情報・分析・デモ・要望・見積は dms_projects.handover に引き継ぎ済み。制作タスクはWEB DEVELOPMENT側で開始できます。
          </p>
        ) : (
          <form action={transferToProject.bind(null, id)} className="flex items-center gap-3">
            <button className={`${btnCls} bg-(--color-ok)`}>成約 — 正式制作案件を作成</button>
            <p className="text-xs text-(--color-dim)">顧客情報・現サイト分析・デモ・営業履歴・見積を再入力なしで引き継ぎます。</p>
          </form>
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
