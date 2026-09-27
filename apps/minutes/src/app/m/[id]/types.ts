import type { Summary, Todo } from "@/lib/modes";

export type ViewMeeting = {
  id: string;
  level: "L1" | "L2" | "L3";
  levelWhere: string;
  source: "record" | "file" | "text";
  status: string;
  error: string | null;
  mode: string;
  modeSuggested: string | null;
  modeLabel: string | null;
  transcript: string | null;
  rawSpeakers: string[];
  speakers: Record<string, string>;
  summary: Summary | null;
  sections: { key: string; label: string }[];
  draftBody: string;
  todos: Todo[];
  unverified: number;
  confirmedAt: string | null;
  transcriptExpiresAt: string | null;
};

export type ViewSegment = { idx: number; status: string; error: string | null; hasAudio: boolean };

/** 文字起こしを最後まで進め、終わったら要約を投げる（画面を閉じても状態はDBが持っている） */
export async function driveTranscription(
  meetingId: string,
  onProgress: (msg: string) => void
): Promise<{ finalized: boolean; error?: string }> {
  for (let guard = 0; guard < 400; guard += 1) {
    let out: { done?: boolean; finalized?: boolean; busy?: boolean; error?: string; segment?: number };
    try {
      const r = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      out = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (r.status === 503 || r.status === 404) return { finalized: false, error: out.error };
    } catch {
      await new Promise((res) => setTimeout(res, 5000));
      continue;
    }
    if (out.done) return { finalized: Boolean(out.finalized) };
    if (out.busy) {
      onProgress("別の画面で処理中です…");
      await new Promise((res) => setTimeout(res, 5000));
      continue;
    }
    if (out.error) onProgress(`区間${(out.segment ?? 0) + 1}: ${out.error}`);
    else if (typeof out.segment === "number") onProgress(`区間${out.segment + 1}の文字起こしが終わりました`);
  }
  return { finalized: false, error: "処理が長すぎます。画面を開き直してください" };
}

export async function requestSummary(meetingId: string, mode?: string): Promise<{ error?: string }> {
  try {
    const r = await fetch("/api/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId, mode }),
    });
    const out = (await r.json().catch(() => ({}))) as { error?: string };
    return r.ok ? {} : { error: out.error ?? `HTTP ${r.status}` };
  } catch {
    return { error: "通信が切れました。画面を開き直すと続きから進みます" };
  }
}
