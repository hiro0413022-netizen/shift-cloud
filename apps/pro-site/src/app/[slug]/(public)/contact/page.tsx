import Link from "next/link";
import { notFound } from "next/navigation";
import { getPro, hasContactMethod } from "@/lib/data";
import { issueFormStamp } from "@/lib/auth";
import { isInquiryKind } from "@/lib/inquiry";
import ContactMethods from "./contact-methods";
import ContactForm from "./contact-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "CONTACT" };

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const kind = sp.type && isInquiryKind(sp.type) ? sp.type : "";

  return (
    <div>
      <section className="bg-(--color-ink) text-white">
        <div className="mx-auto max-w-3xl px-4 py-14 md:py-16">
          <p className="sec-title mb-1 text-xs uppercase text-(--color-gold-2)">Contact</p>
          <h1 className="text-3xl font-black tracking-wide md:text-4xl">お問い合わせ</h1>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
        {hasContactMethod(pro) ? (
          <>
            <p className="mb-6 text-[15px] leading-8">
              {pro.name}への取材・メディア出演のご依頼、スポンサー・協賛のご相談、レッスン・イベント出演のご依頼、応援メッセージなどは、下記よりご連絡ください。
            </p>
            {pro.contact_note ? (
              <p className="mb-8 rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3 text-sm leading-7">
                {pro.contact_note}
              </p>
            ) : null}

            <ContactMethods
              proName={pro.name}
              emailB64={pro.contact_email ? Buffer.from(pro.contact_email, "utf8").toString("base64") : null}
              lineUrl={pro.contact_line_url}
              instagram={pro.contact_ig_dm ? pro.instagram_username : null}
              phone={pro.contact_phone}
              initialKind={kind}
            />

            {/* メールアプリが開かない方のための控え。送信してもメールは飛ばず、本人の管理画面に残る */}
            <details className="mt-8 rounded-2xl border border-(--color-line) bg-white p-5">
              <summary className="cursor-pointer list-none font-bold">
                <span className="text-(--color-gold)">＋</span> メールアプリが使えない方は、この欄から送れます
              </summary>
              <p className="mt-3 mb-6 text-xs leading-6 text-(--color-dim)">
                送信内容は{pro.name}本人の管理画面に届きます。お返事はご入力のメールアドレス宛にいたします。
              </p>
              <ContactForm
                slug={pro.slug}
                stamp={issueFormStamp(pro.id)}
                initialKind={kind}
              />
            </details>

            <p className="mt-8 text-xs leading-6 text-(--color-dim)">
              いただいた内容は、お問い合わせへの回答およびご連絡のためにのみ利用し、法令に基づく場合を除き第三者へ提供いたしません。
              内容によってはご返信にお時間をいただく場合や、お返事を差し控える場合がございます。
            </p>
          </>
        ) : (
          <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) px-6 py-12 text-center">
            <p className="text-sm leading-7 text-(--color-dim)">現在、お問い合わせの受け付けを停止しています。</p>
            <Link href={`/${pro.slug}`} className="mt-6 inline-block text-sm font-bold text-(--color-gold) underline underline-offset-4">
              TOPへ戻る
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
