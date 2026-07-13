import Link from "next/link";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { AddStudentForm } from "./add-student";

/**
 * 生徒一覧 — 最終レッスン日順（会っていない生徒が沈まないよう名前でも探せる）。
 * WING NOTE改善: 顔写真必須にしない・名前だけで追加できる・動画数と最終レッスン日を一覧で見せる。
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  let query = admin
    .from("lsn_students")
    .select("id, name, name_kana, member_code, goal, status")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name");
  if (q) query = query.or(`name.ilike.%${q}%,name_kana.ilike.%${q}%,member_code.ilike.%${q}%`);
  const { data: students } = await query.limit(300);

  // 動画数・最終レッスン日をまとめて取得
  const ids = (students ?? []).map((s) => s.id);
  const { data: vids } = ids.length
    ? await admin
        .from("lsn_videos")
        .select("student_id, shot_at, created_at")
        .in("student_id", ids)
        .is("deleted_at", null)
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold tracking-tight">生徒一覧 <span className="text-sm text-[--color-dim]">{students?.length ?? 0}人</span></h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="名前・かな・会員番号で検索"
            className="w-64 max-w-full rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm"
          />
          <button className="rounded-lg border border-[--color-line] px-3 py-2 text-sm text-[--color-dim]">検索</button>
        </form>
      </div>

      <AddStudentForm />

      <div className="overflow-hidden rounded-xl border border-[--color-line]">
        {sorted.length === 0 && (
          <p className="bg-[--color-panel] px-4 py-6 text-sm text-[--color-dim]">
            {q ? "該当する生徒がいません" : "まだ生徒がいません。上のフォームから追加してください"}
          </p>
        )}
        {sorted.map((s, i) => {
          const st = stat.get(s.id);
          return (
            <Link
              key={s.id}
              href={`/students/${s.id}`}
              className={`flex items-center gap-3 bg-[--color-panel] px-4 py-3 transition-colors hover:bg-[--color-panel-2] ${i > 0 ? "border-t border-[--color-line]" : ""}`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[--color-panel-2] text-sm font-semibold text-[--color-gold]">
                {s.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {s.name}
                  {s.name_kana && <span className="ml-2 text-xs font-normal text-[--color-dim]">{s.name_kana}</span>}
                </p>
                <p className="truncate text-xs text-[--color-dim]">
                  {s.goal ? `🎯 ${s.goal}` : "目標未設定"}
                  {s.member_code ? ` ・ 会員 ${s.member_code}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-[--color-dim]">
                <p>{st ? `動画 ${st.count}本` : "動画なし"}</p>
                <p>{st?.last ? `最終 ${st.last}` : ""}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
