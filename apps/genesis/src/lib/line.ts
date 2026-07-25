import { createAdmin } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdmin>;

/**
 * LINE Messaging API 直接送信（#80 / A-4解消）
 * トークンは gn_line_channels（0076・RLSポリシー無し=service_role専用）にのみ保存。
 * 公開リポジトリのため、トークンをコード・migration・envサンプルに書くことは禁止。
 * チャネル: staff=YOZANスタッフ連絡用 / gw_visitor=ビジター用 / gw_member=会員様用
 */

export type LineChannel = {
  id: string;
  code: string;
  name: string;
  access_token: string;
  audience: "staff" | "customer";
  enabled: boolean;
};

export async function getLineChannel(admin: Admin, companyId: string, code: string): Promise<LineChannel | null> {
  const { data } = await admin
    .from("gn_line_channels")
    .select("id, code, name, access_token, audience, enabled")
    .eq("company_id", companyId)
    .eq("code", code)
    .eq("enabled", true)
    .maybeSingle();
  return (data as LineChannel) ?? null;
}

async function lineApi(token: string, path: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://api.line.me/v2/bot/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LINE API ${path} 失敗: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
}

/** 公式アカウントの全友だちへ一斉配信（顧客向け掘り起こし等） */
export async function lineBroadcast(token: string, text: string): Promise<void> {
  await lineApi(token, "message/broadcast", { messages: [{ type: "text", text: text.slice(0, 4900) }] });
}

/** グループ/ユーザーへのプッシュ（スタッフグループ等） */
export async function linePush(token: string, to: string, text: string): Promise<void> {
  await lineApi(token, "message/push", { to, messages: [{ type: "text", text: text.slice(0, 4900) }] });
}
