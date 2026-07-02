import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Table, Td, Card, Button, Input, Label, Select, Empty } from "@/components/ui";
import { hm } from "@/lib/util";

export default async function StoresPage() {
  const actor = await requireActor("manage_org");
  const admin = createAdmin();
  const [{ data: stores }, { data: brands }] = await Promise.all([
    admin.from("stores").select("*, brands(name)").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("brands").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
  ]);

  async function saveStore(formData: FormData) {
    "use server";
    const a = await requireActor("manage_org");
    const ad = createAdmin();
    const id = String(formData.get("id") || "");
    const row = {
      brand_id: String(formData.get("brand_id")),
      name: String(formData.get("name")),
      code: String(formData.get("code") || ""),
      open_time: String(formData.get("open_time") || "") || null,
      close_time: String(formData.get("close_time") || "") || null,
    };
    if (id) {
      await ad.from("stores").update(row).eq("id", id).eq("company_id", a.companyId);
      await logAudit(a, "store.update", "stores", id, null, row);
    } else {
      const { data } = await ad.from("stores").insert({ ...row, company_id: a.companyId }).select("id").single();
      await logAudit(a, "store.create", "stores", data?.id ?? null, null, row);
    }
    revalidatePath("/admin/stores");
  }

  async function removeStore(formData: FormData) {
    "use server";
    const a = await requireActor("manage_org");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("stores").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "store.delete", "stores", id);
    revalidatePath("/admin/stores");
  }

  return (
    <>
      <PageTitle>店舗管理</PageTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!stores?.length ? (
            <Empty>店舗がありません</Empty>
          ) : (
            <Table headers={["店舗名", "ブランド", "コード", "営業時間", ""]}>
              {stores.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <Td className="font-medium">{s.name}</Td>
                  <Td>{(s.brands as unknown as { name: string } | null)?.name}</Td>
                  <Td>{s.code}</Td>
                  <Td>{hm(s.open_time)}〜{hm(s.close_time)}</Td>
                  <Td>
                    <form action={removeStore}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">削除</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">店舗を追加</p>
          <form action={saveStore} className="space-y-3">
            <div>
              <Label>ブランド</Label>
              <Select name="brand_id" required>
                {brands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>店舗名</Label>
              <Input name="name" required placeholder="GOLF WING ○○" />
            </div>
            <div>
              <Label>コード</Label>
              <Input name="code" placeholder="例: umeda" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>開店</Label>
                <Input name="open_time" type="time" defaultValue="10:00" />
              </div>
              <div>
                <Label>閉店</Label>
                <Input name="close_time" type="time" defaultValue="21:00" />
              </div>
            </div>
            <Button type="submit" className="w-full">追加</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
