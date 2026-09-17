import { requireActor, can, isOwner, type Permission } from "@/lib/auth";
import { AdminSidebar, type MenuGroup } from "@/components/admin-sidebar";
import { redirect } from "next/navigation";

/**
 * 管理メニュー（#252 で整理）。
 * group: null = いちばん上に常に出す「よく使う」。それ以外はグループ見出しの下にたたむ。
 * perm: null = 管理画面に入れる人なら誰でも（広報素材はスタッフ全員が使うため・#251）
 * ownerOnly: オーナー（manage_company）だけに見せる項目（#134）
 */
const MENU: { href: string; label: string; perm: Permission | null; group: MenuGroup | null; ownerOnly?: boolean }[] = [
  // よく使う（常に表示）
  { href: "/admin/shifts", label: "シフト作成", perm: "create_shifts", group: null },
  { href: "/admin/time-off", label: "休み希望", perm: "create_shifts", group: null },
  { href: "/admin/attendance", label: "勤怠管理", perm: "edit_attendance", group: null },
  // シフト
  { href: "/admin/help", label: "出勤募集", perm: "create_shifts", group: "シフト" },
  { href: "/admin/templates", label: "シフトテンプレート", perm: "manage_templates", group: "シフト" },
  { href: "/admin/schedule-types", label: "予定種別", perm: "manage_templates", group: "シフト" },
  // 勤怠・給与
  { href: "/admin/reconciliation", label: "月末照合", perm: "edit_attendance", group: "勤怠・給与" },
  { href: "/admin/kiosk-messages", label: "打刻端末メモ", perm: "edit_attendance", group: "勤怠・給与" },
  { href: "/admin/payroll", label: "給与", perm: "view_payroll", group: "勤怠・給与" },
  // スタッフ
  { href: "/admin/staff", label: "スタッフ", perm: "manage_staff", group: "スタッフ" },
  // ロールの権限は会社全体に効く（店舗の概念が無い）ためオーナー限定（#142）
  { href: "/admin/roles", label: "ロール・権限", perm: "manage_company", group: "スタッフ", ownerOnly: true },
  // お知らせ・広報
  { href: "/admin/announcements", label: "お知らせ", perm: "manage_announcements", group: "お知らせ・広報" },
  { href: "/admin/events", label: "店舗イベント", perm: "manage_announcements", group: "お知らせ・広報" },
  { href: "/admin/promo", label: "広報素材", perm: null, group: "お知らせ・広報" },
  // 設定
  { href: "/admin/stores", label: "店舗", perm: "manage_org", group: "設定" },
  { href: "/admin/brands", label: "ブランド", perm: "manage_org", group: "設定" },
  { href: "/admin/company", label: "会社設定", perm: "manage_company", group: "設定" },
  { href: "/admin/kiosks", label: "打刻端末", perm: "manage_kiosks", group: "設定" },
  // 監査ログは店舗次元を持たない＝部分的に見せると履歴が欠ける。オーナー限定（#134・ユーザー判断）
  { href: "/admin/audit-logs", label: "監査ログ", perm: "view_audit", group: "設定", ownerOnly: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const owner = isOwner(actor);
  const allowed = MENU.filter((m) => m.perm !== null && can(actor, m.perm) && (!m.ownerOnly || owner));
  // 権限つきの項目が1つも無い人は管理画面に入れない（誰でも見られる項目だけでは入口にしない）
  if (allowed.length === 0) redirect("/home");
  const items = MENU.filter((m) => (m.perm === null || can(actor, m.perm)) && (!m.ownerOnly || owner));
  return (
    <div className="min-h-screen">
      <AdminSidebar items={items.map(({ href, label, group }) => ({ href, label, group }))} name={actor.name} hq={!!actor.permissions.view_hq} />
      {/* スマホは上部バー＋全幅。PCは左サイドバーぶん空ける */}
      <main className="min-w-0 p-3 sm:p-4 md:ml-52 md:p-6 2xl:p-8">{children}</main>
    </div>
  );
}
