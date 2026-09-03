import Link from "next/link";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { CLIENT_FIELDS, latestVideoByDay, noteVideoId, diffOf } from "@yozan/core/lesson-share";
import { LessonVideo } from "./lesson-video";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");

/**
 * レッスンノート（会員ページの中で直接見る・#210・2026-09-03 ユーザー依頼）
 *
 * ★ なぜ作り直したか
 *   これまでは会員ページから **lesson-os の共有URL（/s/<token>）へ飛ばしていた**。
 *   つまり「見るために秘密のURLを1本発行する」作りで、
 *     - コーチが【生徒へ共有リンク】を押していない会員には出ない（#207 の事故）
 *     - 押した瞬間にトークンが1本増える
 *   ユーザー指示「リンクを発行せずに即時に見えるようにしてください」。
 *
 * ★ 代わりに何を根拠に見せるか
 *   **ログインしている会員ご本人であること**（member セッション）だけ。
 *   秘密のURLを持っているか、ではなく、誰としてログインしているかで決める。
 *   会員番号 → lsn_students.member_code でカルテを引き、そのカルテのものしか出さない。
 *   共有URL（/s/<token>）は今まで通り残す＝LINEで送る・会員でない方に見せる用。
 *
 * ★ 出すもの（お客様向け）
 *   スイング動画 ／ 今日のレッスンの説明（先生が確認して保存したものだけ）
 *   ／ レッスンデータ（紐づいた計測だけ・8項目＋前回比） ／ コーチからのアドバイス
 *   文字起こしもAIの下書きもお客様には出さない（#179 の約束）。
 */
