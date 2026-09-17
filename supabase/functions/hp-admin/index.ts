// hp-admin（#249）: HP管理画面のうち、DBのRPCだけではできない処理
//  - upload      : 写真を hp-media バケットへ保存（service_role）
//  - gsc_*       : Google Search Console の表示回数を取り込む
// 認証は HP管理のセッショントークン（hp__user で検査）。JWT検証は使わない（verify_jwt=false）。
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hp-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

type Me = { name: string; role: string; sites: { code: string }[] };

async function auth(token: string, site?: string): Promise<Me> {
  if (site) {
    const { error } = await db.rpc("hp__user", { p_token: token, p_site: site });
    if (error) throw new Error(error.message);
  }
  const { data, error } = await db.rpc("hp_admin_me", { p_token: token });
  if (error) throw new Error(error.message);
  return data as Me;
}

async function getSetting<T>(key: string): Promise<T | null> {
  const { data } = await db.from("hp_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}
async function setSetting(key: string, value: unknown) {
  const { error } = await db.from("hp_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
async function mergeSetting(key: string, patch: Record<string, unknown>) {
  const cur = (await getSetting<Record<string, unknown>>(key)) ?? {};
  await setSetting(key, { ...cur, ...patch });
}

// ───────── 写真 ─────────
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function upload(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const site = String(form.get("site") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("写真が選ばれていません");
  await auth(token, site);
  const ext = EXT[file.type];
  if (!ext) return fail("JPEG / PNG / WebP / GIF の写真を選んでください");
  if (file.size > 10 * 1024 * 1024) return fail("写真が大きすぎます（10MBまで）");
  const now = new Date();
  const path = `${site}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("hp-media").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return fail("保存に失敗しました: " + error.message, 500);
  const url = `${SB_URL}/storage/v1/object/public/hp-media/${path}`;
  const w = Number(form.get("width") ?? 0) || null;
  const h = Number(form.get("height") ?? 0) || null;
  const rec = await db.rpc("hp_admin_record_media", {
    p_token: token, p_site: site, p_path: path, p_url: url, p_bytes: file.size, p_w: w, p_h: h,
  });
  if (rec.error) return fail(rec.error.message, 500);
  return json({ url });
}

// ───────── Google Search Console ─────────
type SA = { client_email: string; private_key: string; token_uri?: string };

function b64url(buf: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf as ArrayBuffer);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${b64url(sig)}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Googleの認証に失敗: " + (j.error_description ?? j.error ?? r.status));
  return j.access_token as string;
}

async function gscQuery(tok: string, property: string, body: Record<string, unknown>) {
  const r = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const j = await r.json();
  if (!r.ok) throw new Error("Search Consoleの取得に失敗: " + (j.error?.message ?? r.status));
  return (j.rows ?? []) as { keys: string[]; clicks: number; impressions: number; position: number }[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function gscSync(site: string, days: number) {
  const sa = await getSetting<SA>("gsc_sa");
  if (!sa) throw new Error("Search Consoleがまだ連携されていません");
  const props = (await getSetting<Record<string, string>>("gsc_properties")) ?? {};
  const property = props[site];
  if (!property) throw new Error("このサイトのSearch Consoleプロパティが未設定です");
  const tok = await googleToken(sa);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const range = { startDate: ymd(start), endDate: ymd(end), dataState: "all" };

  const totals = await gscQuery(tok, property, { ...range, dimensions: ["date"], rowLimit: 1000 });
  const queries = await gscQuery(tok, property, { ...range, dimensions: ["date", "query"], rowLimit: 5000 });
  const rows = [
    ...totals.map((r) => ({ site, day: r.keys[0], dim: "total", dim_value: "", clicks: r.clicks, impressions: r.impressions, position: r.position })),
    ...queries.map((r) => ({ site, day: r.keys[0], dim: "query", dim_value: r.keys[1].slice(0, 200), clicks: r.clicks, impressions: r.impressions, position: r.position })),
  ];
  // 期間内を入れ替え（遅れて確定する値があるため）
  const del = await db.from("hp_gsc_daily").delete().eq("site", site).gte("day", range.startDate);
  if (del.error) throw new Error(del.error.message);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("hp_gsc_daily").upsert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  await mergeSetting("gsc_last_sync", { [site]: new Date().toISOString() });
  return { rows: rows.length, totals: totals.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("POST only", 405);
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.startsWith("multipart/form-data")) return await upload(req);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const token = String(body.token ?? "");
    const site = body.site ? String(body.site) : undefined;

    if (action === "gsc_sync") {
      if (!site) return fail("site がありません");
      await auth(token, site);
      // 12時間以内に取り込み済みなら何もしない（force=true で強制）
      const last = (await getSetting<Record<string, string>>("gsc_last_sync"))?.[site];
      if (!body.force && last && Date.now() - new Date(last).getTime() < 12 * 3600 * 1000) {
        return json({ skipped: true, last });
      }
      return json(await gscSync(site, Math.min(480, Math.max(3, Number(body.days) || 90))));
    }

    const me = await auth(token, site);
    if (me.role !== "owner") return fail("この操作はオーナーだけができます", 403);

    if (action === "gsc_status") {
      const sa = await getSetting<SA>("gsc_sa");
      return json({
        connected: !!sa,
        client_email: sa?.client_email ?? null,
        properties: (await getSetting("gsc_properties")) ?? {},
        last_sync: (await getSetting("gsc_last_sync")) ?? {},
      });
    }
    if (action === "gsc_connect") {
      let sa: SA;
      try {
        sa = typeof body.service_account === "string" ? JSON.parse(body.service_account) : body.service_account;
      } catch {
        return fail("JSONの形式が正しくありません（ダウンロードしたファイルの中身をそのまま貼ってください）");
      }
      if (!sa?.client_email || !sa?.private_key) return fail("client_email と private_key が入ったJSONを貼ってください");
      await googleToken(sa); // 鍵が正しいかその場で確かめる
      await setSetting("gsc_sa", { client_email: sa.client_email, private_key: sa.private_key });
      return json({ client_email: sa.client_email });
    }
    if (action === "gsc_list_properties") {
      const sa = await getSetting<SA>("gsc_sa");
      if (!sa) return fail("先にサービスアカウントを連携してください");
      const tok = await googleToken(sa);
      const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      if (!r.ok) return fail(j.error?.message ?? "一覧を取れませんでした");
      return json({ sites: (j.siteEntry ?? []).map((s: { siteUrl: string; permissionLevel: string }) => s) });
    }
    if (action === "gsc_set_property") {
      if (!site) return fail("site がありません");
      await mergeSetting("gsc_properties", { [site]: String(body.property ?? "").trim() || null });
      return json({ ok: true });
    }
    return fail("unknown action");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg.replace(/^(HP_AUTH|HP_INPUT|HP_LOGIN): /, ""), /HP_AUTH/.test(msg) ? 401 : 400);
  }
});
