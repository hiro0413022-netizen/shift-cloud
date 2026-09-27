import { NextResponse } from "next/server";
import { ownMeeting } from "@/lib/meetings";
import { aiFor } from "@/lib/ai/router";
import { LevelRoutingError } from "@/lib/levels";
import {
  MODE_BY_ID, classifySystem, isModeId, modeAllowed, modesForLevel, parseClassify, parseSummary, summarySystem,
  type ModeId,
} from "@/lib/modes";
import { annotateSummary, applySpeakers } from "@/lib/transcript";

/**
 * 文字起こし → モード別の要約（下書き）
 *
 * 音声は使わない（文字起こしから作る）ので、モードを変えて何度でも作り直せる。
 * モードが auto なら、先に種類をAIに「提案」させる（確定は人・画面で変えられる）。
 * 各項目の根拠の発言は文字起こしと照合して、見つからないものに印を付ける。
 */
export const runtime = "nodejs";
export const maxDuration = 300;

/** AIに渡す文字起こしの上限（約3時間分）。超えたら後ろを切ったと明記する */
const MAX_CHARS = 150000;

export async function POST(req: Request) {
  const { meetingId, mode: requested } = (await req.json().catch(() => ({}))) as { meetingId?: string; mode?: string };
  const { admin, meeting } = await ownMeeting(String(meetingId ?? ""));
  if (!meeting) return NextResponse.json({ error: "議事録が見つかりません" }, { status: 404 });
  if (meeting.status === "confirmed") return NextResponse.json({ error: "確定済みです。先に確定を取り消してください" }, { status: 409 });
  if (!meeting.transcript) return NextResponse.json({ error: "文字起こしがありません（期限で消えた可能性）" }, { status: 400 });
  if (requested && !isModeId(requested)) return NextResponse.json({ error: "要約モードが不正です" }, { status: 400 });

  let ai;
  try {
    ai = aiFor(meeting.level);
  } catch (e) {
    return NextResponse.json({ error: e instanceof LevelRoutingError ? e.message : "AIの設定を確認してください" }, { status: 503 });
  }

  const prevStatus = meeting.status;
  await admin.from("mtg_meetings").update({ status: "summarizing", error: null, updated_at: new Date().toISOString() }).eq("id", meeting.id);

  const back = async (msg: string, code = 502) => {
    await admin
      .from("mtg_meetings")
      .update({ status: prevStatus === "summarizing" ? "transcribed" : prevStatus, error: msg, updated_at: new Date().toISOString() })
      .eq("id", meeting.id);
    return NextResponse.json({ error: msg }, { status: code });
  };

  const full = applySpeakers(meeting.transcript, meeting.speakers);
  const cut = full.length > MAX_CHARS;
  const transcript = cut ? full.slice(0, MAX_CHARS) : full;

  let modeId: ModeId;
  let suggested: ModeId | null = meeting.modeSuggested;
  const current = requested ?? meeting.mode;
  if (current === "auto" || !isModeId(current)) {
    const cands = modesForLevel(meeting.level).filter((m) => !m.requiresLevel);
    try {
      const raw = await ai.json(classifySystem(cands), transcript.slice(0, 6000), 300);
      suggested = parseClassify(raw, cands);
    } catch {
      suggested = "general";
    }
    modeId = suggested;
  } else {
    modeId = current;
  }
  if (!modeAllowed(modeId, meeting.level)) return back("このレベルでは使えない要約モードです", 400);
  const mode = MODE_BY_ID[modeId];

  let raw: unknown;
  try {
    raw = await ai.json(
      summarySystem(mode),
      [
        `会議: ${meeting.title}（${meeting.meetingDate}）`,
        meeting.participants ? `参加者: ${meeting.participants}` : "",
        cut ? "※ 文字起こしが長いため、後半を省いて渡しています。" : "",
        "",
        "---- 文字起こし ----",
        transcript,
      ]
        .filter((x) => x !== "")
        .join("\n"),
      16000
    );
  } catch (e) {
    return back(e instanceof Error ? e.message.slice(0, 400) : "要約に失敗しました");
  }

  const summary = annotateSummary(parseSummary(raw, mode), transcript);
  await admin
    .from("mtg_meetings")
    .update({
      summary,
      ai_raw: raw as object,
      mode: modeId,
      mode_suggested: suggested,
      status: "summarized",
      ai_provider: ai.name,
      error: cut ? "文字起こしが長いため、後半を省いて要約しました" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", meeting.id);

  return NextResponse.json({ ok: true, mode: modeId });
}