export default async function MemberLessonPage() {
  const member = await requireMember();
  const admin = createAdmin();

  const { data: st } = await admin
    .from("lsn_students")
    .select("id, name, goal")
    .eq("company_id", member.companyId)
    .eq("member_code", member.memberNo)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const student = (st ?? null) as Row | null;

  if (!student) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 py-8">
        <Header />
        <p className="rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-6 text-center text-sm text-(--color-dim)">
          まだレッスンの記録がありません。
          <br />
          レッスンを受けられると、スイング動画と先生からの説明がここに出ます。
        </p>
      </main>
    );
  }
  const studentId = s(student.id);

  const [{ data: vids }, { data: notes }, { data: measures }, { data: models }] = await Promise.all([
    admin
      .from("lsn_videos")
      .select("id, storage_path, poster_path, shot_at, club, distance_yd, note, is_best, created_at")
      .eq("student_id", studentId).is("deleted_at", null)
      .order("shot_at", { ascending: false }).order("created_at", { ascending: false })
      .limit(20),
    // お客様に出るのは **先生が確認して保存した説明だけ**（#179 の柱）
    admin
      .from("lsn_lesson_notes")
      .select("id, lesson_date, share_body, video_id, updated_at, staff:coach_staff_id(name)")
      .eq("student_id", studentId).is("deleted_at", null)
      .not("share_body", "is", null)
      .order("lesson_date", { ascending: false })
      .limit(20),
    admin
      .from("lsn_measurements")
      .select("id, measured_at, club, video_id, data")
      .eq("student_id", studentId).is("deleted_at", null)
      .order("measured_at", { ascending: false })
      .limit(60),
    admin
      .from("lsn_model_videos")
      .select("id, storage_path, poster_path, club, distance_yd, staff:coach_staff_id(name)")
      .eq("company_id", member.companyId).is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const videos = (vids ?? []) as Row[];
  const videoIds = videos.map((v) => s(v.id));

  const { data: cmts } = videoIds.length
    ? await admin
        .from("lsn_comments")
        .select("id, video_id, body, created_at, staff:coach_staff_id(name)")
        .in("video_id", videoIds).is("deleted_at", null)
        .order("created_at")
    : { data: [] };

  /* 署名URLは1回でまとめて発行する（1本ずつ取ると本数ぶん往復して数秒待たされる） */
  const paths: string[] = [];
  for (const v of videos) {
    paths.push(s(v.storage_path));
    if (v.poster_path) paths.push(s(v.poster_path));
  }
  for (const m of (models ?? []) as Row[]) {
    paths.push(s(m.storage_path));
    if (m.poster_path) paths.push(s(m.poster_path));
  }
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await admin.storage.from("lesson-videos").createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  /* 説明をどのスイングの下に出すか。video_id が無い古いメモは同じ日の最後の1本で拾う */
  const latestOfDay = latestVideoByDay(
    videos.map((v) => ({ id: s(v.id), shotAt: s(v.shot_at ?? s(v.created_at).slice(0, 10)) }))
  );
  const noteRows = (notes ?? []) as Row[];
  const notesFor = (videoId: string) =>
    noteRows.filter(
      (n) => noteVideoId({ videoId: (n.video_id as string | null) ?? null, lessonDate: s(n.lesson_date) }, latestOfDay) === videoId
    );
  const looseNotes = noteRows.filter(
    (n) => !noteVideoId({ videoId: (n.video_id as string | null) ?? null, lessonDate: s(n.lesson_date) }, latestOfDay)
  );

  /* 前回比は**同じクラブの1つ前**とだけ比べる（ドライバーと7番アイアンを比べても意味がない） */
  type Shot = { id: string; videoId: string | null; club: string | null; values: Record<string, number>; prev: Record<string, number> | null };
  const shots: Shot[] = [];
  for (const m of [...((measures ?? []) as Row[])].reverse()) {
    const club = (m.club as string | null) ?? null;
    const before = shots.filter((x) => x.club === club).at(-1) ?? null;
    shots.push({
      id: s(m.id),
      videoId: (m.video_id as string | null) ?? null,
      club,
      values: (m.data as Record<string, number>) ?? {},
      prev: before?.values ?? null,
    });
  }
  const shotsFor = (videoId: string) => shots.filter((x) => x.videoId === videoId);

  /* 「ここまでは見た」を進める＝次に増えたときだけホームに新着バッジが出る（#155） */
  if (member.memberId) {
    await admin
      .from("frunk_members")
      .update({ karte_seen_at: new Date().toISOString() })
      .eq("id", member.memberId);
  }

  const ymd = (v: string) => v.slice(0, 10).replace(/-/g, "/");
  const unitsOf = (values: Record<string, number>) =>
    ((values as unknown as { _units?: Record<string, string> })._units ?? {});

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <Header />

      {student.goal ? (
        <div className="mb-4 rounded-xl border border-(--color-gold)/40 bg-(--color-panel) px-4 py-3 text-center text-sm">
          <span className="mr-1 text-xs text-(--color-gold)">目標</span>
          {s(student.goal)}
        </div>
      ) : null}

      {/* 動画に紐づかない日の説明（動画を撮らなかった日のレッスン） */}
      {looseNotes.length > 0 && (
        <section className="mb-4 space-y-2">
          {looseNotes.map((n) => (
            <div key={s(n.id)} className="rounded-xl border border-(--color-gold)/40 bg-(--color-panel) p-4">
              <p className="text-xs text-(--color-dim)">
                {ymd(s(n.lesson_date))}
                {(n.staff as unknown as { name?: string } | null)?.name ? ` ・ ${(n.staff as unknown as { name: string }).name}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{s(n.share_body)}</p>
            </div>
          ))}
        </section>
      )}

      {videos.length === 0 && looseNotes.length === 0 && (
        <p className="rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-6 text-center text-sm text-(--color-dim)">
          まだレッスンの記録がありません。
        </p>
      )}

      {/* レッスン記録（新しい順） */}
      <div className="space-y-4">
        {videos.map((v) => {
          const id = s(v.id);
          const url = signed.get(s(v.storage_path)) ?? null;
          const poster = v.poster_path ? signed.get(s(v.poster_path)) ?? null : null;
          const myNotes = notesFor(id);
          const myShots = shotsFor(id);
          const myComments = ((cmts ?? []) as Row[]).filter((c) => s(c.video_id) === id);
          return (
            <section key={id} className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs text-(--color-dim)">
                <span className="text-sm font-semibold text-(--color-txt)">{ymd(s(v.shot_at ?? v.created_at))}</span>
                {v.club ? <span className="rounded bg-(--color-panel-2) px-1.5 py-0.5">{s(v.club)}</span> : null}
                {v.distance_yd != null ? <span>{String(v.distance_yd)}yd</span> : null}
                {v.is_best ? <span className="ml-auto text-(--color-gold)">★ ベストスイング</span> : null}
              </div>

              {url ? <LessonVideo src={url} poster={poster} /> : null}

              <div className="space-y-2 px-4 pb-4 pt-1">
                {/* 今日のレッスンの説明（先生が確認して保存したものだけ） */}
                {myNotes.map((n) => (
                  <div key={s(n.id)} className="rounded-lg border border-(--color-gold)/40 bg-(--color-panel-2) px-3 py-2">
                    <p className="text-[11px] text-(--color-gold)">
                      今日のレッスン
                      {(n.staff as unknown as { name?: string } | null)?.name ? ` ・ ${(n.staff as unknown as { name: string }).name}` : ""}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{s(n.share_body)}</p>
                  </div>
                ))}

                {/* レッスンデータ（紐づいた計測がある日だけ出す） */}
                {myShots.map((sh) => {
                  const fields = CLIENT_FIELDS.filter((f) => typeof sh.values[f.key] === "number");
                  if (fields.length === 0) return null;
                  const units = unitsOf(sh.values);
                  return (
                    <div key={sh.id} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2">
                      <p className="text-[11px] text-(--color-dim)">レッスンデータ{sh.club ? ` ・ ${sh.club}` : ""}</p>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        {fields.map((f) => {
                          const now = sh.values[f.key];
                          const d = diffOf(now, sh.prev?.[f.key]);
                          return (
                            <div key={f.key} className="flex items-baseline justify-between border-b border-(--color-line)/40 py-0.5 text-xs">
                              <span className="text-(--color-dim)">{f.label}</span>
                              <span className="tabular-nums">
                                {now}
                                <span className="ml-0.5 text-(--color-dim)">{units[f.key] ?? f.unit}</span>
                                {d !== null && (
                                  <span className="ml-1 text-[10px] text-(--color-dim)">（前回 {d > 0 ? "+" : ""}{d}）</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* コーチが手で書き足したアドバイス */}
                {myComments.map((c) => (
                  <div key={s(c.id)} className="rounded-lg bg-(--color-panel-2) px-3 py-2">
                    <p className="text-[11px] text-(--color-dim)">
                      コーチからのアドバイス
                      {(c.staff as unknown as { name?: string } | null)?.name ? ` ・ ${(c.staff as unknown as { name: string }).name}` : ""}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{s(c.body)}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* お手本スイング */}
      {((models ?? []) as Row[]).length > 0 && (
        <section className="mt-6">
          <p className="mb-2 text-sm font-semibold text-(--color-gold)">コーチのお手本スイング</p>
          <div className="grid grid-cols-2 gap-3">
            {((models ?? []) as Row[]).map((m) => {
              const url = signed.get(s(m.storage_path));
              const poster = m.poster_path ? signed.get(s(m.poster_path)) : undefined;
              return (
                <div key={s(m.id)} className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
                  {url ? (
                    <video
                      src={url}
                      poster={poster}
                      controls
                      playsInline
                      preload={poster ? "none" : "metadata"}
                      className="max-h-60 w-full bg-black"
                    />
                  ) : null}
                  <div className="px-3 py-2 text-[11px] text-(--color-dim)">
                    {(m.staff as unknown as { name?: string } | null)?.name ?? ""}
                    {m.club ? ` ・ ${s(m.club)}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="pb-6 pt-6 text-center text-[10px] text-(--color-dim)">
        このページはご本人だけがご覧になれます
      </p>
    </main>
  );
}

function Header() {
  return (
    <header className="mb-5">
      <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← マイページ</Link>
      <h1 className="mt-2 text-xl font-bold tracking-wide">レッスンノート</h1>
      <p className="text-xs text-(--color-dim)">スイング動画と、先生からの説明</p>
    </header>
  );
}
