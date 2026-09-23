/**
 * LINE Messaging API への送信口（#80 → #273 で core へ移動）
 *
 * ★ 送信の口はここ1つだけ
 *   genesis だけでなく member-os からも送るようになったので（ドリンク注文の通知・#273）、
 *   アプリごとに fetch を書くと #243 の伏せ字を素通りする経路が増える。
 *   admin クライアントを引数で受け取る形にして、どのアプリからも同じ関数を通す。
 *
 * トークンは gn_line_channels（0076・RLSポリシー無し＝service_role専用）にのみ置く。
 * 公開リポジトリなので、トークンをコード・migration・envサンプルに書くことは禁止。
 * チャネル: staff=YOZANスタッフ連絡用 / gw_visitor=ビジター用 / gw_member=会員様用
 *
 * #243: LINEに出してはいけないスタッフ名（staff.line_hidden）はチャネルと一緒に読み、
 * linePush / lineBroadcast が送信直前に必ず伏せる。呼び出し側は LineChannel をそのまま渡す。
 */
import { redactNames } from "./line-redact";

/** SupabaseClient の型は巨大で構造照合すると TS2589 で落ちる（frank-lesson-tickets と同方針） */
type SupabaseAdminLike = object;
type Row = Record<string, unknown>;
type Res<T> = PromiseLike<{ data: T; error: { message: string } | null }>;
type SelectChain = {
  eq(col: string, val: unknown): SelectChain;
  is(col: string, val: null): SelectChain;
  in(col: string, vals: unknown[]): SelectChain;
  maybeSingle(): Res<Row | null>;
} & PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
type Admin = {
  from(table: string): { select(cols: string): SelectChain; insert(row: Row | Row[]): Res<null> };
};
const db = (a: SupabaseAdminLike) => a as unknown as Admin;

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

/** LINEに出さないスタッフ名（#243）。名前はDBだけが持つ＝コードに書かない */
export async function getLineHiddenNames(admin: SupabaseAdminLike, companyId: string): Promise<string[]> {
  const { data } = await db(admin)
    .from("staff")
    .select("name")
    .eq("company_id", companyId)
    .eq("line_hidden", true)
    .is("deleted_at", null);
  return (data ?? []).map((s) => String(s.name)).filter(Boolean);
}

export async function getLineChannel(
  admin: SupabaseAdminLike,
  companyId: string,
  code: string,
): Promise<LineChannel | null> {
  const [{ data }, hidden] = await Promise.all([
    db(admin)
      .from("gn_line_channels")
      .select("id, code, name, access_token, audience, enabled")
      .eq("company_id", companyId)
      .eq("code", code)
      .eq("enabled", true)
      .maybeSingle(),
    getLineHiddenNames(admin, companyId),
  ]);
  if (!data) return null;
  return { ...(data as unknown as Omit<LineChannel, "hidden_names">), hidden_names: hidden };
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
