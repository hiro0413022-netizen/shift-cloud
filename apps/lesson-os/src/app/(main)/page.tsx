import Link from "next/link";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { AddStudentForm } from "./add-student";

/** 生徒一覧（レッスンノート）— 顔写真・検索・最終レッスン日順（DECISIONS #50） */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  let query = admin
    .from("lsn_students")
    .select("id, name, name_kana, member_code, goal, status, photo_path")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name");
  if (q) query = query.or(`name.ilike.%${q}%,name_kana.ilike.%${q}%,member_code.ilike.%${q}%`);
  const { data: students } = await query.limit(300);

  const ids = (students ?? []).map((s) => s.id);
  const { data: vids } = ids.length
    ? await admin.from("lsn_videos").select("student_id, shot_at, created_at").in("student_id", ids).is("deleted_at", null)
    : { data: [] as { student_id: string; shot_at: string | null; created_at: string }[] };
  const stat = new Map<string, { count: number; last: string }>();
  for (const v of vids ?? []) {
    const cur = stat.get(v.student_id) ?? { count: 0, last: "" };
    cur.count += 1;
    const d = v.shot_at ?? v.created_at?.slice(0, 10) ?? "";
    if (d > cur.last) cur.last = d;
    stat.set(v.student_id, cur);
  }
  const sorted = [...(students ?? [])].sort(
    (a, b) => (stat.get(b.id)?.last ?? "").localeCompare(stat.get(a.id)?.last ?? "")
  );

  // 顔写真（あるものだけ署名URL）
  const photoUrls = new Map<string, string>();
  for (const s of sorted.slice(0, 60)) {
    if (!s.photo_path) continue;
    const { data } = await admin.storage.from("lesson-videos").createSignedUrl(s.photo_path, 3600);
    if (data?.signedUrl) photoUrls.set(s.id, data.signedUrl);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          レッスンノート <span className="text-sm font-normal text-(--color-dim)">{students?.length ?? 0}人</span>
        </h1>
        <div className="flex items-center gap-2">
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="氏名、かな、会員番号で検索" className="input-dark w-64 max-w-full" />
            <button className="rounded-lg bg-(--color-header) px-4 py-2 text-sm font-medium text-white">検索</button>
          </form>
          <a href="/api/export?kind=lessons" className="btn-ghost hidden whitespace-nowrap text-xs md:block" title="レッスン記録をCSVで保存">⬇ CSV</a>
        </div>
      </div>

      <AddStudentForm />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {sorted.length === 0 && (
          <p className="col-span-2 rounded-xl border border-(--color-line) bg-(--color-panel) p-6 text-sm text-(--color-dim) md:col-span-4">
            {q ? "該当する生徒がいません" : "まだ生徒がいません。上のフォームから追加してください"}
          </p>
        )}
        {sorted.map((s) => {
          const st = stat.get(s.id);
          const photo = photoUrls.get(s.id);
          return (
            <Link
              key={s.id}
              href={`/students/${s.id}`}
              className="group overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel) transition-colors hover:border-(--color-gold)"
            >
              <div className="relative aspect-square bg-(--color-panel-2)">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={s.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-semibold text-(--color-gold)/60">
                    {s.name.slice(0, 1)}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-1.5 pt-6">
                  <p className="truncate text-sm font-semibold text-white">{s.name}</p>
                  {s.name_kana && <p className="truncate text-[10px] text-white/70">{s.name_kana}</p>}
                </div>
              </div>
              <div className="px-2.5 py-2 text-[11px] text-(--color-dim)">
                <p className="truncate">{s.goal ? `🎯 ${s.goal}` : "目標未設定"}</p>
                <p>{st ? `動画${st.count}本 ・ 最終 ${st.last}` : "記録なし"}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
