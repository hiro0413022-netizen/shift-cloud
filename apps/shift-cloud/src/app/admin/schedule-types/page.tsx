import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Table, Td, Card, Button, Input, Label, Select, Empty, Badge } from "@/components/ui";

const CAT: Record<string, string> = { work: "勤務", leave: "休暇", other: "その他" };

export default async function ScheduleTypesPage() {
  const actor = await requireActor("manage_templates");
  const admin = createAdmin();
  const { data: types } = await admin
    .from("schedule_types")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("sort_order");

  async function saveType(formData: FormData) {
    "use server";
    const a = await requireActor("manage_templates");
    const ad = createAdmin();
    const row = {
      name: String(formData.get("name")),
      category: String(formData.get("category")),
      color: String(formData.get("color") || "#71717a"),
      sort_order: Number(formData.get("sort_order") || 0),
    };
    const { data } = await ad.from("schedule_types").insert({ ...row, company_id: a.companyId }).select("id").single();
    await logAudit(a, "schedule_type.create", "schedule_types", data?.id ?? null, null, row);
    revalidatePath("/admin/schedule-types");
  }

  async function removeType(formData: FormData) {
    "use server";
    const a = await requireActor("manage_templates");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("schedule_types").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "schedule_type.delete", "schedule_types", id);
    revalidatePath("/admin/schedule-types");
  }

  return (
    <>
      <PageTitle>予定種別</PageTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!types?.length ? (
            <Empty>予定種別がありません</Empty>
          ) : (
            <Table headers={["名前", "分類", "並び順", ""]}>
              {types.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <Td className="font-medium">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: t.color }} />
                    {t.name}
                  </Td>
                  <Td><Badge color={t.category === "leave" ? "amber" : "green"}>{CAT[t.category]}</Badge></Td>
                  <Td>{t.sort_order}</Td>
                  <Td>
                    <form action={removeType}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">削除</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">予定種別を追加</p>
          <form action={saveType} className="space-y-3">
            <div>
              <Label>名前</Label>
              <Input name="name" required placeholder="例: ラウンドレッスン" />
            </div>
            <div>
              <Label>分類</Label>
              <Select name="category" defaultValue="work">
                <option value="work">勤務</option>
                <option value="leave">休暇</option>
                <option value="other">その他</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>色</Label>
                <Input name="color" type="color" defaultValue="#71717a" className="h-9 p-1" />
              </div>
              <div>
                <Label>並び順</Label>
                <Input name="sort_order" type="number" defaultValue={0} />
              </div>
            </div>
            <Button type="submit" className="w-full">追加</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
