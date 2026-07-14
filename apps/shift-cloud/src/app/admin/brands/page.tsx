import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Table, Td, Card, Button, Input, Label, Empty } from "@/components/ui";

export default async function BrandsPage() {
  const actor = await requireActor("manage_org");
  const admin = createAdmin();
  const { data: brands } = await admin
    .from("brands")
    .select("*, stores(count)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("name");

  async function saveBrand(formData: FormData) {
    "use server";
    const a = await requireActor("manage_org");
    const ad = createAdmin();
    const name = String(formData.get("name"));
    const { data } = await ad.from("brands").insert({ company_id: a.companyId, name }).select("id").single();
    await logAudit(a, "brand.create", "brands", data?.id ?? null, null, { name });
    revalidatePath("/admin/brands");
  }

  async function removeBrand(formData: FormData) {
    "use server";
    const a = await requireActor("manage_org");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("brands").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "brand.delete", "brands", id);
    revalidatePath("/admin/brands");
  }

  return (
    <>
      <PageTitle>ブランド管理</PageTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!brands?.length ? (
            <Empty>ブランドがありません</Empty>
          ) : (
            <Table headers={["ブランド名", "店舗数", ""]}>
              {brands.map((b) => (
                <tr key={b.id} className="hover:bg-zinc-50">
                  <Td className="font-medium">{b.name}</Td>
                  <Td>{(b.stores as unknown as { count: number }[])?.[0]?.count ?? 0}</Td>
                  <Td>
                    <form action={removeBrand}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">削除</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">ブランドを追加</p>
          <form action={saveBrand} className="space-y-3">
            <div>
              <Label>ブランド名</Label>
              <Input name="name" required placeholder="例: KALLINOS" />
            </div>
            <Button type="submit" className="w-full">追加</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
