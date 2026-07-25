import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";

export const dynamic = "force-dynamic";

/**
 * LINE Messaging API webhook 受信（#81・A-4受信側）
 * URL: /api/webhooks/line/{code}  code = staff | gw_visitor | gw_member
 * 署名検証: x-line-signature = HMAC-SHA256(channel_secret, rawBody) base64
 * テキストメッセージを sec_inquiries(source='line') に取り込む
 * → 既存のCEO秘書パイプライン（AI下書き→ホーム判断フィード→承認）に自然合流。
 * 送信者のuserIdは proposed_event.line_user_id に保持（返信push用・#80 linePush）。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const raw = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  const admin = createAdmin();
  const { data: channel } = await admin
    .from("gn_line_channels")
    .select("id, company_id, code, name, channel_secret, audience")
    .eq("code", code)
    .eq("enabled", true)
    .maybeSingle();
  // チャネル不明・secret未設定は 200 で握る（LINE側の再送ループを避ける。中身は無視）
  if (!channel?.channel_secret) return NextResponse.json({ ok: true, ignored: "unknown channel" });

  const expected = createHmac("sha256", String(channel.channel_secret)).update(raw).digest();
  const given = Buffer.from(signature, "base64");
  const valid = expected.length === given.length && timingSafeEqual(expected, given);
  if (!valid) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let events: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(raw) as { events?: Array<Record<string, unknown>> };
    events = parsed.events ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  let stored = 0;
  for (const ev of events) {
    if (ev.type !== "message") continue;
    const msg = (ev.message ?? {}) as Record<string, unknown>;
    if (msg.type !== "text") continue;
    const text = String(msg.text ?? "").trim();
    if (!text) continue;
    const source = (ev.source ?? {}) as Record<string, unknown>;
    const userId = source.userId ? String(source.userId) : null;

    // 重複配送はLINE仕様上あり得る → message.id をexternal_idにして既存ならskip
    const externalId = `line:${String(msg.id ?? "")}`;
    const { data: dup } = await admin
      .from("sec_inquiries")
      .select("id")
      .eq("company_id", channel.company_id)
      .eq("external_id", externalId)
      .maybeSingle();
    if (dup) continue;

    await admin.from("sec_inquiries").insert({
      company_id: channel.company_id,
      source: "line",
      external_id: externalId,
      inquiry_type: text.includes("体験") ? "trial" : "general",
      priority: text.includes("体験") ? "high" : "normal",
      from_name: null,
      subject: `LINE返信（${channel.name}）: ${text.slice(0, 40)}`,
      snippet: text.slice(0, 500),
      received_at: new Date(Number(ev.timestamp ?? Date.now())).toISOString(),
      status: "new",
      proposed_event: { line_user_id: userId, line_channel: channel.code },
    });
    stored += 1;

    if (text.includes("体験")) {
      await logEvent(String(channel.company_id), {
        event_type: "sales.trial_reply",
        title: `体験希望のLINE返信を受信（${channel.name}）`,
        source: "line_webhook",
        source_type: "ai",
      });
    }
  }

  return NextResponse.json({ ok: true, stored });
}

/** LINEコンソールの「検証」ボタンはGETではなくPOST空イベントを送るが、念のためGETにも200を返す */
export function GET() {
  return NextResponse.json({ ok: true });
}
