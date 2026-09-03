import "server-only";
import type { StoreStyle } from "./method.ts";
import { styleLines } from "./method.ts";
import type { RawCandidate } from "./candidates.ts";

/**
 * レッスンの会話（音声）→ PGA NOTE に貼るコメント ＋ ナレッジ候補（2026-09-03）
 *
 * lesson-os の lib/lesson-note-ai.ts と同じ骨格（Gemini に音声をそのまま渡す）。
 * 違いは出口:
 *   lesson-os = その生徒のカルテ（生徒・動画に紐づく）
 *   ここ      = **PGA NOTE に貼るテキスト** ＋ **店の頭脳を太らせる材料**
 *
 * 大前提:
 *   - AIが出すのは下書き。人が直して保存したものだけが残る。
 *   - **ナレッジ本体には絶対に書かない。** candidates は候補として溜めるだけで、
 *     sc_symptoms / sc_checkpoints / sc_knowledge に入るのは人が採用したときだけ。
 *   - 会話に無いことは書かせない（推測で埋めると、コーチが直せない嘘が混ざる）。
 */

const DEFAULT_MODEL = "gemini-3.5-flash";
/** 音声をそのままリクエストに載せる上限 */
export const MAX_AUDIO_BYTES = 18 * 1024 * 1024;

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;

export type VoiceSummary = {
  /** 今日直したこと */
  today: string[];
  /** 次までの宿題・練習メニュー */
  homework: string[];
  /** 生徒本人の言葉（感覚・悩み） */
  points: string[];
  /** 話に出たクラブ・番手 */
  clubs: string[];
  /** 次回みるところ */
  next: string[];
};

export type VoiceNoteRead = {
  transcript: string;
  summary: VoiceSummary;
  /** PGA NOTE にそのまま貼るコメント */
  comment: string;
  /** 先生の手元の記録（任意・専門用語のまま） */
  coachNote: string;
  /** ナレッジ候補（**溜めるだけ**。本体には書かない） */
  candidates: RawCandidate[];
  raw: unknown;
  warning: string | null;
};

const EMPTY: VoiceSummary = { today: [], homework: [], points: [], clubs: [], next: [] };

const SYSTEM = [
  "あなたはゴルフスクールのコーチ助手。レッスン中の会話の録音を聞いて、レッスン記録の下書きを作る。",
  "厳守すること:",
  "- **録音で言われていないことは書かない。** 推測・一般論・アドバイスの追加は禁止。",
  "- 聞き取れないところは無理に埋めない。該当が無ければ空にする。",
  "- 雑談・世間話・料金や予約の話は入れない。スイングとレッスンの中身だけ。",
  "- 個人の健康状態・家族の事情など、レッスンに関係のない私的な話は書き起こしにも要約にも入れない。",
  "- 生徒の氏名は書かない（「お客様」と書く）。",
  "",
  "作るもの:",
  "  comment   = レッスン記録にそのまま貼る本文。150〜300字。",
  "              「今日できるようになったこと」→「まだ残っている課題」→「次までにやること」の順。",
  "              お客様に語りかける文体（「〜しましょう」）。評価・否定はしない。",
  "  coachNote = 先生の手元の記録。専門用語のままでよい。箇条書き的でよい。100〜200字。",
  "  knowledge = **この教室の指導内容として、記録に残す価値がありそうな指導の型**。",
  "              今日の会話の中でコーチが実際に言った「症状 → 原因 → 直し方 → ドリル」の組だけを拾う。",
  "              1回の録音で最大3件。無ければ空配列。**一般論・教科書的な内容は入れない。**",
  "              コーチが使った固有の言い方（ドリル名・独自の言い回し）はそのまま残す。",
  "出力は次のJSONのみ（前置き・説明文なし）:",
  "{",
  '  "transcript": "会話の文字起こし。話者が分かれば「コーチ:」「生徒:」を行頭に付ける",',
  '  "summary": { "today": [], "homework": [], "points": [], "clubs": [], "next": [] },',
  '  "comment": "レッスン記録に貼る本文",',
  '  "coachNote": "先生の手元の記録",',
  '  "knowledge": [',
  '    { "title": "確認項目の見出し（例: 前傾キープで三角形同調）",',
  '      "cause": "なぜそうなるか（コーチが言ったこと）",',
  '      "fix": "どう直すか（コーチが言ったこと）",',
  '      "drill": "ドリル名・練習メニュー。無ければ空文字",',
  '      "client": "お客様への言い方。無ければ空文字",',
  '      "quote": "そう判断した根拠になった会話の一節（原文のまま・短く）" }',
  "  ]",
  "}",
].join("\n");

