import { createAdmin } from "@/lib/supabase/admin";
import { redactNames } from "@yozan/core/line-redact";

type Admin = ReturnType<typeof createAdmin>;

/**
 * LINE Messaging API 直接送信（#80 / A-4解消）
 * トークンは gn_line_channels（0076・RLSポリシー無し=service_role専用）にのみ保存。
 * 公開リポジトリのため、トークンをコード・migration・envサンプルに書くことは禁止。
 * チャネル: staff=YOZANスタッフ連絡用 / gw_visitor=ビジター用 / gw_member=会員様用
 *
 * #243: LINEに出さないスタッフ名（staff.line_hidden）は、チャネルを引くときに一緒に読み、
 * linePush / lineBroadcast が送信直前に必ず伏せる。呼び出し側は LineChannel をそのまま渡す。
 * （トークン文字列だけを渡す旧シグネチャは廃止＝伏せ字を素通りさせない）
 */

export type LineChannel = {
  id: string;
  code: string;
  name: string;
  access_token: string;
  audience: "staff" | "customer";
  enabled: boolean;
  /** LINEの文面に出してはいけないスタッフ名（#243・staff.line_hidden） */
  hidden_names: string[];
};

/** LINEに出さないスタッフ名（#243）。名前はDBだけが持つ */
export async function getLineHiddenNames(admin: Admin, companyId: string): Promise<string[]> {
  const { data } = await admin
    .from("staff")
    .select("name")
    .eq("company_id", companyId)
    .eq("line_hidden", true)
    .is("deleted_at", null);
  return (data ?? []).map((s) => String(s.name)).filter(Boolean);
}

export async function getLineChannel(admin: Admin, companyId: string, code: string): Promise<LineChannel | null> {
  const [{ data }, hidden] = await Promise.all([
    admin
      .from("gn_line_channels")
      .select("id, code, name, access_token, audience, enabled")
      .eq("company_id", companyId)
      .eq("code", code)
      .eq("enabled", true)
      .maybeSingle(),
    getLineHiddenNames(admin, companyId),
  ]);
  if (!data) return null;
  return { ...(data as Omit<LineChannel, "hidden_names">), hidden_names: hidden };
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

/** 送信直前の伏せ字（#243）。どの経路でもここを通る */
export function forLine(ch: LineChannel, text: string): string {
  return redactNames(text, ch.hidden_names).slice(0, 4900);
}

/** 公式アカウントの全友だちへ一斉配信（顧客向け掘り起こし等） */
export async function lineBroadcast(ch: LineChannel, text: string): Promise<void> {
  await lineApi(ch.access_token, "message/broadcast", { messages: [{ type: "text", text: forLine(ch, text) }] });
}

/** グループ/ユーザーへのプッシュ（スタッフグループ等） */
export async function linePush(ch: LineChannel, to: string, text: string): Promise<void> {
  await lineApi(ch.access_token, "message/push", { to, messages: [{ type: "text", text: forLine(ch, text) }] });
}
