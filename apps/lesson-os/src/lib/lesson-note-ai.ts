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
  /** そのまま貼れるコメント下書き（先生の記録・先生の言葉のまま） */
  body: string;
  /**
   * お客様への説明の下書き（2026-09-03 ユーザー依頼）。
   * 先生の記録とは**別に**作る。中身は同じ今日の会話だが、宛先が違う:
   *   body   = 先生が読む記録（専門用語のまま・箇条書き的でよい）
   *   client = お客様が読む説明（専門用語を噛み砕く・「〜しましょう」）
   * 同じ1回の呼び出しで両方作らせる＝AIを2回呼ばないので待ち時間が増えない。
   */
  client: string;
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
  "",
  "本文は2つ作る。**どちらも今日の会話に出たことだけ**で書く（新しい助言を足さない）:",
  "  body   = 先生がカルテで読む記録。先生の言い回しのまま。専門用語はそのまま使ってよい。",
  "  client = **そのお客様本人**に見せる説明。次の決まりを守る:",
  "    ・お客様に語りかける文体（「〜しましょう」「〜がよくなりました」）。150〜250字。",
  "    ・専門用語は必ず言い換えるか、ひとこと説明を付ける（例: フェースの向き＝クラブの面の向き）。",
  "    ・「今日できるようになったこと」→「まだ残っている課題」→「次までにやること」の順。",
  "    ・お客様を評価・否定しない。できていないことも「次の一歩」の形で書く。",
  "    ・録音に無い助言・数値・約束は書かない。会話が短くて書けないなら空文字にする。",
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
  '  "body": "カルテにそのまま貼れる本文。200〜400字。見出しなしの文章で、今日直したこと→本人の感覚→次までの宿題 の順",',
  '  "client": "お客様に見せる説明。150〜250字。上の決まりに従う"',
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
    return { transcript: "", summary: EMPTY, body: "", client: "", raw: null, warning: "録音が長すぎて要約できませんでした" };
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
        transcript: "", summary: EMPTY, body: "", client: "",
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
      return { transcript: "", summary: EMPTY, body: "", client: "", raw: text, warning: "AIの返事を読み取れませんでした" };
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
    const client = typeof parsed.client === "string" ? parsed.client.trim().slice(0, 2000) : "";
    const empty = !transcript && !body && !summary.today.length;
    return {
      transcript,
      summary,
      body,
      client,
      raw: parsed,
      warning: empty ? "会話を聞き取れませんでした。マイクが遠い可能性があります" : null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 店のメソッド（AIカルテナレッジ）への紐づけ                          */
/*                                                                      */
/* ここが設計の要（2026-08-28）:                                        */
/*   AIに文章を書かせるのではなく、**分類だけさせる**。                 */
/*   本文はコーチの言葉のまま。AIの仕事は「今日の会話が、うちの店の      */
/*   どの症状・どの確認項目の話だったか」を言い当てることだけ。          */
/*                                                                      */
/*   これで初めて、今日のレッスンが取り込み済みの28,842件と同じ土俵に    */
/*   乗る（「この生徒はすくい打ちが3か月で4回」が出せるようになる）。   */
/* ------------------------------------------------------------------ */

export type SymptomRef = { id: string; name: string; category: string | null; flight: string | null; tags: string[] };
export type CheckpointRef = { id: string; symptomId: string; title: string };

export type SymptomMatch = {
  symptomId: string;
  checkpointId: string | null;
  /** そう判断した根拠になった会話の一節。コーチが○×を付けるために出す */
  quote: string;
  /** 0〜100 */
  confidence: number;
};

const MATCH_SYSTEM = [
  "あなたはゴルフスクールの記録係。レッスンの会話メモを読んで、**その店で使っている症状の一覧**の中から",
  "実際に話に出たものだけを選ぶ。",
  "厳守すること:",
  "- **一覧に無いものは作らない。** 必ず渡された id をそのまま返す。",
  "- 会話で触れられていない症状は選ばない。**「近いから」で選ばない。**",
  "- 迷ったら選ばない。空配列でよい。あとでコーチが手で足せる。",
  "- 1つの症状につき、確認項目（checkpoint）まで特定できるときだけ checkpointId を入れる。分からなければ null。",
  "- quote には、そう判断した根拠になった会話の一節を**原文のまま**短く入れる（作文しない）。",
  "- confidence は、会話ではっきり触れられていれば80以上、示唆どまりなら50前後にする。",
  "出力は次のJSONのみ:",
  '{ "matches": [ { "symptomId": "...", "checkpointId": "... または null", "quote": "...", "confidence": 0 } ] }',
].join("\n");

/** 症状の紐づけ。ナレッジが無い会社では空配列（画面は手でタグ付けできる） */
export async function matchSymptoms(
  text: string,
  symptoms: SymptomRef[],
  checkpoints: CheckpointRef[]
): Promise<SymptomMatch[]> {
  const apiKey = geminiKey();
  if (!apiKey || !symptoms.length || !text.trim()) return [];
  const model = process.env.LESSON_NOTE_MODEL || process.env.CORTEX_GEMINI_MODEL || DEFAULT_MODEL;

  const byId = new Map(symptoms.map((s) => [s.id, s]));
  const list = symptoms
    .map((s) => {
      const cps = checkpoints.filter((c) => c.symptomId === s.id).map((c) => `    - ${c.id} : ${c.title}`);
      const head = `- ${s.id} : ${s.name}${s.category ? `（${s.category}）` : ""}${s.flight ? ` 球筋:${s.flight}` : ""}${s.tags.length ? ` [${s.tags.join(",")}]` : ""}`;
      return cps.length ? `${head}\n${cps.join("\n")}` : head;
    })
    .join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: MATCH_SYSTEM }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: `【この店で使っている症状と確認項目】\n${list}\n\n【今日のレッスンの会話メモ】\n${text.slice(0, 20000)}` },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 4000, temperature: 0, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(90000),
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const out = (json.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!out) return [];
    const parsed = JSON.parse(out) as { matches?: unknown };
    if (!Array.isArray(parsed.matches)) return [];

    const cpOk = new Set(checkpoints.map((c) => c.id));
    const seen = new Set<string>();
    const matches: SymptomMatch[] = [];
    for (const raw of parsed.matches) {
      const m = raw as Record<string, unknown>;
      const symptomId = String(m.symptomId ?? "");
      // **一覧に無いIDは捨てる**（AIが作った症状をDBに入れない）
      if (!byId.has(symptomId)) continue;
      const cp = typeof m.checkpointId === "string" && cpOk.has(m.checkpointId) ? m.checkpointId : null;
      const key = `${symptomId}/${cp ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const conf = Number(m.confidence);
      matches.push({
        symptomId,
        checkpointId: cp,
        quote: typeof m.quote === "string" ? m.quote.trim().slice(0, 300) : "",
        confidence: isFinite(conf) ? Math.max(0, Math.min(100, Math.round(conf))) : 50,
      });
      if (matches.length >= 12) break;
    }
    return matches;
  } catch {
    return [];
  }
}