const strArr = (v: unknown, max = 8): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, max)
    : [];

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * @param audio 音声の生バイト（webm / mp4 / m4a など）
 * @param mime  Content-Type。codecs パラメータは呼び出し側で落としておくこと（#153 の教訓）
 * @param style その店の言葉（sc_settings.style）。生成をこの店の語彙に寄せる
 */
export async function readVoiceNote(
  audio: ArrayBuffer,
  mime: string,
  style: StoreStyle | null
): Promise<VoiceNoteRead | null> {
  const apiKey = geminiKey();
  if (!apiKey) return null;
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return { transcript: "", summary: EMPTY, comment: "", coachNote: "", candidates: [], raw: null, warning: "録音が長すぎて要約できませんでした" };
  }

  const model = process.env.CORTEX_VOICE_MODEL || process.env.CORTEX_GEMINI_MODEL || DEFAULT_MODEL;
  const lines = styleLines(style);
  const user = [
    "この録音はゴルフレッスン中の会話です。上の指示にしたがって下書きを作ってください。",
    lines ? `\n【この教室の言葉】この語彙・言い回しに寄せてください（内容は真似しない）:\n${lines}` : "",
  ].join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { mime_type: mime, data: Buffer.from(audio).toString("base64") } },
                { text: user },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 16000, temperature: 0.2, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(240000),
      }
    );
    if (!res.ok) {
      // 何が起きたかを持って帰る。「要約できませんでした」だけだと現場で切り分けられない
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return {
        transcript: "", summary: EMPTY, comment: "", coachNote: "", candidates: [],
        raw: { status: res.status, detail },
        warning: `AIが応答しませんでした（HTTP ${res.status}）${detail ? `: ${detail}` : ""}`,
      };
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const text = (json.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { transcript: "", summary: EMPTY, comment: "", coachNote: "", candidates: [], raw: text, warning: "AIの返事を読み取れませんでした" };
    }

    const s = (parsed.summary ?? {}) as Record<string, unknown>;
    const summary: VoiceSummary = {
      today: strArr(s.today),
      homework: strArr(s.homework),
      points: strArr(s.points),
      clubs: strArr(s.clubs, 6),
      next: strArr(s.next),
    };
    const rawKnowledge = Array.isArray(parsed.knowledge) ? parsed.knowledge : [];
    const candidates: RawCandidate[] = rawKnowledge
      .slice(0, 3)
      .map((k) => {
        const o = (k ?? {}) as Record<string, unknown>;
        return {
          title: str(o.title, 60),
          cause: str(o.cause, 300),
          fix: str(o.fix, 400),
          drill: str(o.drill, 200) || null,
          client: str(o.client, 400) || null,
          quote: str(o.quote, 300) || null,
        };
      })
      .filter((k) => k.title && k.fix);

    const comment = str(parsed.comment, 2000);
    const transcript = str(parsed.transcript, 40000);
    const coachNote = str(parsed.coachNote, 2000);
    const empty = !transcript && !comment;
    return {
      transcript,
      summary,
      comment,
      coachNote,
      candidates,
      raw: parsed,
      warning: empty ? "会話を聞き取れませんでした。マイクが遠い可能性があります" : null,
    };
  } catch {
    return null;
  }
}
