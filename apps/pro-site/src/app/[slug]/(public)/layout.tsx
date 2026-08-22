import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { getPro } from "@/lib/data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pro = await getPro(slug);
  if (!pro) return {};
  return {
    title: { default: `${pro.name} オフィシャルサイト`, template: `%s | ${pro.name} オフィシャルサイト` },
    description: `プロゴルファー ${pro.name} のオフィシャルサイト。最新ニュース・試合日程・成績・プロフィール。`,
  };
}

export default async function PublicLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await getPro(slug);
  if (!pro) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader slug={pro.slug} name={pro.name} nameEn={pro.name_en} />
      <main className="flex-1">{children}</main>
      <SiteFooter slug={pro.slug} name={pro.name} instagram={pro.instagram_username} x={pro.x_username} youtube={pro.youtube_url} />
    </div>
  );
}
