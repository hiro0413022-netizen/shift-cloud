import { notFound } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { Radar } from "@/components/radar";
import type { Phases } from "@/lib/phases";
import { ShareVideo } from "./share-video";
import { brandOf } from "@/lib/brand";

/**
 * 生徒向けマイページ（DECISIONS #50 / PGA NOTEユーザーアプリ準拠・青×白テーマ）
 * コーチが発行した共有URL（トークン）でアプリ不要・ログイン不要で閲覧。
 * 表示: マイデータ（進捗レーダー）／レッスン記録（動画＋コーチのアドバイス）／お手本スイング
 */
export const dynamic = "force-dynamic";

/**
 * タブのタイトルもブランドに合わせる（#168）。
 * ルートレイアウトの metadata は "GOLF WING Lesson OS" 固定なので、
 * ここで上書きしないと FRANK の会員のタブに GOLF WING と出る。
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdmin();
  const { data: share } = await admin
    .from("lsn_share_tokens").select("student_id, revoked_at").eq("token", token).maybeSingle();
  if (!share || share.revoked_at) return { title: "マイデータ" };
  const { data: st } = await admin
    .from("lsn_students").select("store_id").eq("id", share.student_id).maybeSingle();
  return { title: `マイデータ — ${brandOf((st?.store_id as string | null) ?? null).name}` };
}

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
    .select("id, name, name_kana, goal, photo_path, store_id")
    .eq("id", share.student_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!student) notFound();

  const [{ data: videos }, { data: items }, { data: prog }, { data: models }] = await Promise.all([
    admin
      .from("lsn_videos")
      .select("id, storage_path, poster_path, shot_at, club, distance_yd, note, is_best, phases, created_at")
      .eq("student_id", student.id)
      .is("deleted_at", null)
      .order("shot_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("lsn_progress_items").select("id, name, sort").eq("company_id", share.company_id).is("deleted_at", null).order("sort"),
    admin.from("lsn_progress").select("item_id, percent").eq("student_id", student.id),
    admin
      .from("lsn_model_videos")
      .select("id, storage_path, poster_path, club, distance_yd, note, staff:coach_staff_id(name)")
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

  /**
   * 署名URL（1時間）。2026-08-22: 1本ずつ発行していたのを一括に変えた。
   * 生徒のスマホで「レッスン記録20本＋お手本6本」を開くと往復が26回発生し、
   * ページが出るまで数秒かかっていた（createSignedUrls なら1回）。
   */
  const paths: string[] = [];
  for (const v of videos ?? []) {
    paths.push(v.storage_path as string);
    if (v.poster_path) paths.push(v.poster_path as string);
  }
  for (const m of models ?? []) {
    paths.push(m.storage_path as string);
    if (m.poster_path) paths.push(m.poster_path as string);
  }
  if (student.photo_path) paths.push(student.photo_path);

  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await admin.storage.from("lesson-videos").createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const videoUrls = new Map<string, string>();
  const videoPosters = new Map<string, string>();
  for (const v of videos ?? []) {
    const u = signed.get(v.storage_path as string);
    if (u) videoUrls.set(v.id, u);
    const pu = v.poster_path ? signed.get(v.poster_path as string) : null;
    if (pu) videoPosters.set(v.id, pu);
  }
  const modelUrls = new Map<string, string>();
  const modelPosters = new Map<string, string>();
  for (const m of models ?? []) {
    const u = signed.get(m.storage_path as string);
    if (u) modelUrls.set(m.id, u);
    const pu = m.poster_path ? signed.get(m.poster_path as string) : null;
    if (pu) modelPosters.set(m.id, pu);
  }
  const photoUrl = student.photo_path ? signed.get(student.photo_path) ?? null : null;

  const progMap = new Map((prog ?? []).map((p) => [p.item_id, p.percent]));
  const radarItems = (items ?? []).map((it) => ({ name: it.name, percent: progMap.get(it.id) ?? 0 }));
  // ブランドは生徒の所属店舗で決める（#168）。直書きすると必ずどちらかの店で嘘になる
  const brand = brandOf(student.store_id as string | null);
  const lessonCount = (videos ?? []).length;
  const latest = videos?.[0]?.shot_at ?? null;

  return (
    <main className="min-h-screen bg-[#f2f5f9] text-[#1c2733]">
      {/* 青ヘッダ（PGA NOTEユーザーアプリ準拠） */}
      <header className="px-4 py-3 text-white" style={{ backgroundColor: brand.accent }}>
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <p className="text-sm font-semibold tracking-wide">マイデータ</p>
          <p className="text-[10px] tracking-[0.24em] opacity-80">{brand.name}</p>
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
              <div className="flex h-16 w-16 items-center justify-center rounded-lg text-xl font-semibold" style={{ backgroundColor: brand.accentSoft, color: brand.accent }}>
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
              <p className="text-sm font-semibold" style={{ color: brand.accent }}>進捗率</p>
              <p className="text-xs text-gray-500">
                レッスン記録: {lessonCount}本{latest ? ` ・ 最新: ${latest}` : ""}
              </p>
            </div>
            <Radar items={radarItems} stroke={brand.accent} fill={brand.radarFill} grid="#c8d4e2" label="#5a6b80" />
          </section>
        )}

        {/* レッスン記録 */}
        <section className="space-y-3">
          <p className="px-1 text-sm font-semibold" style={{ color: brand.accent }}>レッスン記録</p>
          {(videos ?? []).length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">まだ記録がありません</p>}
          {(videos ?? []).map((v) => (
            <div key={v.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-xs text-gray-600">
                <span className="font-semibold text-sm text-[#1c2733]">{v.shot_at ?? v.created_at.slice(0, 10)}</span>
                {v.club && <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: brand.accentSoft, color: brand.accent }}>{v.club}</span>}
                {v.distance_yd != null && <span>{v.distance_yd}yd</span>}
                {v.is_best && <span className="ml-auto text-[#c9a545]">★ ベストスイング</span>}
              </div>
              {videoUrls.get(v.id) && (
                <ShareVideo
                  src={videoUrls.get(v.id)!}
                  poster={videoPosters.get(v.id) ?? null}
                  phases={(v.phases as Phases | null) ?? null}
                />
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
            <p className="px-1 text-sm font-semibold" style={{ color: brand.accent }}>コーチのお手本スイング</p>
            <div className="grid grid-cols-2 gap-3">
              {(models ?? []).map((m) => (
                <div key={m.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
                  {modelUrls.get(m.id) && (
                    <video
                      src={modelUrls.get(m.id)!}
                      poster={modelPosters.get(m.id) ?? undefined}
                      controls
                      playsInline
                      preload={modelPosters.get(m.id) ? "none" : "metadata"}
                      className="max-h-60 w-full bg-black"
                    />
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
          このページはあなた専用です。URLを他の人に教えないでください ・ {brand.name} Lesson OS
        </p>
      </div>
    </main>
  );
}
