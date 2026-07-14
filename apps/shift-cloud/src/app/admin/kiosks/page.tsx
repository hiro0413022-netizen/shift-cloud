import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageTitle, Table, Td, Card, Button, Input, Label, Select, Empty, Badge } from "@/components/ui";
import { createHash, randomBytes } from "crypto";

export default async function KiosksPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const actor = await requireActor("manage_kiosks");
  const admin = createAdmin();
  const sp = await searchParams;

  const [{ data: devices }, { data: stores }] = await Promise.all([
    admin.from("kiosk_devices").select("*, stores(name)").eq("company_id", actor.companyId).is("deleted_at", null).order("created_at"),
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
  ]);

  async function register(formData: FormData) {
    "use server";
    const a = await requireActor("manage_kiosks");
    const ad = createAdmin();
    const token = randomBytes(24).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const row = { store_id: String(formData.get("store_id")), name: String(formData.get("name")) };
    const { data } = await ad.from("kiosk_devices")
      .insert({ ...row, company_id: a.companyId, token_hash: hash })
      .select("id").single();
    await logAudit(a, "kiosk.register", "kiosk_devices", data?.id ?? null, null, row);
    revalidatePath("/admin/kiosks");
    redirect(`/admin/kiosks?token=${token}`);
  }

  async function remove(formData: FormData) {
    "use server";
    const a = await requireActor("manage_kiosks");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("kiosk_devices").update({ deleted_at: new Date().toISOString(), status: "revoked" }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "kiosk.revoke", "kiosk_devices", id);
    revalidatePath("/admin/kiosks");
  }

  return (
    <>
      <PageTitle>打刻端末（iPad）</PageTitle>

      {sp.token && (
        <Card className="mb-4 border-brand bg-brand-light/40">
          <p className="text-sm font-medium">端末を登録しました。iPadで以下のURLを開いてください（この画面でのみ表示されます）:</p>
          <p className="mt-2 break-all rounded bg-white p-3 font-mono text-sm">/kiosk/{sp.token}</p>
          <p className="mt-2 text-xs text-zinc-500">本番URL例: https://あなたのドメイン/kiosk/{sp.token}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!devices?.length ? (
            <Empty>端末が登録されていません</Empty>
          ) : (
            <Table headers={["端末名", "店舗", "状態", "登録日", ""]}>
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-50">
                  <Td className="font-medium">{d.name}</Td>
                  <Td>{(d.stores as unknown as { name: string } | null)?.name}</Td>
                  <Td><Badge color={d.status === "active" ? "green" : "zinc"}>{d.status === "active" ? "有効" : "無効"}</Badge></Td>
                  <Td className="text-zinc-500">{d.created_at.slice(0, 10)}</Td>
                  <Td>
                    <form action={remove}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">無効化</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">端末を登録</p>
          <form action={register} className="space-y-3">
            <div>
              <Label>店舗</Label>
              <Select name="store_id" required>
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>端末名</Label>
              <Input name="name" required placeholder="例: 宝塚 入口iPad" />
            </div>
            <Button type="submit" className="w-full">登録してURLを発行</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
