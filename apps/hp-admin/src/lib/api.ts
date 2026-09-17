"use client";
import { SB_ANON, SB_URL } from "./config";

const TOKEN_KEY = "hp_admin_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export class AuthError extends Error {}

function cleanMessage(m: string) {
  return m.replace(/^(HP_AUTH|HP_INPUT|HP_LOGIN): /, "");
}

export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const msg = String(data?.message ?? `エラー（${r.status}）`);
    if (msg.startsWith("HP_AUTH: ログインが切れました")) throw new AuthError(cleanMessage(msg));
    throw new Error(cleanMessage(msg));
  }
  return data as T;
}

/** トークン付きRPC */
export function arpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return rpc<T>(name, { p_token: getToken() ?? "", ...args });
}

export async function edge<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SB_URL}/functions/v1/hp-admin`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: getToken() ?? "", ...body }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw new AuthError(data.error ?? "ログインが切れました");
  if (!r.ok) throw new Error(data.error ?? `エラー（${r.status}）`);
  return data as T;
}

/** 写真を縮小（長辺2000px・JPEG）してアップロード。GIFはそのまま */
export async function uploadImage(site: string, file: File, maxSide = 2000): Promise<string> {
  let blob: Blob = file;
  let w = 0;
  let h = 0;
  if (file.type !== "image/gif") {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (bmp) {
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      w = Math.round(bmp.width * scale);
      h = Math.round(bmp.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0, w, h);
      const isPng = file.type === "image/png";
      blob = await new Promise<Blob>((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error("写真の変換に失敗しました"))), isPng ? "image/png" : "image/jpeg", 0.86),
      );
      // PNGが大きすぎるときはJPEGにする
      if (isPng && blob.size > 1.5 * 1024 * 1024) {
        blob = await new Promise<Blob>((res, rej) =>
          c.toBlob((b) => (b ? res(b) : rej(new Error("写真の変換に失敗しました"))), "image/jpeg", 0.86),
        );
      }
    }
  }
  const fd = new FormData();
  fd.append("token", getToken() ?? "");
  fd.append("site", site);
  fd.append("width", String(w));
  fd.append("height", String(h));
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "jpg";
  fd.append("file", new File([blob], `photo.${ext}`, { type: blob.type || "image/jpeg" }));
  const r = await fetch(`${SB_URL}/functions/v1/hp-admin`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
    body: fd,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw new AuthError(data.error ?? "ログインが切れました");
  if (!r.ok) throw new Error(data.error ?? "アップロードに失敗しました");
  return data.url as string;
}

export type SiteInfo = { code: string; name: string; domain: string; live: boolean };
export type Me = { name: string; login_id: string; role: "owner" | "editor"; sites: SiteInfo[] };
export type Slot = {
  key: string;
  kind: "image" | "text" | "longtext";
  page_label: string;
  label: string;
  help: string | null;
  default_value: string | null;
  value: string | null;
  updated_by: string | null;
  updated_at: string | null;
};
export type Post = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  cover_url: string | null;
  category: string;
  status: "draft" | "published";
  published_at: string | null;
  author_name: string | null;
  updated_at?: string;
  updated_by?: string | null;
};
export type Insta = {
  id: string;
  permalink: string;
  caption: string | null;
  visible: boolean;
  posted_on: string | null;
  created_at: string;
  created_by: string | null;
};
export type SiteData = { slots: Slot[]; posts: Post[]; instagram: Insta[]; media: { url: string; created_at: string }[] };
