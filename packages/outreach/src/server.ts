// 営業メール送信の本体。Vercel Cron から呼ばれ、PCが閉じていても進む唯一の入口。
//
// 流れ: 設定確認 → 自動停止の判定 → 送信対象の抽出 → policy で1件ずつ判定 → 送信 → 記録
//
// 設計の要点
//  - **送る前に必ず policy.decideSend を通す**。ここを迂回する経路を作らない。
//  - 送信は1通ずつ間隔を空ける。まとめて投げると受信側にスパム送信と見なされる。
//  - 送信直後に out_messages を書く。書く前に落ちると「送ったのに記録が無い」＝二重送信の元になるので、
//    先に queued 行を作ってから送り、結果で更新する（記録が先・送信が後）。

import type { SupabaseClient } from "@supabase/supabase-js";
import { composeEmail, DEFAULT_TEMPLATES, pickTemplate } from "./compose";
import { dailyCap, decideSend, normalizeEmail, shouldPause } from "./policy";
import { sendMail } from "./resend";
import type { CompanyIdentity, OutSettings, SendCandidate, SkipReason, TemplateRow } from "./types";

export interface OutreachOptions {
  /** 送信元アプリの公開URL（配信停止リンクの組み立てに使う） */
  baseUrl: string;
  /** デモ配信URLの組み立て（demo-sales の /d/[token]） */
  demoBaseUrl: string;
  budgetMs?: number;
  /** 1通ごとの間隔 */
  delayMs?: number;
  /** この点数未満は送らない */
  minScore?: number;
  env?: Record<string, string | undefined>;
  /** true なら実際には送らず、判定と文面だけ作って返す（初回確認用） */
  dryRun?: boolean;
}

export interface OutreachResult {
  sent: number;
  skipped: Record<string, number>;
  paused: boolean;
  pauseReason?: string;
  dailyCap: number;
  sentToday: number;
  errors: string[];
  preview?: { to: string; subject: string; text: string }[];
}

const DEFAULTS = { budgetMs: 200_000, delayMs: 3000, minScore: 55 };

