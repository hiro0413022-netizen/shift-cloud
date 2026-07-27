import type {
  AdminClient,
  RecordInput,
  RecordResult,
  RegisterLinkInput,
  TrackLink,
  TrackSession,
} from "./types";

/**
 * サーバー側API（service_role クライアントを引数で受け取る＝アプリ非依存）。
 * 呼び出し例:
 *   import { createAdmin } from "@yozan/core/supabase/admin";
 *   await registerLink(createAdmin(), { ... });
 */

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number => (v == null ? 0 : Number(v));

const toLink = (r: Row): TrackLink => ({
  id: String(r.id),
  companyId: String(r.company_id),
  app: String(r.app),
  resourceType: String(r.resource_type),
  resourceId: String(r.resource_id),
  token: String(r.token),
  label: s(r.label),
  href: s(r.href),
  firstViewedAt: s(r.first_viewed_at),
  lastViewedAt: s(r.last_viewed_at),
  viewCount: n(r.view_count),
  totalSeconds: n(r.total_seconds),
  notifiedAt: s(r.notified_at),
});

const toSession = (r: Row): TrackSession => ({
  id: String(r.id),
  linkId: String(r.link_id),
  isInternal: Boolean(r.is_internal),
  startedAt: String(r.started_at),
  lastSeenAt: String(r.last_seen_at),
  seconds: n(r.seconds),
  pageViews: n(r.page_views),
  pages: Array.isArray(r.pages) ? (r.pages as string[]) : [],
  firstPage: s(r.first_page),
  referrer: s(r.referrer),
  device: s(r.device),
});

const SELECT_LINK =
  "id, company_id, app, resource_type, resource_id, token, label, href, first_viewed_at, last_viewed_at, view_count, total_seconds, notified_at";

/**
 * 配布リンクを登録（同じ資源なら更新）。
 * 冪等なので配信のたびに呼んでよい。集計値（閲覧数・初回開封）は保持される。
 *
 * ※ 一意インデックスが部分（deleted_at is null）のため upsert ではなく
 *   参照→更新/挿入で実装している。呼ばれるのは生成時・初回配信時だけなので往復増は許容。
 */
export async function registerLink(
  admin: AdminClient,
  input: RegisterLinkInput
): Promise<TrackLink | null> {
  const patch = {
    company_id: input.companyId,
    app: input.app,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    token: input.token,
    label: input.label ?? null,
    href: input.href ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: found } = await admin
    .from("trk_links")
    .select(SELECT_LINK)
    .eq("app", input.app)
    .eq("resource_type", input.resourceType)
    .eq("resource_id", input.resourceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (found) {
    const { data } = await admin
      .from("trk_links")
      .update(patch)
      .eq("id", (found as Row).id)
      .select(SELECT_LINK)
      .maybeSingle();
    return data ? toLink(data as Row) : toLink(found as Row);
  }

  const { data, error } = await admin.from("trk_links").insert(patch).select(SELECT_LINK).maybeSingle();
  if (error) {
    // token の一意制約に当たった場合（別資源が同じトークンを名乗った等）は既存行を返す
    const { data: byToken } = await admin
      .from("trk_links")
      .select(SELECT_LINK)
      .eq("token", input.token)
      .maybeSingle();
    return byToken ? toLink(byToken as Row) : null;
  }
  return data ? toLink(data as Row) : null;
}

/** 計測を1件記録（RPC trk_record。トークン照合・集計・初回開封イベントまで一括） */
export async function recordView(admin: AdminClient, input: RecordInput): Promise<RecordResult> {
  const { data, error } = await admin.rpc("trk_record", {
    p_token: input.token,
    p_session_key: input.sessionKey,
    p_kind: input.kind,
    p_page: input.page ?? null,
    p_label: input.label ?? null,
    p_seconds: Math.max(0, Math.min(Number(input.seconds ?? 0) || 0, 24 * 3600)),
    p_internal: Boolean(input.internal),
    p_meta: {
      referrer: input.meta?.referrer ?? null,
      ua: input.meta?.ua ?? null,
      device: input.meta?.device ?? null,
    },
  });
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "no_result" }) as RecordResult;
}

/** 資源からリンクを引く（管理画面で閲覧状況を出す用） */
export async function getLinkByResource(
  admin: AdminClient,
  app: string,
  resourceType: string,
  resourceId: string
): Promise<TrackLink | null> {
  const { data } = await admin
    .from("trk_links")
    .select(SELECT_LINK)
    .eq("app", app)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? toLink(data as Row) : null;
}

/** 閲覧セッション一覧（新しい順）。社内プレビューは既定で除く */
export async function listSessions(
  admin: AdminClient,
  linkId: string,
  options?: { limit?: number; includeInternal?: boolean }
): Promise<TrackSession[]> {
  let q = admin
    .from("trk_sessions")
    .select("id, link_id, is_internal, started_at, last_seen_at, seconds, page_views, pages, first_page, referrer, device")
    .eq("link_id", linkId)
    .order("started_at", { ascending: false })
    .limit(options?.limit ?? 20);
  if (!options?.includeInternal) q = q.eq("is_internal", false);
  const { data } = await q;
  return ((data ?? []) as Row[]).map(toSession);
}

/**
 * ホットリード＝開封されたリンク。
 * onlyUnnotified=true で「まだ通知していないもの」だけ取れる（判断フィード向け）。
 */
export async function getHotLinks(
  admin: AdminClient,
  companyId: string,
  options?: { app?: string; withinHours?: number; onlyUnnotified?: boolean; limit?: number }
): Promise<TrackLink[]> {
  let q = admin
    .from("trk_links")
    .select(SELECT_LINK)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("first_viewed_at", "is", null)
    .order("last_viewed_at", { ascending: false })
    .limit(options?.limit ?? 20);

  if (options?.app) q = q.eq("app", options.app);
  if (options?.onlyUnnotified) q = q.is("notified_at", null);
  if (options?.withinHours) {
    const since = new Date(Date.now() - options.withinHours * 3600_000).toISOString();
    q = q.gte("last_viewed_at", since);
  }
  const { data } = await q;
  return ((data ?? []) as Row[]).map(toLink);
}

/** 通知済みにする（判断フィードで対応した／通知を送った時） */
export async function markNotified(admin: AdminClient, linkIds: string[]): Promise<void> {
  if (linkIds.length === 0) return;
  await admin
    .from("trk_links")
    .update({ notified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", linkIds);
}

/** 秒 → 「3分20秒」のような表示（一覧・カードで共通に使う） */
export function formatDuration(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds));
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const rest = sec % 60;
  if (m < 60) return rest === 0 ? `${m}分` : `${m}分${rest}秒`;
  const h = Math.floor(m / 60);
  return `${h}時間${m % 60}分`;
}
