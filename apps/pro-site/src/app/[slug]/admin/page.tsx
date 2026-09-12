import Link from "next/link";
import { getPro, countUnreadInquiries } from "@/lib/data";
import { requireProAdmin } from "@/lib/auth";

const MENU = [
  { href: "/inquiries", title: "お問い合わせ", desc: "HPに出す連絡先（メール・LINE・電話）の設定と、届いた控え" },
  { href: "/news", title: "ニュースを書く", desc: "お知らせ・メディア出演情報の追加と編集" },
  { href: "/tournaments", title: "試合日程・成績", desc: "出場予定の登録、試合後の結果入力" },
  { href: "/instagram", title: "Instagram", desc: "投稿のリンクを貼るだけでHPに表示" },
  { href: "/profile", title: "プロフィール", desc: "基本情報・経歴文・SNS・ランキング" },
  { href: "/career", title: "主な戦歴", desc: "年度別の戦績表" },
  { href: "/clubs", title: "クラブセッティング", desc: "使用クラブの一覧" },
  { href: "/sponsors", title: "スポンサー", desc: "バナー画像のアップロードと表示管理" },
  { href: "/settings", title: "設定", desc: "パスワードの変更" },
];

export default async function AdminHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // 未読数は個人情報ではないが、ログイン前の描画では数えない
  const [pro, authed] = await Promise.all([getPro(slug), requireProAdmin(slug)]);
  const unread = pro && authed ? await countUnreadInquiries(pro.id) : 0;
  return (
    <div>
      <p className="mb-4 text-sm text-(--color-dim)">編集したい項目を選んでください。保存するとすぐHPに反映されます。</p>
      <div className="space-y-3">
        {MENU.map((m) => (
          <Link key={m.href} href={`/${slug}/admin${m.href}`} className="block rounded-xl border border-(--color-line) bg-white p-4 active:bg-(--color-panel)">
            <p className="font-black">
              {m.title}
              {m.href === "/inquiries" && unread > 0 ? (
                <span className="ml-2 rounded-full bg-(--color-danger) px-2 py-0.5 align-middle text-xs text-white">未読 {unread}</span>
              ) : null}
              <span className="float-right text-(--color-gold)">→</span>
            </p>
            <p className="mt-1 text-xs text-(--color-dim)">{m.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
