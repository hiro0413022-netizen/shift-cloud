import Link from "next/link";
import { requireLessonActor, withStoreScope, scopeLabel } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { AddStudentForm } from "./add-student";

/** 生徒一覧（レッスンノート）— 顔写真・検索・最終レッスン日順（DECISIONS #50） */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; denied?: string; inactive?: string }>;
}) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  // 退会者（status='inactive'）は既定で隠す。0119 のトリガーがFRANKの退会を自動で落とす。
  // 記録そのものは消さないので、チェックを入れれば過去の生徒として開ける（2026-08-22）
  const showInactive = sp.inactive === "1";

  let query = admin
    .from("lsn_students")
    .select("id, name, name_kana, member_code, goal, status, photo_path")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);
  query = showInactive ? query.in("status", ["active", "inactive"]) : query.eq("status", "active");
  // 店舗スコープ（#134）。これが無いと FRANK のWeb入会で自動生成されたカルテ（#129）が
  // GOLF WING のレッスンノートに並ぶ。複数の or() は PostgREST 側で AND 結合される
  query = withStoreScope(query, actor);
  if (q) query = query.or(`name.ilike.%${q}%,name_kana.ilike.%${q}%,member_code.ilike.%${q}%`);
  const { data: students } = await query.order("name").limit(300);

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
          {/* どの範囲の名簿かを必ず出す（#134） */}
          <span className="ml-2 rounded-full border border-(--color-line) px-2 py-0.5 text-[11px] font-normal text-(--color-dim)">
            {scopeLabel(actor)}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <form className="flex w-full flex-wrap items-center gap-2">
            <input name="q" defaultValue={q} placeholder="氏名、かな、会員番号で検索" className="input-dark w-full sm:w-64" />
            <label className="flex items-center gap-1 whitespace-nowrap text-xs text-(--color-dim)">
              <input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} className="accent-(--color-gold)" />
              退会者も表示
            </label>
            <button className="rounded-lg bg-(--color-header) px-4 py-2 text-sm font-medium text-white">検索</button>
          </form>
          <a href={`/api/export?kind=lessons${showInactive ? "&inactive=1" : ""}`} className="btn-ghost hidden whitespace-nowrap text-xs md:block" title="レッスン記録をCSVで保存">⬇ CSV</a>
        </div>
      </div>

      {sp.denied === "frank" && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-300">
          FRANK GOLF のレッスンカレンダーは FRANK 配属のスタッフとオーナーだけが開けます（#134）。
        </p>
      )}

      <AddStudentForm />

      {showInactive && (
        <p className="text-xs text-(--color-dim)">退会した生徒も表示しています（カードの「退会」バッジ）</p>
      )}

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
                {s.status === "inactive" && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-(--color-dim)">退会</span>
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
