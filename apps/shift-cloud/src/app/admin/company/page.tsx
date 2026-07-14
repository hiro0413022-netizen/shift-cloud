import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Card, Button, Input, Label, Select } from "@/components/ui";

export default async function CompanyPage() {
  const actor = await requireActor("manage_company");
  const admin = createAdmin();
  const { data: company } = await admin.from("companies").select("*").eq("id", actor.companyId).single();
  const settings = (company?.settings ?? {}) as unknown as { rounding_minutes?: number; overtime_rate?: number };

  async function saveCompany(formData: FormData) {
    "use server";
    const a = await requireActor("manage_company");
    const ad = createAdmin();
    const { data: before } = await ad.from("companies").select("*").eq("id", a.companyId).single();
    const update = {
      name: String(formData.get("name")),
      settings: {
        rounding_minutes: Number(formData.get("rounding_minutes")),
        overtime_rate: Number(formData.get("overtime_rate")),
      },
    };
    await ad.from("companies").update(update).eq("id", a.companyId);
    await logAudit(a, "company.update", "companies", a.companyId, before, update);
    revalidatePath("/admin/company");
  }

  return (
    <>
      <PageTitle>会社設定</PageTitle>
      <Card className="max-w-lg">
        <form action={saveCompany} className="space-y-4">
          <div>
            <Label>会社名</Label>
            <Input name="name" defaultValue={company?.name} required />
          </div>
          <div>
            <Label>勤怠の丸め単位（給与計算時）</Label>
            <Select name="rounding_minutes" defaultValue={String(settings.rounding_minutes ?? 0)}>
              <option value="0">丸めなし（1分単位）</option>
              <option value="5">5分単位</option>
              <option value="10">10分単位</option>
              <option value="15">15分単位</option>
              <option value="30">30分単位</option>
            </Select>
          </div>
          <div>
            <Label>残業割増率</Label>
            <Input name="overtime_rate" type="number" step="0.01" min="1" defaultValue={settings.overtime_rate ?? 1.25} />
          </div>
          <Button type="submit">保存</Button>
        </form>
      </Card>
    </>
  );
}
