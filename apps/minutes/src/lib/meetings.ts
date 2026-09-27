import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor, type Actor } from "./auth";
import { canView, isLevel, type Level } from "./levels";
import type { ModeId, Summary, Todo } from "./modes";

export const BUCKET = "minutes-audio";
/** 1区間の長さ（秒）。10分＝32kbpsで約2.4MB。落ちても失うのは最大この長さ */
export const SEGMENT_SECONDS = 600;
/** 持ち込みファイルの上限（バケットの上限と同じ） */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type MeetingStatus =
  | "draft" | "recording" | "transcribing" | "transcribed" | "summarizing" | "summarized" | "confirmed" | "failed";

export type Meeting = {
  id: string;
  companyId: string;
  createdBy: string | null;
  creatorName: string | null;
  title: string;
  meetingDate: string;
  participants: string;
  level: Level;
  mode: ModeId | "auto";
  modeSuggested: ModeId | null;
  source: "record" | "file" | "text";
  status: MeetingStatus;
  consentAt: string | null;
  transcript: string | null;
  speakers: Record<string, string>;
  summary: Summary | null;
  body: string | null;
  todos: Todo[] | null;
  aiProvider: string | null;
  error: string | null;
  transcriptExpiresAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

export type Segment = {
  id: string;
  idx: number;
  offsetSeconds: number;
  seconds: number | null;
  audioPath: string | null;
  audioBytes: number | null;
  mime: string | null;
  status: "uploaded" | "transcribing" | "transcribed" | "failed";
  startedAt: string | null;
  transcript: string | null;
  error: string | null;
};

// staff への外部キーが3本（created_by / consent_by / confirmed_by）あるので、埋め込みは必ずFK名で指定する
// （指定しないと PostgREST が PGRST201 で落ちる・caddy #144c / cortex #207 と同じ罠）
const CREATOR = "creator:staff!mtg_meetings_created_by_fkey(name)";
const LIST_COLS = `id, company_id, created_by, title, meeting_date, participants, level, mode, mode_suggested, source, status, consent_at, speakers, ai_provider, error, transcript_expires_at, confirmed_at, created_at, ${CREATOR}`;
const COLS = `${LIST_COLS}, transcript, summary, body, todos`;

type Row = Record<string, unknown> & { creator?: { name?: string } | { name?: string }[] | null };

export function toMeeting(r: Row): Meeting {
  const st = Array.isArray(r.creator) ? r.creator[0] : r.creator;
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    createdBy: (r.created_by as string | null) ?? null,
    creatorName: st?.name ?? null,
    title: String(r.title ?? ""),
    meetingDate: String(r.meeting_date ?? ""),
    participants: String(r.participants ?? ""),
    level: isLevel(r.level) ? r.level : "L1",
    mode: (r.mode as ModeId | "auto") ?? "auto",
    modeSuggested: (r.mode_suggested as ModeId | null) ?? null,
    source: (r.source as Meeting["source"]) ?? "record",
    status: (r.status as MeetingStatus) ?? "draft",
    consentAt: (r.consent_at as string | null) ?? null,
    transcript: (r.transcript as string | null) ?? null,
    speakers: (r.speakers as Record<string, string>) ?? {},
    summary: (r.summary as Summary | null) ?? null,
    body: (r.body as string | null) ?? null,
    todos: (r.todos as Todo[] | null) ?? null,
    aiProvider: (r.ai_provider as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    transcriptExpiresAt: (r.transcript_expires_at as string | null) ?? null,
    confirmedAt: (r.confirmed_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

export function toSegment(r: Record<string, unknown>): Segment {
  return {
    id: String(r.id),
    idx: Number(r.idx),
    offsetSeconds: Number(r.offset_seconds ?? 0),
    seconds: (r.seconds as number | null) ?? null,
    audioPath: (r.audio_path as string | null) ?? null,
    audioBytes: (r.audio_bytes as number | null) ?? null,
    mime: (r.mime as string | null) ?? null,
    status: (r.status as Segment["status"]) ?? "uploaded",
    startedAt: (r.started_at as string | null) ?? null,
    transcript: (r.transcript as string | null) ?? null,
    error: (r.error as string | null) ?? null,
  };
}

/**
 * 会議1件を「見てよい人か」まで確かめて返す。見られない会議は「無い」ことにする（存在を漏らさない）。
 * 議事録の読み書きはすべてここを通す。
 */
export async function ownMeeting(id: string): Promise<{ actor: Actor; admin: ReturnType<typeof createAdmin>; meeting: Meeting | null }> {
  const actor = await requireActor();
  const admin = createAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { actor, admin, meeting: null };
  const { data } = await admin.from("mtg_meetings").select(COLS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) return { actor, admin, meeting: null };
  const m = toMeeting(data as Row);
  if (m.companyId !== actor.companyId) return { actor, admin, meeting: null };
  if (!canView(m.level, m, actor)) return { actor, admin, meeting: null };
  return { actor, admin, meeting: m };
}

export async function listMeetings(actor: Actor): Promise<Meeting[]> {
  const admin = createAdmin();
  await purgeExpired(admin, actor.companyId);
  const { data } = await admin
    .from("mtg_meetings")
    .select(LIST_COLS)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as unknown as Row[]).map(toMeeting).filter((m) => canView(m.level, m, actor));
}

export async function listSegments(admin: ReturnType<typeof createAdmin>, meetingId: string): Promise<Segment[]> {
  const { data } = await admin
    .from("mtg_segments")
    .select("id, idx, offset_seconds, seconds, audio_path, audio_bytes, mime, status, started_at, transcript, error")
    .eq("meeting_id", meetingId)
    .order("idx");
  return ((data ?? []) as Record<string, unknown>[]).map(toSegment);
}

/**
 * L2 の「確定から30日で文字起こしを消す」。cron を増やさず、一覧を開いたついでに走らせる
 * （対象は部分索引で拾えるので軽い）。区間ごとの文字起こしも一緒に消す。
 */
export async function purgeExpired(admin: ReturnType<typeof createAdmin>, companyId: string) {
  const now = new Date().toISOString();
  const { data } = await admin
    .from("mtg_meetings")
    .select("id")
    .eq("company_id", companyId)
    .not("transcript", "is", null)
    .lt("transcript_expires_at", now)
    .limit(50);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return;
  await admin.from("mtg_meetings").update({ transcript: null, updated_at: now }).in("id", ids);
  await admin.from("mtg_segments").update({ transcript: null, updated_at: now }).in("meeting_id", ids);
}

export function extOfMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

/** codecs などのパラメータを落とした MIME（#153 の教訓: codecs付きだとAI側で弾かれることがある） */
export function baseMime(mime: string): string {
  const b = mime.split(";")[0].trim().toLowerCase();
  if (b === "audio/x-m4a" || b === "audio/m4a" || b === "video/mp4") return "audio/mp4";
  if (b === "video/webm") return "audio/webm";
  if (b === "audio/x-wav") return "audio/wav";
  return b || "audio/webm";
}
