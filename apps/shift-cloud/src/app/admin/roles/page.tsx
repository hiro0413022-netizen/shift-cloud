import { requireActor, isOwner } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageTitle, Card, Button, Input, Empty, Badge } from "@/components/ui";
import { PERMISSION_GROUPS, PERMISSION_LABEL, ALL_PERMISSION_KEYS } from "@/lib/permissions";

/**
 * ロール・権限（2026-08-22 / DECISIONS #142）
 *
 * これまで roles.permissions を編集する画面がどのアプリにも無く、
 * 「◯◯さんにレッスン権限を付けたい」たびにDBを直接更新していた（実際 #141 でそうなった）。
 * 警告を出すだけでその場で直せない画面は作らない、というルール（#122）に反していたので画面にする。
 *
 * 設計:
 *  - オーナー（manage_company）限定。権限は会社全体に効くので店舗スコープの概念が無い
 *  - ロールに権限を足すと**そのロールを持つ全員**に効く。誰に効くのかを同じ画面に出す
 *  - 同名ロールが実在する（「コーチング（店舗）」が2つ）。名前ではなく必ずIDで更新し、重複は画面で警告する
 *  - 締め出し防止: manage_company を持つロールをゼロにできない／自分のロールからは外せない
 *  - read_only は他の権限を全部無効化する特殊な値なので、併用は拒否する
 */

type RoleRow = {
  id: string;
  name: string;
  is_system: boolean;
  permissions: Record<string, boolean> | null;
};

