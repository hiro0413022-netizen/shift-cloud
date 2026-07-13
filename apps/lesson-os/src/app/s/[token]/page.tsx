import { notFound } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { Radar } from "@/components/radar";

/**
 * 生徒向けマイページ（DECISIONS #50 / PGA NOTEユーザーアプリ準拠・青×白テーマ）
 * コーチが発行した共有URL（トークン）でアプリ不要・ログイン不要で閲覧。
 * 表示: マイデータ（進捗レーダー）／レッスン記録（動画＋コーチのアドバイス）／お手本スイング
 */
export const dynamic = "force-dynamic";

export default async function StudentSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdmin();

  const { data: share } = await admin
    .from("lsn_share_tokens")
    .select("student_id, company_id, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!share || share.revoked_at) notFound();

  const { data: student } = await admin
    .from("lsn_students")
    .select("id, name, name_kana, goal, photo_path")
    .eq("id", share.student_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!student) notFound();

  const [{ data: videos }, { data: items }, { data: prog }, { data: models }] = await Promise.all([
    admin
      .from("lsn_videos")
      .select("id, storage_path, shot_at, club, distance_yd, note, is_best, created_at")
      .eq("student_id", student.id)
      .is("deleted_at", null)
      .order("shot_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("lsn_progress_items").select("id, name, sort").eq("company_id", share.company_id).is("deleted_at", null).order("sort"),
    admin.from("lsn_progress").select("item_id, percent").eq("student_id", student.id),
    admin
      .from("lsn_model_videos")
      .select("id, storage_path, club, distance_yd, note, staff:coach_staff_id(name)")
      .eq("company_id", share.company_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const videoIds = (videos ?? []).map((v) => v.id);
  const { data: comments } = videoIds.length
    ? await admin
        .from("lsn_comments")
        .select("video_id, body, created_at, staff:coach_staff_id(name)")
        .in("video_id", videoIds)
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] };

  // 署名URL（1時間）— 生徒はこのページを開くたびに新しいURLが発行される
  const sign = async (path: string) =>
    (await admin.storage.from("lesson-videos").createSignedUrl(path, 3600)).data?.signedUrl ?? null;
  const videoUrls = new Map<string, string>();
  for (const v of videos ?? []) {
    const u = await sign(v.storage_path);
    if (u) videoUrls.set(v.id, u);
  }
  const modelUrls = new Map<string, string>();
  for (const m of models ?? []) {
    const u = await sign(m.storage_path);
    if (u) modelUrls.set(m.id, u);
  }
  const photoUrl = student.photo_path ? await sign(student.photo_path) : null;

  const progMap = new Map((prog ?? []).map((p) => [p.item_id, p.percent]));
  const radarItems = (items ?? []).map((it) => ({ name: it.name, percent: progMap.get(it.id) ?? 0 }));
  const lessonCount = (videos ?? []).length;
  const latest = videos?.[0]?.shot_at ?? null;

  return (
    <main className="min-h-screen bg-[#f2f5f9] text-[#1c2733]">
      {/* 青ヘッダ（PGA NOTEユーザーアプリ準拠） */}
      <header className="bg-[#1e5da8] px-4 py-3 text-white">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <p className="text-sm font-semibold tracking-wide">マイデータ</p>
          <p className="text-[10px] tracking-[0.24em] opacity-80">GOLF WING</p>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {/* プロフィール */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={student.name} className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#e5ecf5] text-xl font-semibold text-[#1e5da8]">
                {student.name.slice(0, 1)}
              </div>
            )}
            <div>
              <p className="text-lg font-bold">{student.name}</p>
              {student.name_kana && <p className="text-xs text-gray-500">{student.name_kana}</p>}
            </div>
          </div>
          {student.goal && (
            <div className="mt-3 rounded-lg border border-[#c9a545] bg-[#fdf9ee] px-3 py-2 text-center text-sm">
              <span className="mr-1 text-[#8a6d1f]">目標</span>{student.goal}
            </div>
          )}
        </section>

        {/* 進捗率レーダー */}
        {radarItems.length > 0 && (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-[#1e5da8]">進捗率</p>
              <p className="text-xs text-gray-500">
                レッスン記録: {lessonCount}本{latest ? ` ・ 最新: ${latest}` : ""}
              </p>
            </div>
            <Radar items={radarItems} stroke="#1e5da8" fill="rgba(30,93,168,0.3)" grid="#c8d4e2" label="#5a6b80" />
          </section>
        )}

        {/* レッスン記録 */}
        <section className="space-y-3">
          <p className="px-1 text-sm font-semibold text-[#1e5da8]">レッスン記録</p>
          {(videos ?? []).length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">まだ記録がありません</p>}
          {(videos ?? []).map((v) => (
            <div key={v.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-xs text-gray-600">
                <span className="font-semibold text-sm text-[#1c2733]">{v.shot_at ?? v.created_at.slice(0, 10)}</span>
                {v.club && <span className="rounded bg-[#e5ecf5] px-1.5 py-0.5 text-[#1e5da8]">{v.club}</span>}
                {v.distance_yd != null && <span>{v.distance_yd}yd</span>}
                {v.is_best && <span className="ml-auto text-[#c9a545]">★ ベストスイング</span>}
              </div>
              {videoUrls.get(v.id) && (
                <video src={videoUrls.get(v.id)!} controls playsInline preload="metadata" className="max-h-96 w-full bg-black" />
              )}
              <div className="space-y-2 px-4 py-3">
                {v.note && <p className="text-xs text-gray-500">{v.note}</p>}
                {(comments ?? []).filter((c) => c.video_id === v.id).map((c, i) => (
                  <div key={i} className="rounded-lg border border-[#e3d5ae] bg-[#fdf9ee] px-3 py-2">
                    <p className="text-[10px] text-[#8a6d1f]">コーチからのアドバイス ・ {(c.staff as unknown as { name: string } | null)?.name}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* お手本スイング */}
        {(models ?? []).length > 0 && (
          <section className="space-y-3">
            <p className="px-1 text-sm font-semibold text-[#1e5da8]">コーチのお手本スイング</p>
            <div className="grid grid-cols-2 gap-3">
              {(models ?? []).map((m) => (
                <div key={m.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
                  {modelUrls.get(m.id) && (
                    <video src={modelUrls.get(m.id)!} controls playsInline preload="metadata" className="max-h-60 w-full bg-black" />
                  )}
                  <div className="px-3 py-2 text-xs text-gray-600">
                    {(m.staff as unknown as { name: string } | null)?.name}
                    {m.club ? ` ・ ${m.club}` : ""}
                    {m.distance_yd ? ` ・ ${m.distance_yd}yd` : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="pb-6 pt-2 text-center text-[10px] text-gray-400">
          このページはあなた専用です。URLを他の人に教えないでください ・ GOLF WING Lesson OS
        </p>
      </div>
    </main>
  );
}
