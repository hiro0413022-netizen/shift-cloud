import { NextResponse } from "next/server";
import { BUCKET, listSegments, ownMeeting } from "@/lib/meetings";
import { aiFor } from "@/lib/ai/router";
import { LevelRoutingError } from "@/lib/levels";
import { collapseRepeats, fmtTime, joinSegments } from "@/lib/transcript";

/**
 * 次の区間を1本だけ文字起こしする（画面が「終わるまで」繰り返し呼ぶ）
 *
 * 1回の呼び出しで1区間だけにした理由:
 *   2時間の会議を1回で処理すると関数の時間制限（300秒）を必ず超える。
 *   10分の区間なら1回は数十秒で終わり、録音中から順番に進められる（止めた時点でほぼ終わっている）。
 *
 * 順番に処理する理由: 前の区間の最後を渡して、同じ人に同じ話者表記を使わせるため。
 * 録音が終わっていて、残りの区間が無くなったら、区間をつないで会議の文字起こしにする。
 */
export const runtime = "nodejs";
export const maxDuration = 300;

/** 他の呼び出しが処理中とみなす時間。これを過ぎた「処理中」は落ちたものとして取り直す */
const STALE_MS = 6 * 60 * 1000;

export async function POST(req: Request) {
  const { meetingId } = (await req.json().catch(() => ({}))) as { meetingId?: string };
  const { admin, meeting } = await ownMeeting(String(meetingId ?? ""));
  if (!meeting) return NextResponse.json({ error: "議事録が見つかりません" }, { status: 404 });
  if (!["recording", "transcribing"].includes(meeting.status)) {
    return NextResponse.json({ done: true, finalized: meeting.status !== "draft" });
  }

  const segs = await listSegments(admin, meeting.id);
  const next = segs.find((s) => s.status === "uploaded" || s.status === "transcribing");

  if (!next) {
    // 残りが無い。録音中なら次の区間を待つだけ
    if (meeting.status === "recording") return NextResponse.json({ done: true, finalized: false });
    const transcript = joinSegments(segs.map((s) => ({ idx: s.idx, transcript: s.transcript, offsetSec: s.offsetSeconds })));
    const failed = segs.filter((s) => s.status === "failed").length;
    await admin
      .from("mtg_meetings")
      .update({
        transcript,
        status: "transcribed",
        error: failed ? `${failed}区間を文字起こしできませんでした（該当箇所は文字起こしに明記）` : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id);
    return NextResponse.json({ done: true, finalized: true, failed });
  }

  if (next.status === "transcribing" && next.startedAt && Date.now() - new Date(next.startedAt).getTime() < STALE_MS) {
    return NextResponse.json({ busy: true });
  }

  // 取り合いを避ける: 状態が変わっていなければ自分が取る
  const claimed = await admin
    .from("mtg_segments")
    .update({ status: "transcribing", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", next.id)
    .eq("status", next.status)
    .select("id");
  if (!claimed.data?.length) return NextResponse.json({ busy: true });

  const failSeg = async (msg: string) => {
    // 音声は消さない（原因を直してやり直せるように）
    await admin.from("mtg_segments").update({ status: "failed", error: msg, updated_at: new Date().toISOString() }).eq("id", next.id);
    return NextResponse.json({ error: msg, segment: next.idx });
  };

  if (!next.audioPath) return failSeg("音声がありません");

  let ai;
  try {
    ai = aiFor(meeting.level);
  } catch (e) {
    // L3 をYOZANサーバー以外に流さない（levels.ts）。ここで止まるのが正しい動き
    await admin.from("mtg_segments").update({ status: "uploaded", started_at: null }).eq("id", next.id);
    return NextResponse.json({ error: e instanceof LevelRoutingError ? e.message : "AIの設定を確認してください" }, { status: 503 });
  }

  const dl = await admin.storage.from(BUCKET).download(next.audioPath);
  if (dl.error || !dl.data) return failSeg("音声を読めませんでした");
  const audio = await dl.data.arrayBuffer();

  const prev = [...segs].reverse().find((s) => s.idx < next.idx && s.status === "transcribed" && s.transcript);
  const total = segs.length;
  let text = "";
  let truncated = false;
  try {
    const out = await ai.transcribe(audio, next.mime ?? "audio/webm", {
      participants: meeting.participants,
      prevTail: prev?.transcript?.slice(-800),
      segmentLabel:
        meeting.source === "file" ? "録音" : `${next.idx + 1}番目の区間（会議開始から${fmtTime(next.offsetSeconds)}〜・全${total}区間中）`,
    });
    text = collapseRepeats(out.text).slice(0, 60000);
    truncated = out.truncated;
  } catch (e) {
    return failSeg(e instanceof Error ? e.message.slice(0, 400) : "文字起こしに失敗しました");
  }
  if (!text.trim()) return failSeg("声を聞き取れませんでした（マイクが遠い・無音の可能性）");

  await admin
    .from("mtg_segments")
    .update({
      transcript: text,
      status: "transcribed",
      error: truncated ? "文字起こしが長すぎて途中で切れました。この区間の後半が欠けている可能性があります" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id);

  // 約束どおり、文字起こしが取れた区間の音声はその場で消す
  await admin.storage.from(BUCKET).remove([next.audioPath]);
  await admin
    .from("mtg_segments")
    .update({ audio_path: null, audio_deleted_at: new Date().toISOString() })
    .eq("id", next.id);
  await admin.from("mtg_meetings").update({ ai_provider: ai.name }).eq("id", meeting.id);

  return NextResponse.json({ done: false, segment: next.idx, truncated });
}
