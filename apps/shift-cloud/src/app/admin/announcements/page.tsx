import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Table, Td, Card, Button, Input, Label, Textarea, Empty } from "@/components/ui";

export default async function AnnouncementsPage() {
  const actor = await requireActor("manage_announcements");
  const admin = createAdmin();
  const { data: list } = await admin
    .from("announcements")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  async function save(formData: FormData) {
    "use server";
    const a = await requireActor("manage_announcements");
    const ad = createAdmin();
    const row = {
      title: String(formData.get("title")),
      body: String(formData.get("body") || ""),
      publish_from: String(formData.get("publish_from") || "") || null,
      publish_to: String(formData.get("publish_to") || "") || null,
      created_by: a.staffId,
    };
    const { data } = await ad.from("announcements").insert({ ...row, company_id: a.companyId }).select("id").single();
    await logAudit(a, "announcement.create", "announcements", data?.id ?? null, null, row);
    revalidatePath("/admin/announcements");
  }

  async function remove(formData: FormData) {
    "use server";
    const a = await requireActor("manage_announcements");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("announcements").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "announcement.delete", "announcements", id);
    revalidatePath("/admin/announcements");
  }

  return (
    <>
      <PageTitle>お知らせ管理</PageTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!list?.length ? (
            <Empty>お知らせがありません</Empty>
          ) : (
            <Table headers={["タイトル", "掲載期間", ""]}>
              {list.map((n) => (
                <tr key={n.id} className="hover:bg-zinc-50">
                  <Td className="font-medium">{n.title}<p className="mt-0.5 max-w-md truncate text-xs font-normal text-zinc-400">{n.body}</p></Td>
                  <Td className="whitespace-nowrap text-zinc-500">{n.publish_from ?? "即時"} 〜 {n.publish_to ?? "無期限"}</Td>
                  <Td>
                    <form action={remove}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">削除</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">お知らせを作成</p>
          <form action={save} className="space-y-3">
            <div>
              <Label>タイトル</Label>
              <Input name="title" required />
            </div>
            <div>
              <Label>本文</Label>
              <Textarea name="body" rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>掲載開始</Label>
                <Input name="publish_from" type="date" />
              </div>
              <div>
                <Label>掲載終了</Label>
                <Input name="publish_to" type="date" />
              </div>
            </div>
            <Button type="submit" className="w-full">作成</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
