import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { NotesClient, type NoteItem } from "./notes-client";

/**
 * 社内連絡 — 役員が古川さんに伝えたいことを書き残すノート（migration 0040）。
 * 古川さんは未対応一覧を確認して「対応済み」にする。口頭・LINEで流れる連絡の集約場所。
 */
export default async function NotesPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const { data } = await admin
    .from("gn_messages")
    .select("id, body, status, reply, created_at, staff:from_staff_id(name)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const items: NoteItem[] = (data ?? []).map((m) => ({
    id: m.id,
    body: m.body,
    status: m.status as "open" | "done",
    reply: m.reply,
    createdAt: m.created_at,
    from: (m.staff as unknown as { name: string } | null)?.name ?? "不明",
  }));

  const openCount = items.filter((i) => i.status === "open").length;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">社内連絡</h1>
      <p className="mb-6 text-sm text-(--color-dim)">
        役員から経営への連絡ノート。書き残せば流れません。{openCount > 0 ? `未対応 ${openCount} 件` : "未対応はありません"}
      </p>
      <NotesClient items={items} myName={actor.name} />
    </div>
  );
}
