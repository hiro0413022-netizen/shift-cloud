import { NextResponse } from "next/server";
import { getGenesisActor } from "@/lib/auth";

/* ============================================================
   JARVIS の声（DECISIONS #182）

   ユーザー判断: 「高品質な音声（API課金あり）」。
   ブラウザ内蔵の speechSynthesis は無料だが日本語が明らかに機械音で、
   ホームに常駐させる声としては聞き続けられない、という理由で外部TTSを採る。

   業者を増やさない方針（#179 と同じ）:
     1. GEMINI_API_KEY があれば Gemini TTS を使う。
        → swing-cortex / lesson-os で既に使っているキーで、新規契約が要らない。
        → 返ってくるのは 24kHz 16bit mono の生PCMなので、ここでWAVヘッダを付ける。
     2. OPENAI_API_KEY があればそちらを優先（gpt-4o-mini-tts / mp3）。
        声の質は現状こちらが一段上なので、入れたら自動で切り替わる。
     3. どちらも無ければ 204 を返す。
        → 画面側はブラウザ内蔵の音声にフォールバックするので、
          キー未設定でも JARVIS は必ず喋る（無音にならない）。

   コスト: 1発話はおよそ50〜100文字。1日100発話でも月数百円規模。
   読み上げは画面右上のスピーカーで切れる（localStorage に記憶）。
   ============================================================ */

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CHARS = 600;

/** JARVISの声色。低め・落ち着き・執事。env で差し替えられるようにする（モデル名が変わっても再デプロイ不要） */
const GEMINI_MODEL = process.env.JARVIS_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_VOICE = process.env.JARVIS_VOICE || "Charon"; // 低く落ち着いた声
const OPENAI_MODEL = process.env.JARVIS_OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_VOICE = process.env.JARVIS_OPENAI_VOICE || "onyx";

const STYLE = "落ち着いた低い声で、有能な執事のように、抑揚を抑えて丁寧に読み上げてください:";

export async function POST(req: Request) {
  // 声も社内情報なので、ログインしている人にしか返さない。
  // fetch から呼ぶので redirect ではなく 401 を返す（画面側はブラウザ音声へ落ちる）
  const actor = await getGenesisActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = String(body.text ?? "").trim().slice(0, MAX_CHARS);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });

  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    const mp3 = await speakOpenAi(text, openai);
    if (mp3) return audio(mp3, "audio/mpeg");
  }

  const gemini = process.env.GEMINI_API_KEY;
  if (gemini) {
    const wav = await speakGemini(text, gemini);
    if (wav) return audio(wav, "audio/wav");
  }

  // キーが無い / 失敗した → 画面側がブラウザ内蔵音声で喋る
  return new NextResponse(null, { status: 204 });
}

function audio(buf: ArrayBuffer | Uint8Array, type: string) {
  const body = buf instanceof Uint8Array ? new Uint8Array(buf) : new Uint8Array(buf);
  return new NextResponse(body as unknown as BodyInit, {
    status: 200,
    headers: { "content-type": type, "cache-control": "no-store" },
  });
}

async function speakOpenAi(text: string, apiKey: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        voice: OPENAI_VOICE,
        input: text,
        instructions: "落ち着いた低い声。有能な執事のように、抑揚を抑えて丁寧に。早口にしない。",
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function speakGemini(text: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${STYLE}\n${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } },
          },
        }),
        signal: AbortSignal.timeout(25000),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
    };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const b64 = part?.inlineData?.data;
    if (!b64) return null;
    const pcm = Buffer.from(b64, "base64");
    // mimeType 例: audio/L16;codec=pcm;rate=24000
    const rate = Number(/rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "")?.[1] ?? 24000);
    return wav(pcm, rate);
  } catch {
    return null;
  }
}

/** 生PCM(16bit mono) に WAV ヘッダを付ける。<audio> はヘッダが無いと再生できない */
function wav(pcm: Buffer, sampleRate: number): Uint8Array {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return new Uint8Array(Buffer.concat([header, pcm]));
}
