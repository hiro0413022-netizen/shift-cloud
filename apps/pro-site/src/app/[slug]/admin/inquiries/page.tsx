import { notFound, redirect } from "next/navigation";
import { getPro, listInquiries } from "@/lib/data";
import { requireProAdmin } from "@/lib/auth";
import { createAdmin } from "@/lib/db";
import { inquiryKindLabel } from "@/lib/inquiry";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { deleteInquiryAction, saveContactMethodsAction } from "../actions";

export const dynamic = "force-dynamic";

function fmtJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function AdminInquiries({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; err?: string; deleted?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  // ⚠ 個人情報を扱う画面。layout のログイン判定は page の描画を止めないので、ここでも必ず確かめる
  if (!(await requireProAdmin(slug))) redirect(`/${slug}/admin`);

  const items = await listInquiries(pro.id);
  // 開いたら既読（未読数は管理メニューのバッジに出している）
  if (items.some((q) => !q.read_at)) {
    await createAdmin()
      .from("pgw_inquiries")
      .update({ read_at: new Date().toISOString() })
      .eq("pro_id", pro.id)
      .is("read_at", null)
      .is("deleted_at", null);
  }
  const open = Boolean(pro.contact_email || pro.contact_line_url || pro.contact_phone || (pro.contact_ig_dm && pro.instagram_username));

  return (
    <div>
      <AdminTitle
        slug={slug}
        title="お問い合わせ"
        hint="HPに出す連絡先の設定と、フォームから届いた控えの一覧です。"
      />
      <Msg ok={sp.ok} err={sp.err} />
      {sp.deleted ? <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-(--color-ok)">削除しました。</p> : null}

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-black">HPに出す連絡先</p>
          {open ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-(--color-ok)">受付中</span>
          ) : (
            <span className="rounded-full bg-(--color-panel) px-3 py-1 text-xs font-bold text-(--color-dim)">停止中</span>
          )}
        </div>
        <p className="mb-4 text-xs leading-6 text-(--color-dim)">
          入れたものだけがHPに出ます。お客様がボタンを押すと、その方のメールアプリ・LINE・電話が開いて<b>あなたに直接届きます</b>
          （このシステムからはメールを送りません）。全部空にすると「CONTACT」ごと非表示になります。
        </p>
        <form action={saveContactMethodsAction} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="mb-1 block text-xs font-bold">メールアドレス（HPに表示されます）</label>
            <input
              name="contact_email"
              type="email"
              inputMode="email"
              autoComplete="email"
              defaultValue={pro.contact_email ?? ""}
              placeholder="例: office@example.com"
              className="adm-input"
            />
            <p className="mt-1 text-[11px] leading-5 text-(--color-dim)">
              迷惑メールが届くことがあるので、普段使いとは別のアドレス（ご依頼専用）をおすすめします。
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">LINEの友だち追加URL</label>
            <input
              name="contact_line_url"
              type="url"
              defaultValue={pro.contact_line_url ?? ""}
              placeholder="https://lin.ee/xxxxxxx"
              className="adm-input"
            />
            <p className="mt-1 text-[11px] leading-5 text-(--color-dim)">
              LINEアプリ →「ホーム」→ 右上の人型＋ →「QRコード」→ 自分のQRの共有からURLをコピーできます（公式アカウントの場合は管理画面の友だち追加URL）。
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">電話番号（タップで発信されます）</label>
            <input
              name="contact_phone"
              type="tel"
              inputMode="tel"
              defaultValue={pro.contact_phone ?? ""}
              placeholder="例: 090-1234-5678"
              className="adm-input"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="contact_ig_dm" defaultChecked={pro.contact_ig_dm} className="h-4 w-4 accent-(--color-gold)" />
            InstagramのDMも窓口に出す
            {pro.instagram_username ? (
              <span className="text-xs font-normal text-(--color-dim)">（@{pro.instagram_username}）</span>
            ) : (
              <span className="text-xs font-normal text-(--color-danger)">※先に「プロフィール」でInstagram IDの登録が必要です</span>
            )}
          </label>
          <div>
            <label className="mb-1 block text-xs font-bold">ひとこと（任意・連絡先の上に出ます）</label>
            <input
              name="contact_note"
              defaultValue={pro.contact_note ?? ""}
              placeholder="例: 試合期間中はお返事が遅くなる場合がございます。"
              className="adm-input"
            />
          </div>
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">保存する</button>
        </form>
        {open ? (
          <a href={`/${slug}/contact`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold text-(--color-gold) underline underline-offset-4">
            HPのお問い合わせページを開く →
          </a>
        ) : null}
      </div>

      <p className="mb-1 text-sm font-bold">フォームから届いた控え（新しい順）</p>
      <p className="mb-3 text-xs leading-5 text-(--color-dim)">
        メールアプリが開かない方が使う入力欄です。<b>メールでの通知はしません</b>ので、ときどきこの画面をご確認ください。
      </p>
      <div className="space-y-3">
        {items.map((q) => {
          const replySubject = encodeURIComponent(`Re: お問い合わせの件（${pro.name} オフィシャルサイト）`);
          return (
            <div key={q.id} className="rounded-xl border border-(--color-line) bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                {!q.read_at ? <span className="rounded-sm bg-(--color-danger) px-1.5 py-0.5 font-bold text-white">NEW</span> : null}
                <span className="text-(--color-dim)">{fmtJst(q.created_at)}</span>
                <span className="rounded-sm border border-(--color-gold) px-2 py-0.5 text-(--color-gold)">{inquiryKindLabel(q.kind)}</span>
              </div>
              <p className="font-black">
                {q.name} 様{q.company ? <span className="ml-2 text-sm font-normal text-(--color-dim)">{q.company}</span> : null}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a href={`mailto:${q.email}?subject=${replySubject}`} className="text-(--color-gold) underline underline-offset-4">
                  {q.email}
                </a>
                {q.phone ? (
                  <a href={`tel:${q.phone}`} className="text-(--color-gold) underline underline-offset-4">
                    {q.phone}
                  </a>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-(--color-panel) p-3 text-sm leading-7">{q.message}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-(--color-dim)">メールアドレスを押すと、返信メールが書けます。</span>
                <form action={deleteInquiryAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="id" value={q.id} />
                  <DeleteButton />
                </form>
              </div>
            </div>
          );
        })}
        {items.length === 0 ? <p className="text-sm text-(--color-dim)">まだ届いていません。</p> : null}
      </div>
    </div>
  );
}
