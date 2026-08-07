// Resend からの配信結果通知（#111）。
//
// これが無いと「送った」までしか分からず、届かなかった・迷惑報告された が観測できない。
// 観測できなければ自動停止（キルスイッチ）も効かないので、送信と同時に必ず用意する。
//
// 署名検証: RESEND_WEBHOOK_SECRET（Svix形式）。未設定なら検証をスキップするが、
// その場合でも「未知の provider_id は無視する」ので、荒らされても他人のデータは動かせない。

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdmin } from "@yozan/core/supabase/admin";
import { isForwardTransition, parseWebhook } from "@yozan/outreach/resend";

export const dynamic = "force-dynamic";

/** Svix署名の検証。secret は "whsec_xxx" 形式（base64部分をHMACの鍵に使う） */
function verify(raw: string, headers: Headers, secret?: string): boolean {
  if (!secret) return true; // 未設定時は検証しない（provider_id 照合で被害を限定）
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  // リプレイ防止: 5分より古い通知は受け付けない
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sig
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean)
    .some((given) => {
      const a = Buffer.from(given);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(raw, req.headers, process.env.RESEND_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const upd = parseWebhook(payload);
  // 知らないイベントは 200 で受け流す（Resend側に再送させ続けない）
  if (!upd) return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdmin();
  const { data: msg } = await admin
    .from("out_messages")
    .select("id, company_id, status, prospect_id, to_email")
    .eq("provider_id", upd.providerId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ ok: true, unknown: true });

  // 状態は後戻りさせない（Webhookは順不同で届く）
  if (isForwardTransition(msg.status, upd.status)) {
    await admin
      .from("out_messages")
      .update({ status: upd.status, [upd.atColumn]: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", msg.id);
  } else {
    await admin.from("out_messages").update({ [upd.atColumn]: new Date().toISOString() }).eq("id", msg.id);
  }

  // 届かない・嫌がられたアドレスは二度と使わない
  if (upd.suppress) {
    const email = (upd.email ?? msg.to_email ?? "").toLowerCase();
    if (email) {
      await admin
        .from("out_suppressions")
        .upsert(
          { company_id: msg.company_id, email, reason: upd.status === "complained" ? "complained" : "bounced" },
          { onConflict: "company_id,email" },
        );
    }
    if (msg.prospect_id) {
      await admin
        .from("dms_prospects")
        .update({ status: upd.status === "complained" ? "lost" : "unreachable", lost_reason: upd.status === "complained" ? "先方が受信拒否" : null })
        .eq("id", msg.prospect_id);
    }
  }

  return NextResponse.json({ ok: true });
}