type Member = { role_id: string; name: string };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ err?: string; msg?: string }> }) {
  const actor = await requireActor("manage_company");
  if (!isOwner(actor)) redirect("/admin/staff");
  const sp = await searchParams;
  const admin = createAdmin();

  const { data: roleData } = await admin
    .from("roles")
    .select("id, name, is_system, permissions")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("name");
  const roles = (roleData ?? []) as RoleRow[];

  // 自社のロールに限る（staff_roles を会社で絞れないので role_id で絞る）
  const roleIds = roles.map((r) => r.id);
  const { data: memberData } = roleIds.length
    ? await admin
        .from("staff_roles")
        .select("role_id, staff!inner(name, status, deleted_at)")
        .in("role_id", roleIds)
        .is("deleted_at", null)
    : { data: [] };
  const members: Member[] = ((memberData ?? []) as unknown as Array<{
    role_id: string;
    staff: { name: string; status: string; deleted_at: string | null } | null;
  }>)
    .filter((m) => m.staff && !m.staff.deleted_at && m.staff.status === "active")
    .map((m) => ({ role_id: m.role_id, name: m.staff!.name }));

  const byRole = new Map<string, string[]>();
  for (const m of members) byRole.set(m.role_id, [...(byRole.get(m.role_id) ?? []), m.name]);

  // 同名ロールの検出（名前だけで判断すると別テナント・別用途のロールを触ってしまう）
  const nameCount = new Map<string, number>();
  for (const r of roles) nameCount.set(r.name, (nameCount.get(r.name) ?? 0) + 1);

  // 自分がどのロールでオーナーになっているか（自分の足元を外させないため）
  const myRoleIds = new Set(
    (
      ((
        await admin.from("staff_roles").select("role_id").eq("staff_id", actor.staffId).is("deleted_at", null)
      ).data ?? []) as Array<{ role_id: string }>
    ).map((r) => r.role_id)
  );

  async function saveRole(formData: FormData) {
    "use server";
    const a = await requireActor("manage_company");
    if (!isOwner(a)) redirect("/admin/staff");
    const ad = createAdmin();
    const id = String(formData.get("id") || "");
    if (!id) redirect("/admin/roles?err=" + encodeURIComponent("ロールが指定されていません"));

    const { data: cur } = await ad
      .from("roles")
      .select("id, name, permissions")
      .eq("id", id)
      .eq("company_id", a.companyId)
      .is("deleted_at", null)
      .maybeSingle();
    const role = cur as { id: string; name: string; permissions: Record<string, boolean> | null } | null;
    if (!role) redirect("/admin/roles?err=" + encodeURIComponent("ロールが見つかりません"));

    // チェックが入ったものだけ true で持つ（false を並べない＝JSONを読みやすく保つ）
    const next: Record<string, boolean> = {};
    // カタログ（lib/permissions.ts）に未登録のキーは画面に出ていない＝チェックの有無で判断できない。
    // 新しいアプリが先に権限を使い始めた場合に黙って消さないよう、そのまま持ち越す。
    for (const [k, v] of Object.entries(role!.permissions ?? {})) {
      if (v && !ALL_PERMISSION_KEYS.includes(k)) next[k] = true;
    }
    for (const key of ALL_PERMISSION_KEYS) if (formData.get(`p_${key}`) === "on") next[key] = true;

    // (1) read_only は全部を無効化する特殊値。他と混ぜると「権限があるのに何もできない」になる
    if (next.read_only && Object.keys(next).length > 1) {
      redirect("/admin/roles?err=" + encodeURIComponent("「閲覧のみ」は他の権限と同時に持てません（他を全部外すか、閲覧のみを外してください）"));
    }

    const hadOwner = !!role!.permissions?.manage_company;
    // (2) 自分の足元を外さない
    const { data: mine } = await ad
      .from("staff_roles")
      .select("role_id")
      .eq("staff_id", a.staffId)
      .is("deleted_at", null);
    const isMyRole = ((mine ?? []) as Array<{ role_id: string }>).some((r) => r.role_id === id);
    if (hadOwner && !next.manage_company && isMyRole) {
      redirect("/admin/roles?err=" + encodeURIComponent("自分が入っているロールから「会社オーナー」は外せません（自分を締め出すため）"));
    }

    // (3) 会社にオーナーが1人もいなくなる変更を止める
    if (hadOwner && !next.manage_company) {
      const { data: others } = await ad
        .from("roles")
        .select("id, permissions")
        .eq("company_id", a.companyId)
        .is("deleted_at", null)
        .neq("id", id);
      const stillOwner = ((others ?? []) as Array<{ id: string; permissions: Record<string, boolean> | null }>).some(
        (r) => r.permissions?.manage_company
      );
      if (!stillOwner) {
        redirect("/admin/roles?err=" + encodeURIComponent("「会社オーナー」を持つロールが無くなります。先に別のロールへ付けてください"));
      }
    }

    await ad.from("roles").update({ permissions: next, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "role.permissions.update", "roles", id, role!.permissions, next);
    revalidatePath("/admin/roles");
    redirect("/admin/roles?msg=" + encodeURIComponent(`「${role!.name}」の権限を保存しました`));
  }

  async function addRole(formData: FormData) {
    "use server";
    const a = await requireActor("manage_company");
    if (!isOwner(a)) redirect("/admin/staff");
    const ad = createAdmin();
    const name = String(formData.get("name") || "").trim().slice(0, 40);
    if (!name) redirect("/admin/roles?err=" + encodeURIComponent("ロール名を入れてください"));
    const { data: dup } = await ad
      .from("roles")
      .select("id")
      .eq("company_id", a.companyId)
      .eq("name", name)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (dup) {
      redirect("/admin/roles?err=" + encodeURIComponent(`「${name}」は既にあります。同名ロールは取り違えのもとなので別の名前にしてください`));
    }
    const { data: created } = await ad
      .from("roles")
      .insert({ company_id: a.companyId, name, permissions: {}, is_system: false })
      .select("id")
      .single();
    await logAudit(a, "role.create", "roles", created?.id ?? null, null, { name });
    revalidatePath("/admin/roles");
    redirect("/admin/roles?msg=" + encodeURIComponent(`「${name}」を追加しました。権限にチェックを入れて保存してください`));
  }

  async function removeRole(formData: FormData) {
    "use server";
    const a = await requireActor("manage_company");
    if (!isOwner(a)) redirect("/admin/staff");
    const ad = createAdmin();
    const id = String(formData.get("id") || "");
    const { data: cur } = await ad
      .from("roles")
      .select("id, name, is_system, permissions")
      .eq("id", id)
      .eq("company_id", a.companyId)
      .is("deleted_at", null)
      .maybeSingle();
    const role = cur as RoleRow | null;
    if (!role) redirect("/admin/roles?err=" + encodeURIComponent("ロールが見つかりません"));
    if (role!.is_system) redirect("/admin/roles?err=" + encodeURIComponent("システム標準のロールは削除できません"));

    const { count } = await ad
      .from("staff_roles")
      .select("staff_id", { count: "exact", head: true })
      .eq("role_id", id)
      .is("deleted_at", null);
    if ((count ?? 0) > 0) {
      redirect("/admin/roles?err=" + encodeURIComponent(`このロールは${count}人が使っています。先にスタッフ画面で別のロールに移してください`));
    }
    await ad.from("roles").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "role.delete", "roles", id, role!.permissions, null);
    revalidatePath("/admin/roles");
    redirect("/admin/roles?msg=" + encodeURIComponent(`「${role!.name}」を削除しました`));
  }

  return (
    <>
      <PageTitle>ロール・権限</PageTitle>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">ここを変えると、そのロールを持っている人 全員 に即座に効きます。</p>
        <p className="mt-1 text-amber-800">
          チェックを外すとその人たちは対象のアプリを開けなくなります。誰が入っているかは各ロールの「使っている人」で確認してください。
        </p>
      </div>

      {sp.err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.err}</p>}
      {sp.msg && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sp.msg}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {roles.length === 0 && <Empty>ロールがありません</Empty>}
          {roles.map((r) => {
            const perms = r.permissions ?? {};
            const people = byRole.get(r.id) ?? [];
            const dup = (nameCount.get(r.name) ?? 0) > 1;
            return (
              <Card key={r.id}>
                <form action={saveRole}>
                  <input type="hidden" name="id" value={r.id} />
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{r.name}</p>
                    {r.is_system && <Badge color="zinc">標準</Badge>}
                    {perms.manage_company && <Badge color="amber">オーナー</Badge>}
                    {myRoleIds.has(r.id) && <Badge color="blue">自分のロール</Badge>}
                    {dup && <Badge color="red">同名のロールが複数あります</Badge>}
                    <span className="ml-auto font-mono text-[10px] text-zinc-400">{r.id.slice(0, 8)}</span>
                  </div>

                  <p className="mb-3 text-xs text-zinc-500">
                    使っている人（{people.length}人）: {people.length ? people.join("、") : "まだ誰も使っていません"}
                  </p>

                  {PERMISSION_GROUPS.map((g) => (
                    <div key={g.title} className="mb-3">
                      <p className="mb-1.5 text-xs font-medium text-zinc-500">{g.title}</p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {g.keys.map((key) => (
                          <label key={key} className="flex items-start gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-zinc-50">
                            <input
                              type="checkbox"
                              name={`p_${key}`}
                              defaultChecked={!!perms[key]}
                              className="mt-1 h-4 w-4 accent-zinc-900"
                            />
                            <span className="min-w-0">
                              <span className="block leading-tight">{PERMISSION_LABEL[key].label}</span>
                              <span className="block text-[11px] leading-tight text-zinc-500">{PERMISSION_LABEL[key].note}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="mt-4 flex items-center gap-3 border-t border-zinc-100 pt-3">
                    <Button type="submit">この内容で保存</Button>
                    {!r.is_system && people.length === 0 && (
                      <span className="text-xs text-zinc-400">誰も使っていないロールです</span>
                    )}
                  </div>
                </form>

                {!r.is_system && people.length === 0 && (
                  <form action={removeRole} className="mt-2">
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-zinc-400 hover:text-red-600">このロールを削除する</button>
                  </form>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <p className="mb-3 text-sm font-medium">ロールを追加</p>
            <form action={addRole} className="space-y-3">
              <Input name="name" required placeholder="例: コーチ（レッスン専任）" />
              <Button type="submit" className="w-full">追加</Button>
            </form>
            <p className="mt-3 text-xs text-zinc-500">
              追加したあと権限にチェックを入れて保存し、スタッフ画面で割り当ててください。
            </p>
          </Card>

          <Card>
            <p className="mb-2 text-sm font-medium">覚えておくこと</p>
            <ul className="space-y-1.5 text-xs text-zinc-600">
              <li>・「閲覧のみ」は他の全権限を打ち消します。単独で使ってください</li>
              <li>・「会社オーナー」は全店舗を横断できる唯一の権限です。安易に配らないこと</li>
              <li>・「本部を見る」は経営数値が見えます。店舗スタッフには付けません</li>
              <li>・同名のロールは取り違えのもとです。作るときは違う名前にしてください</li>
              <li>・変更は監査ログ（/admin/audit-logs）に残ります</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
