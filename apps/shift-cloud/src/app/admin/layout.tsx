import { requireActor, can, type Permission } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import { redirect } from "next/navigation";

const MENU: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin/staff", label: "スタッフ", perm: "manage_staff" },
  { href: "/admin/stores", label: "店舗", perm: "manage_org" },
  { href: "/admin/brands", label: "ブランド", perm: "manage_org" },
  { href: "/admin/company", label: "会社設定", perm: "manage_company" },
  { href: "/admin/templates", label: "シフトテンプレート", perm: "manage_templates" },
  { href: "/admin/schedule-types", label: "予定種別", perm: "manage_templates" },
  { href: "/admin/shifts", label: "シフト作成", perm: "create_shifts" },
  { href: "/admin/attendance", label: "勤怠管理", perm: "edit_attendance" },
  { href: "/admin/reconciliation", label: "月末照合", perm: "edit_attendance" },
  { href: "/admin/payroll", label: "給与", perm: "view_payroll" },
  { href: "/admin/announcements", label: "お知らせ", perm: "manage_announcements" },
  { href: "/admin/events", label: "店舗イベント", perm: "manage_announcements" },
  { href: "/admin/kiosks", label: "打刻端末", perm: "manage_kiosks" },
  { href: "/admin/audit-logs", label: "監査ログ", perm: "view_audit" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const items = MENU.filter((m) => can(actor, m.perm));
  if (items.length === 0) redirect("/home");
  return (
    <div className="min-h-screen">
      <AdminSidebar items={items} name={actor.name} hq={!!actor.permissions.view_hq} />
      <main className="ml-52 p-8">{children}</main>
    </div>
  );
}