/** JSTの今日（YYYY-MM-DD）。サーバーはUTCなので必ず変換する（[[jst-date-rule]]） */
export function jstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function runOutreach(admin: SupabaseClient, companyId: string, opts: OutreachOptions): Promise<OutreachResult> {
  const o = { ...DEFAULTS, ...opts };
  const env = opts.env ?? (typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {});
  const startedAt = Date.now();
  const left = () => o.budgetMs - (Date.now() - startedAt);

  const skipped: Record<string, number> = {};
  const errors: string[] = [];
  const preview: { to: string; subject: string; text: string }[] = [];
  let sent = 0;

  // ---- 設定 ----------------------------------------------------------
  const { data: st } = await admin.from("out_settings").select("*").eq("company_id", companyId).maybeSingle();
  const settings = (st ?? {
    company_id: companyId,
    enabled: false,
    from_email: null,
    from_name: "株式会社YOZAN",
    reply_to: null,
    daily_cap_max: 50,
    warmup_start: null,
    send_hour_jst: 10,
    paused_at: null,
    paused_reason: null,
  }) as OutSettings;

  const today = jstToday();
  const cap = dailyCap(settings.warmup_start, today, settings.daily_cap_max);

  // ---- 自動停止の判定（送る前に、直近の反応を見る） --------------------
  const { data: recent } = await admin
    .from("out_messages")
    .select("status")
    .eq("company_id", companyId)
    .in("status", ["sent", "delivered", "opened", "bounced", "complained"])
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (recent ?? []) as { status: string }[];
  const stats = {
    sent: rows.length,
    bounced: rows.filter((r) => r.status === "bounced").length,
    complained: rows.filter((r) => r.status === "complained").length,
  };
  const pause = shouldPause(stats);
  if (pause.pause && !settings.paused_at) {
    await admin
      .from("out_settings")
      .upsert({ company_id: companyId, paused_at: new Date().toISOString(), paused_reason: pause.reason, updated_at: new Date().toISOString() });
    settings.paused_at = new Date().toISOString();
    settings.paused_reason = pause.reason ?? null;
  }

  // ---- 今日すでに送った数 ---------------------------------------------
  const { count: sentTodayCount } = await admin
    .from("out_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("sent_at", `${today}T00:00:00+09:00`)
    .lte("sent_at", `${today}T23:59:59+09:00`);
  let sentToday = sentTodayCount ?? 0;

  const baseResult = (): OutreachResult => ({
    sent,
    skipped,
    paused: Boolean(settings.paused_at),
    pauseReason: settings.paused_reason ?? undefined,
    dailyCap: cap,
    sentToday,
    errors,
    preview: o.dryRun ? preview : undefined,
  });

  if (!settings.enabled || settings.paused_at) {
    skipped[settings.enabled ? "paused" : "disabled"] = 1;
    return baseResult();
  }
  if (sentToday >= cap) {
    skipped.daily_cap = 1;
    return baseResult();
  }

  // ---- 会社情報（法定表示） -------------------------------------------
  const { data: comp } = await admin.from("companies").select("name, settings").eq("id", companyId).single();
  const inv = ((comp?.settings as { invoice?: Record<string, string> })?.invoice ?? {}) as Record<string, string>;
  const company: CompanyIdentity = {
    companyName: inv.company_name || String(comp?.name ?? "株式会社YOZAN"),
    representative: inv.representative || "代表取締役 古川博庸",
    postalCode: inv.postal_code || "",
    address: inv.address || "",
  };
  if (!company.address) {
    // 住所が無いと法定表示を満たせない。送らずに止める（黙って住所なしで送らない）
    errors.push("会社の住所が未設定のため送信できません（companies.settings.invoice.address）");
    return baseResult();
  }

  // ---- テンプレート ----------------------------------------------------
  const { data: tplRows } = await admin
    .from("out_templates")
    .select("key,industry,subject,body,enabled,sort")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  let templates = (tplRows ?? []) as TemplateRow[];
  if (templates.length === 0) {
    // 初回は既定テンプレートを投入する（画面で編集できる状態にしてから使う）
    await admin.from("out_templates").insert(DEFAULT_TEMPLATES.map((t) => ({ ...t, company_id: companyId })));
    templates = DEFAULT_TEMPLATES.map((t) => ({ ...t, enabled: true })) as TemplateRow[];
  }

  // ---- 抑止リスト ------------------------------------------------------
  const { data: supRows } = await admin.from("out_suppressions").select("email,domain").eq("company_id", companyId);
  const suppressedEmails = new Set<string>();
  const suppressedDomains = new Set<string>();
  for (const r of (supRows ?? []) as { email: string | null; domain: string | null }[]) {
    if (r.email) suppressedEmails.add(r.email.toLowerCase());
    if (r.domain) suppressedDomains.add(r.domain.toLowerCase());
  }

  // ---- 送信対象 --------------------------------------------------------
  // 「デモが完成していて、まだ連絡していない先」をスコアの高い順に。
  const { data: cands } = await admin
    .from("dms_prospects")
    .select("id,name,industry,city,email,email_source,score,status,audit,improve_points")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("email", "is", null)
    .eq("status", "demo_done")
    .is("last_contact_on", null)
    .order("score", { ascending: false })
    .limit(100);

  const ids = ((cands ?? []) as { id: string }[]).map((c) => c.id);
  const { data: doneRows } = ids.length
    ? await admin.from("out_messages").select("prospect_id").eq("company_id", companyId).in("prospect_id", ids)
    : { data: [] as { prospect_id: string }[] };
  const alreadySent = new Set(((doneRows ?? []) as { prospect_id: string | null }[]).map((r) => r.prospect_id ?? ""));

  const fromAddr = settings.from_email ?? env.OUTREACH_FROM_EMAIL ?? "";
  const replyTo = settings.reply_to ?? env.OUTREACH_REPLY_TO ?? "info@yozan-group.jp";
  if (!fromAddr) {
    errors.push("送信元アドレス（from_email）が未設定です");
    return baseResult();
  }

  for (const row of (cands ?? []) as Record<string, unknown>[]) {
    if (left() < 15_000) break;
    if (sentToday >= cap) {
      skipped.daily_cap = (skipped.daily_cap ?? 0) + 1;
      break;
    }

    const audit = (row.audit as { noSolicit?: boolean } | null) ?? {};
    // 最新のデモ（配信トークン）を取る。無ければ送らない
    const { data: demo } = await admin
      .from("dms_demos")
      .select("id,token")
      .eq("prospect_id", String(row.id))
      .is("deleted_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const c: SendCandidate & { improvePoints: string | null; city: string | null } = {
      id: String(row.id),
      name: String(row.name),
      industry: String(row.industry),
      email: (row.email as string) ?? null,
      emailSource: (row.email_source as string) ?? null,
      score: (row.score as number) ?? null,
      noSolicit: Boolean(audit.noSolicit),
      status: String(row.status),
      hasDemo: Boolean(demo?.token),
      alreadySent: alreadySent.has(String(row.id)),
      improvePoints: (row.improve_points as string) ?? null,
      city: (row.city as string) ?? null,
    };

    const decision = decideSend(c, { settings, suppressedEmails, suppressedDomains, sentToday, dailyCap: cap, minScore: o.minScore });
    if (!decision.ok) {
      const key = (decision.reason ?? "unknown") as SkipReason;
      skipped[key] = (skipped[key] ?? 0) + 1;
      continue;
    }

    const template = pickTemplate(templates, c.industry);
    if (!template) {
      errors.push(`${c.name}: 使えるテンプレートがありません`);
      continue;
    }

    const email = normalizeEmail(c.email)!;
    const unsubToken = randomToken();
    const unsubUrl = `${o.baseUrl.replace(/\/$/, "")}/unsubscribe/${unsubToken}`;
    const demoUrl = `${o.demoBaseUrl.replace(/\/$/, "")}/d/${demo!.token}`;
    const mail = composeEmail({ template, prospect: c, company, demoUrl, unsubUrl, replyTo });

    if (o.dryRun) {
      preview.push({ to: email, subject: mail.subject, text: mail.text });
      continue;
    }

    // 記録が先・送信が後。逆にすると、記録前に落ちたときに「送ったのに記録が無い」＝
    // 次の実行で同じ先にもう一度送ってしまう。
    const { data: msg, error: insErr } = await admin
      .from("out_messages")
      .insert({
        company_id: companyId,
        prospect_id: c.id,
        demo_id: demo!.id,
        to_email: email,
        from_email: fromAddr,
        subject: mail.subject,
        body_text: mail.text,
        status: "queued",
        unsub_token: unsubToken,
        template_key: template.key,
        email_source: c.emailSource,
        scheduled_for: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !msg) {
      // 部分ユニーク索引（1営業先1通）に弾かれた場合もここに来る＝二重送信を構造的に防げている
      skipped.already_sent = (skipped.already_sent ?? 0) + 1;
      continue;
    }

    const res = await sendMail({
      apiKey: env.RESEND_API_KEY,
      from: `${settings.from_name} <${fromAddr}>`,
      to: email,
      replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      unsubUrl,
    });

    if (res.ok) {
      await admin.from("out_messages").update({ status: "sent", provider_id: res.id ?? null, sent_at: new Date().toISOString() }).eq("id", msg.id);
      await admin
        .from("dms_prospects")
        .update({ status: "contacted", last_contact_on: today })
        .eq("id", c.id);
      await admin.from("dms_activities").insert({
        company_id: companyId,
        prospect_id: c.id,
        kind: "email",
        content: `営業メールを自動送信: ${mail.subject}`,
        meta: { to: email, provider_id: res.id ?? null },
        created_by: "AI（自動送信）",
      });
      alreadySent.add(c.id);
      sent++;
      sentToday++;
      if (!settings.warmup_start) {
        await admin.from("out_settings").upsert({ company_id: companyId, warmup_start: today, updated_at: new Date().toISOString() });
        settings.warmup_start = today;
      }
    } else {
      await admin
        .from("out_messages")
        .update({ status: res.skipped ? "canceled" : "failed", error: res.error ?? null })
        .eq("id", msg.id);
      errors.push(`${c.name}: ${res.error ?? "送信失敗"}`);
      // APIキーが無い等の設定不備は全件同じ結果になるので、1件目で止める
      if (res.skipped) break;
    }

    await new Promise((r) => setTimeout(r, o.delayMs));
  }

  // 抑止リストへの追加（バウンス・苦情・配信停止）は webhook と配信停止ページが行う
  return baseResult();
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
