import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Table, Td, Card, Button, Input, Label, Empty, Badge } from "@/components/ui";
import { hm } from "@/lib/util";

export default async function TemplatesPage() {
  const actor = await requireActor("manage_templates");
  const admin = createAdmin();
  const { data: templates } = await admin
    .from("shift_templates")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("sort_order");

  async function saveTemplate(formData: FormData) {
    "use server";
    const a = await requireActor("manage_templates");
    const ad = createAdmin();
    const isDayOff = formData.get("is_day_off") === "on";
    const row = {
      name: String(formData.get("name")),
      start_time: isDayOff ? null : String(formData.get("start_time") || "") || null,
      end_time: isDayOff ? null : String(formData.get("end_time") || "") || null,
      is_day_off: isDayOff,
      color: String(formData.get("color") || "#0F6B4F"),
      sort_order: Number(formData.get("sort_order") || 0),
    };
    const { data } = await ad.from("shift_templates").insert({ ...row, company_id: a.companyId }).select("id").single();
    await logAudit(a, "template.create", "shift_templates", data?.id ?? null, null, row);
    revalidatePath("/admin/templates");
  }

  async function removeTemplate(formData: FormData) {
    "use server";
    const a = await requireActor("manage_templates");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("shift_templates").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "template.delete", "shift_templates", id);
    revalidatePath("/admin/templates");
  }

  return (
    <>
      <PageTitle>シフトテンプレート</PageTitle>
      <p className="mb-4 -mt-4 text-sm text-zinc-500">スタッフはこのテンプレートをワンタップで選んでシフト希望を提出します。</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!templates?.length ? (
            <Empty>テンプレートがありません</Empty>
          ) : (
            <Table headers={["名前", "時間", "種別", "並び順", ""]}>
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <Td className="font-medium">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: t.color }} />
                    {t.name}
                  </Td>
                  <Td>{t.is_day_off ? "—" : t.start_time ? `${hm(t.start_time)}〜${hm(t.end_time)}` : "時間指定なし"}</Td>
                  <Td>{t.is_day_off ? <Badge color="zinc">休み</Badge> : <Badge color="green">勤務</Badge>}</Td>
                  <Td>{t.sort_order}</Td>
                  <Td>
                    <form action={removeTemplate}>
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
          <p className="mb-4 text-sm font-medium">テンプレートを追加</p>
          <form action={saveTemplate} className="space-y-3">
            <div>
              <Label>名前</Label>
              <Input name="name" required placeholder="例: 早番" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>開始</Label>
                <Input name="start_time" type="time" />
              </div>
              <div>
                <Label>終了</Label>
                <Input name="end_time" type="time" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input type="checkbox" name="is_day_off" /> 休み希望用テンプレート
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>色</Label>
                <Input name="color" type="color" defaultValue="#0F6B4F" className="h-9 p-1" />
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
