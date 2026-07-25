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
    .select("id, company_id, code, name, channel_secret, access_token, audience")
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
    // グループ捕捉（#85・FRANK §3-5）: スタッフ用OAがグループに追加された瞬間、または
    // グループ内の発言を受けた瞬間に line_group_id を gn_line_groups へ自動登録する。
    // これでユーザーの作業は「OAをグループに招待するだけ」になる。
    if (channel.audience === "staff") {
      const src = (ev.source ?? {}) as Record<string, unknown>;
      const groupId = src.type === "group" && src.groupId ? String(src.groupId) : null;
      if (groupId && (ev.type === "join" || ev.type === "message" || ev.type === "memberJoined")) {
        try {
          const { data: existing } = await admin
            .from("gn_line_groups")
            .select("id, label")
            .eq("company_id", channel.company_id)
            .eq("line_group_id", groupId)
            .is("deleted_at", null)
            .maybeSingle();
          if (existing) {
            await admin.from("gn_line_groups").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
          } else {
            // グループ名を取得して自動ラベル＋店舗の自動マッピング（FRANK/WINGを名前で判定）
            let label = "新しいグループ（店舗ひも付け未設定）";
            try {
              const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
                headers: { Authorization: `Bearer ${String(channel.access_token)}` },
              });
              if (res.ok) {
                const sum = (await res.json()) as { groupName?: string };
                if (sum.groupName) label = sum.groupName;
              }
            } catch {
              /* 名前が取れなくても登録は続行 */
            }
            const upper = label.toUpperCase();
            const { data: storeRows } = await admin
              .from("stores")
              .select("id, name")
              .eq("company_id", channel.company_id)
              .is("deleted_at", null);
            const storeId =
              upper.includes("FRANK") || label.includes("フランク")
                ? (storeRows ?? []).find((s) => String(s.name).toUpperCase().includes("FRANK"))?.id ?? null
                : upper.includes("WING") || label.includes("ウィング") || label.includes("ウイング")
                  ? (storeRows ?? []).find((s) => String(s.name).toUpperCase().includes("WING"))?.id ?? null
                  : null;
            await admin.from("gn_line_groups").insert({
              company_id: channel.company_id,
              line_group_id: groupId,
              label,
              store_id: storeId,
              is_default: false,
              last_seen_at: new Date().toISOString(),
            });
            await logEvent(String(channel.company_id), {
              event_type: "staff.line_group_registered",
              title: `LINEグループを配信先に自動登録: ${label}`.slice(0, 120),
              source: "line_webhook",
              source_type: "system",
            });
          }
        } catch {
          /* グループ登録失敗でwebhook全体を落とさない */
        }
      }
    }

    if (ev.type !== "message") continue;
    // スタッフグループ内の雑談は問い合わせ化しない（グループ捕捉のみ・CEO Inboxを汚さない）
    {
      const src = (ev.source ?? {}) as Record<string, unknown>;
      if (channel.audience === "staff" && src.type === "group") continue;
    }
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
