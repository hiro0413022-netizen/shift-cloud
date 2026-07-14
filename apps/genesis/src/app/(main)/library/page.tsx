import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { decSeg } from "@/lib/libkey";
import { LibraryClient, type LibItem } from "./library-client";

/**
 * 資料室 — 会社の資料をここに置き、どこからでもダウンロードできる。
 * 出店計画・事業計画・提案資料など。保存先はプライベートStorage（公開リポジトリに置かない）。
 */
export default async function LibraryPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const { data: root } = await admin.storage.from("library").list(actor.companyId, { limit: 100 });
  const folders = (root ?? []).filter((e) => e.id === null).map((e) => e.name);

  const items: LibItem[] = [];
  for (const folder of folders) {
    const { data: files } = await admin.storage
      .from("library")
      .list(`${actor.companyId}/${folder}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
    for (const f of files ?? []) {
      if (f.id === null) continue;
      items.push({
        path: `${actor.companyId}/${folder}/${f.name}`,
        name: decSeg(f.name.replace(/^\d+_/, "")), // キーはbase64url（lib/libkey.ts）
        category: decSeg(folder),
        size: (f.metadata as { size?: number } | null)?.size ?? 0,
        createdAt: f.created_at ?? "",
      });
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">資料室</h1>
      <p className="mb-6 text-sm text-(--color-dim)">
        会社の資料の置き場。ここに上げたファイルはPC・スマホどこからでもダウンロードできます（view_hq保持者のみ）
      </p>
      <LibraryClient items={items} categories={folders.map(decSeg)} />
    </div>
  );
}
