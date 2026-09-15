import { NextResponse } from "next/server";
import { getGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/* ============================================================
   JARVIS の耳（#245・2026-09-15）

   これまでは Chrome の音声認識（Web Speech API）の文字をそのまま使っていた。
   店名・スタッフ名・ゴルフ用語をよく聞き違え、しかもブラウザごとに精度が違う。
   → 録った音声（16kHz mono WAV）をここへ送り、Gemini に文字にしてもらう。
     会社の固有名詞（店舗・スタッフ・プラン名）をヒントとして渡すので、
     「フランク」「うらら」「宝塚」のような語が正しく出る。

   業者を増やさない（#179/#182 と同じ）: lesson-os / swing-cortex と同じ GEMINI_API_KEY。
   キーが無いか失敗したら 204 → 画面側はブラウザの認識結果（保険）を使う。
   音声はどこにも保存しない（DB・Storage に書かない）。
   ============================================================ */

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 2 * 1024 * 1024; // 16kHz×16bit で約60秒
const MODEL = process.env.JARVIS_STT_MODEL || process.env.LESSON_NOTE_MODEL || "gemini-2.5-flash";

export async function POST(req: Request) {
  const actor = await getGenesisActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return new NextResponse(null, { status: 204 });

  const mime = req.headers.get("content-type") || "audio/wav";
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 2000) return NextResponse.json({ text: "" });
  if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "too_long" }, { status: 413 });

  const hints = await vocabulary(actor.companyId).catch(() => [] as string[]);
  const system = [
    "あなたは日本語の音声を文字に起こす係です。聞こえたとおりの日本語を、句読点を付けて1つの文章にしてください。",
    "話者は会社の経営者で、社内システム「GENESIS（ジェネシス）」に話しかけています。",
    "固有名詞は次の表記を優先してください: " + ["GENESIS", "ジェネシス", "GOLF WING", "FRANK GOLF", "フランク", "宝塚", "姫路", ...hints].join("、"),
    "音声に言葉が無い・雑音だけのときは空文字にしてください。要約や返事はしないでください。",
    '出力は JSON のみ: {"text":"..."}',
  ].join("\n");

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [
          {
            role: "user",
            parts: [{ inline_data: { mime_type: mime.split(";")[0], data: Buffer.from(buf).toString("base64") } }, { text: "この音声を文字にしてください。" }],
          },
        ],
        generationConfig: { maxOutputTokens: 400, temperature: 0, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return new NextResponse(null, { status: 204 });
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = (json.candidates ?? []).flatMap((c) => c.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    let text = "";
    try {
      const o = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { text?: string };
      text = String(o.text ?? "").trim();
    } catch {
      text = raw.replace(/^[{"\s]*text[":\s]*/, "").replace(/["}\s]*$/, "").trim();
    }
    return NextResponse.json({ text: text.slice(0, 500) });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

/** 聞き違えやすい固有名詞（店舗・在籍スタッフ・FRANKのプラン名）。多すぎると効かないので40語まで */
async function vocabulary(companyId: string): Promise<string[]> {
  const admin = createAdmin();
  const [stores, staff, plans] = await Promise.all([
    admin.from("stores").select("name").eq("company_id", companyId).is("deleted_at", null),
    admin.from("staff").select("name").eq("company_id", companyId).eq("status", "active").is("deleted_at", null).limit(25),
    admin.from("frunk_plans").select("name").eq("company_id", companyId).eq("active", true),
  ]);
  const names = [
    ...((stores.data ?? []) as { name: string }[]).map((s) => s.name),
    ...((staff.data ?? []) as { name: string }[]).map((s) => s.name),
    ...((plans.data ?? []) as { name: string }[]).map((s) => s.name),
  ]
    .map((n) => String(n ?? "").trim())
    .filter((n) => n.length >= 2);
  return Array.from(new Set(names)).slice(0, 40);
}
