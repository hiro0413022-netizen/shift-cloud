import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Card, Button, Input, Label, Select, Empty, Badge } from "@/components/ui";
import { hm, dowJP, todayJST } from "@/lib/util";

export default async function HelpPage() {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();

  const [{ data: stores }, { data: helps }] = await Promise.all([
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("help_requests")
      .select("*, stores(name), help_applications(id, status, staff_id, staff(name))")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .gte("date", todayJST()).order("date"),
  ]);

  async function createHelp(formData: FormData) {
    "use server";
    const a = await requireActor("create_shifts");
    const ad = createAdmin();
    const row = {
      store_id: String(formData.get("store_id")),
      date: String(formData.get("date")),
      start_time: String(formData.get("start_time")),
      end_time: String(formData.get("end_time")),
      needed_count: Number(formData.get("needed_count") || 1),
      note: String(formData.get("note") || "") || null,
      created_by: a.staffId,
    };
    const { data } = await ad.from("help_requests").insert({ ...row, company_id: a.companyId }).select("id").single();

    // その店舗のスタッフに通知
    const { data: members } = await ad.from("staff_store_assignments")
      .select("staff_id").eq("store_id", row.store_id).is("deleted_at", null);
    if (members?.length) {
      await ad.from("notifications").insert(
        [...new Set(members.map((m) => m.staff_id))].map((sid) => ({
          company_id: a.companyId,
          staff_id: sid,
          kind: "help_request",
          title: `${row.date} 出勤できる方を募集しています`,
          body: `${row.start_time.slice(0, 5)}〜${row.end_time.slice(0, 5)} / ${row.needed_count}名。シフト提出画面から応募できます。`,
          link: "/requests",
        }))
      );
    }
    await logAudit(a, "help.create", "help_requests", data?.id ?? null, null, row);
    revalidatePath("/admin/help");
  }

  async function closeHelp(formData: FormData) {
    "use server";
    const a = await requireActor("create_shifts");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("help_requests").update({ status: "closed" }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "help.close", "help_requests", id);
    revalidatePath("/admin/help");
  }

  async function decideApplication(formData: FormData) {
    "use server";
    const a = await requireActor("create_shifts");
    const ad = createAdmin();
    const appId = String(formData.get("application_id"));
    const decision = String(formData.get("decision")); // accepted | rejected

    const { data: app } = await ad.from("help_applications")
      .select("id, staff_id, help_request_id, help_requests(store_id, date, start_time, end_time, needed_count)")
      .eq("id", appId).eq("company_id", a.companyId).single();
    if (!app) return;
    const hr = app.help_requests as unknown as { store_id: string; date: string; start_time: string; end_time: string; needed_count: number };

    await ad.from("help_applications")
      .update({ status: decision, decided_by: a.staffId, decided_at: new Date().toISOString() })
      .eq("id", appId);

    if (decision === "accepted") {
      // 確定シフトを作成
      await ad.from("shifts").upsert(
        {
          company_id: a.companyId,
          staff_id: app.staff_id,
          store_id: hr.store_id,
          date: hr.date,
          start_time: hr.start_time,
          end_time: hr.end_time,
          is_day_off: false,
          status: "published",
          published_at: new Date().toISOString(),
          note: "出勤募集より",
          deleted_at: null,
        },
        { onConflict: "staff_id,store_id,date" }
      );
      await ad.from("notifications").insert({
        company_id: a.companyId,
        staff_id: app.staff_id,
        kind: "help_accepted",
        title: `${hr.date} の出勤が確定しました`,
        body: `${hr.start_time.slice(0, 5)}〜${hr.end_time.slice(0, 5)} 応募ありがとうございます！`,
        link: "/shifts",
      });
      // 必要人数に達したら自動クローズ
      const { count } = await ad.from("help_applications")
        .select("id", { count: "exact", head: true })
        .eq("help_request_id", app.help_request_id).eq("status", "accepted");
      if ((count ?? 0) >= hr.needed_count) {
        await ad.from("help_requests").update({ status: "closed" }).eq("id", app.help_request_id);
      }
    }
    await logAudit(a, `help.${decision}`, "help_applications", appId, null, { staff_id: app.staff_id });
    revalidatePath("/admin/help");
  }

  return (
    <>
      <PageTitle>出勤募集</PageTitle>
      <p className="-mt-4 mb-4 text-sm text-zinc-500">人が足りない日時の出勤者を募集します。応募から採用するとシフトが確定し、本人に通知されます。</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {!helps?.length ? (
            <Empty>募集はありません</Empty>
          ) : (
            helps.map((h) => {
              const apps = (h.help_applications as unknown as { id: string; status: string; staff: { name: string } | null }[]) ?? [];
              const accepted = apps.filter((x) => x.status === "accepted").length;
              return (
                <Card key={h.id} className="!p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {h.date}（{dowJP(h.date)}） {hm(h.start_time)}〜{hm(h.end_time)}
                        <span className="ml-2 text-sm font-normal text-zinc-500">
                          {(h.stores as unknown as { name: string } | null)?.name}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        採用 {accepted} / {h.needed_count}名{h.note ? ` ・ ${h.note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={h.status === "open" ? "green" : "zinc"}>{h.status === "open" ? "募集中" : "終了"}</Badge>
                      {h.status === "open" && (
                        <form action={closeHelp}>
                          <input type="hidden" name="id" value={h.id} />
                          <button className="text-sm text-zinc-400 hover:text-red-600">締め切る</button>
                        </form>
                      )}
                    </div>
                  </div>
                  {apps.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3">
                      {apps.map((ap) => (
                        <div key={ap.id} className="flex items-center justify-between text-sm">
                          <span className="font-medium">{ap.staff?.name}</span>
                          {ap.status === "pending" ? (
                            <div className="flex gap-2">
                              <form action={decideApplication}>
                                <input type="hidden" name="application_id" value={ap.id} />
                                <input type="hidden" name="decision" value="accepted" />
                                <Button type="submit" className="!px-3 !py-1">採用</Button>
                              </form>
                              <form action={decideApplication}>
                                <input type="hidden" name="application_id" value={ap.id} />
                                <input type="hidden" name="decision" value="rejected" />
                                <Button type="submit" variant="secondary" className="!px-3 !py-1">見送り</Button>
                              </form>
                            </div>
                          ) : (
                            <Badge color={ap.status === "accepted" ? "green" : "zinc"}>
                              {ap.status === "accepted" ? "採用済み" : "見送り"}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>

        <Card>
          <p className="mb-4 text-sm font-medium">募集を作成</p>
          <form action={createHelp} className="space-y-3">
            <div>
              <Label>店舗</Label>
              <Select name="store_id" required>
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>日付</Label>
              <Input name="date" type="date" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>開始</Label>
                <Input name="start_time" type="time" required defaultValue="17:00" />
              </div>
              <div>
                <Label>終了</Label>
                <Input name="end_time" type="time" required defaultValue="20:00" />
              </div>
            </div>
            <div>
              <Label>募集人数</Label>
              <Input name="needed_count" type="number" min={1} defaultValue={1} required />
            </div>
            <div>
              <Label>メモ（任意）</Label>
              <Input name="note" placeholder="例: コンペのため増員" />
            </div>
            <Button type="submit" className="w-full">募集を出す（店舗スタッフに通知）</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
