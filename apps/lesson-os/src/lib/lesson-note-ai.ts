import "server-only";

/**
 * レッスンの会話（音声）を文字起こしして、コメントの下書きにする（2026-08-28 ユーザー提案）
 *
 * なぜ Gemini か:
 *   **音声をそのまま渡せる**ので、文字起こしと要約を1回で済ませられる。
 *   swing-cortex ですでに GEMINI_API_KEY を使っているので、業者を増やさない。
 *   キーが無い環境では null を返すだけ＝録音は残り、後から要約し直せる。
 *
 * 大前提（トラックマン読み取り lib/trackman-ai.ts と同じ型）:
 *   **AIが出すのは下書き**。カルテと共有ページに出るのは、コーチが確認・修正した本文だけ。
 *   AIの生出力は ai_raw に残して、後から精度を検証できるようにする。
 *
 * 会話に無いことは書かせない:
 *   レッスンメモは「言った/言わない」になりやすい。聞き取れなかったところは
 *   埋めずに空で返させる（推測で埋めると、コーチが直せない嘘が混ざる）。
 */

const DEFAULT_MODEL = "gemini-3.5-flash";
/** 音声をそのままリクエストに載せる上限。これを超えるものは呼び出し側で弾く */
export const MAX_AUDIO_BYTES = 18 * 1024 * 1024;

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;

export type LessonSummary = {
  /** 今日やったこと（コーチが直したポイント） */
  today: string[];
  /** 次までの宿題・練習メニュー */
  homework: string[];
  /** 生徒本人の言葉（感覚・悩み）。会話に出てこなければ空 */
  studentWords: string[];
  /** 話に出たクラブ・番手 */
  clubs: string[];
  /** 次回みるところ */
  next: string[];
};

export type LessonNoteRead = {
  transcript: string;
  summary: LessonSummary;
  /** そのまま貼れるコメント下書き */
  body: string;
  raw: unknown;
  warning: string | null;
};

const EMPTY: LessonSummary = { today: [], homework: [], studentWords: [], clubs: [], next: [] };

const SYSTEM = [
  "あなたはゴルフスクールのコーチ助手。レッスン中の会話の録音を聞いて、カルテに残すメモの下書きを作る。",
  "厳守すること:",
  "- **録音で言われていないことは書かない。** 推測・一般論・アドバイスの追加は禁止。",
  "- 聞き取れないところは無理に埋めない。該当する項目が無ければ空配列にする。",
  "- 生徒本人が言った言葉（感覚・悩み・できた感じ）は、**言い回しをできるだけそのまま**残す。",
  "- コーチの指示は「何をどう直したか」の形にする（例: 「トップで右ひじが離れる → 体の前に置いたまま上げる」）。",
  "- 雑談・世間話・料金や予約の話は入れない。スイングとレッスンの中身だけ。",
  "- 個人の健康状態・家族の事情など、レッスンに関係のない私的な話は書き起こしにも要約にも入れない。",
  "- 話し手が コーチ か 生徒 か分かる範囲で書き分ける。分からなければ書き分けない。",
  "出力は次のJSONのみ（前置き・説明文なし）:",
  "{",
  '  "transcript": "会話の文字起こし。話者が分かれば「コーチ:」「生徒:」を行頭に付ける",',
  '  "summary": {',
  '    "today": ["今日直したこと"],',
  '    "homework": ["次までの宿題・練習メニュー"],',
  '    "studentWords": ["生徒本人の言葉"],',
  '    "clubs": ["話に出たクラブ・番手"],',
  '    "next": ["次回みるところ"]',
  "  },",
  '  "body": "カルテにそのまま貼れる本文。200〜400字。見出しなしの文章で、今日直したこと→本人の感覚→次までの宿題 の順"',
  "}",
].join("\n");

const strArr = (v: unknown, max = 8): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, max)
    : [];

/**
 * @param audio 音声の生バイト（webm / mp4 / m4a など）
 * @param mime  Content-Type。codecs パラメータは呼び出し側で落としておくこと（#153 の教訓）
 * @param styleSamples そのコーチが過去に書いたコメント。文体を寄せるための見本にする
 */
export async function readLessonAudio(
  audio: ArrayBuffer,
  mime: string,
  styleSamples: string[] = []
): Promise<LessonNoteRead | null> {
  const apiKey = geminiKey();
  if (!apiKey) return null;
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return { transcript: "", summary: EMPTY, body: "", raw: null, warning: "録音が長すぎて要約できませんでした" };
  }

  // モデル名は環境変数で差し替えられるようにしておく（音声対応モデルが変わっても再デプロイ不要）
  const model = process.env.LESSON_NOTE_MODEL || process.env.CORTEX_GEMINI_MODEL || DEFAULT_MODEL;
  const style = styleSamples.filter(Boolean).slice(0, 5);
  const user = [
    "この録音はゴルフレッスン中の会話です。上の指示にしたがって下書きを作ってください。",
    style.length
      ? ["", "このコーチが普段書いているコメントです。**言い回しと長さをこれに寄せてください**（内容は真似しない）:", ...style.map((s) => `---\n${s}`)].join("\n")
      : "",
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
        // 50分の音声だと処理に数分かかることがある
        signal: AbortSignal.timeout(240000),
      }
    );
    if (!res.ok) {
      // 何が起きたかを必ず持って帰る。「要約できませんでした」だけだと、
      // モデル名違い・キー不正・音声形式・上限超過のどれなのか現場で切り分けられない。
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return {
        transcript: "", summary: EMPTY, body: "",
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
      return { transcript: "", summary: EMPTY, body: "", raw: text, warning: "AIの返事を読み取れませんでした" };
    }

    const s = (parsed.summary ?? {}) as Record<string, unknown>;
    const summary: LessonSummary = {
      today: strArr(s.today),
      homework: strArr(s.homework),
      studentWords: strArr(s.studentWords),
      clubs: strArr(s.clubs, 6),
      next: strArr(s.next),
    };
    const transcript = typeof parsed.transcript === "string" ? parsed.transcript.slice(0, 40000) : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim().slice(0, 2000) : "";
    const empty = !transcript && !body && !summary.today.length;
    return {
      transcript,
      summary,
      body,
      raw: parsed,
      warning: empty ? "会話を聞き取れませんでした。マイクが遠い可能性があります" : null,
    };
  } catch {
    return null;
  }
}
