// Resend 送信アダプタと Webhook の読み取り。
//
// 送信そのものは reserve-os の sendEmail（#31）と同じ叩き方だが、営業メールでは
// 「送った後に何が起きたか」を必ず持ち帰る必要があるので、message id を返す形にしている。
// これが無いと、届かなかった・迷惑報告された、が観測できず自動停止も効かない。

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** APIキー未設定などで送らなかった場合。失敗とは区別する */
  skipped?: boolean;
}

export interface SendArgs {
  apiKey?: string;
  from: string; // "株式会社YOZAN <web@send.yozan-group.jp>"
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  /** ワンクリック配信停止。受信側の「配信停止」ボタンに使われ、迷惑報告を減らす */
  unsubUrl?: string;
}

export async function sendMail(args: SendArgs): Promise<SendResult> {
  if (!args.apiKey) return { ok: false, skipped: true, error: "RESEND_API_KEY 未設定" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        reply_to: args.replyTo,
        subject: args.subject,
        text: args.text,
        html: args.html,
        // RFC 8058。Gmail/Yahoo は一覧上に「配信停止」ボタンを出す。
        // 押しやすい停止導線を用意するほど「迷惑メール報告」が減る＝ドメインの信用が守れる。
        headers: args.unsubUrl
          ? {
              "List-Unsubscribe": `<${args.unsubUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, error: `${res.status} ${body.message ?? body.name ?? ""}`.trim() };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** Resend Webhook のイベント種別 → out_messages の状態・日時列 */
const EVENT_MAP: Record<string, { status: string; at: string }> = {
  "email.sent": { status: "sent", at: "sent_at" },
  "email.delivered": { status: "delivered", at: "delivered_at" },
  "email.opened": { status: "opened", at: "opened_at" },
  "email.bounced": { status: "bounced", at: "bounced_at" },
  "email.complained": { status: "complained", at: "complained_at" },
  "email.delivery_delayed": { status: "sent", at: "sent_at" },
};

export interface WebhookUpdate {
  providerId: string;
  status: string;
  atColumn: string;
  /** 抑止リストに載せるべきか（バウンス・苦情） */
  suppress: boolean;
  email: string | null;
}

/**
 * Webhookのペイロードを、DBに書ける形に読み替える（純粋関数）。
 * 未知のイベントは null を返す＝知らないイベントで状態を壊さない。
 */
export function parseWebhook(payload: unknown): WebhookUpdate | null {
  const p = payload as { type?: string; data?: { email_id?: string; to?: string[] | string } } | null;
  if (!p?.type || !p.data) return null;
  const map = EVENT_MAP[p.type];
  if (!map) return null;
  const providerId = p.data.email_id;
  if (!providerId) return null;
  const to = Array.isArray(p.data.to) ? p.data.to[0] : p.data.to;
  return {
    providerId,
    status: map.status,
    atColumn: map.at,
    // 届かない・嫌がられたアドレスへ二度と送らない。これを自動でやらないと同じ失敗を繰り返す
    suppress: p.type === "email.bounced" || p.type === "email.complained",
    email: to ? to.toLowerCase() : null,
  };
}

/**
 * 状態の後戻りを防ぐ順序。
 * Webhookは順不同で届くので、delivered の後に sent が来ても状態を戻さない。
 */
const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, opened: 3, bounced: 4, complained: 5, failed: 4, canceled: 9 };
export function isForwardTransition(current: string, next: string): boolean {
  return (RANK[next] ?? 0) > (RANK[current] ?? 0);
}
