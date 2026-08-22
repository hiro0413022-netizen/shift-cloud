"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/db";
import { createSession, destroySession, hashPassword, requireProAdmin, verifyPassword } from "@/lib/auth";
import { todayJst } from "@/lib/jst";

// ============================================================
// 管理画面のサーバーアクション。全て「slugのプロにログイン済みか」を検証してから実行。
// フォームは素のHTML form → スマホでも確実に動く（JS依存を最小化）。
// ============================================================

function s(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function refresh(slug: string, path = "") {
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/admin${path}?ok=1`);
}

async function guard(slug: string) {
  const pro = await requireProAdmin(slug);
  if (!pro) redirect(`/${slug}/admin`);
  return pro!;
}

// ---------- ログイン ----------
export async function loginAction(fd: FormData) {
  const slug = s(fd, "slug");
  const password = String(fd.get("password") ?? "");
  const admin = createAdmin();
  const { data: pro } = await admin
    .from("pgw_pros")
    .select("id, password_hash")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pro || !verifyPassword(password, pro.password_hash)) {
    redirect(`/${slug}/admin?err=login`);
  }
  await createSession(pro.id);
  redirect(`/${slug}/admin`);
}

export async function logoutAction(fd: FormData) {
  const slug = s(fd, "slug");
  await destroySession();
  redirect(`/${slug}`);
}

export async function changePasswordAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const next = String(fd.get("new_password") ?? "");
  if (next.length < 8) redirect(`/${slug}/admin/settings?err=short`);
  const admin = createAdmin();
  await admin.from("pgw_pros").update({ password_hash: hashPassword(next) }).eq("id", pro.id);
  redirect(`/${slug}/admin/settings?ok=1`);
}

// ---------- ニュース ----------
export async function saveNewsAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  const id = s(fd, "id");
  const row = {
    kind: s(fd, "kind") === "media" ? "media" : "news",
    category: s(fd, "category") || "お知らせ",
    title: s(fd, "title"),
    body: s(fd, "body") || null,
    link_url: s(fd, "link_url") || null,
    published_at: s(fd, "published_at") || todayJst(),
  };
  if (!row.title) redirect(`/${slug}/admin/news?err=title`);
  if (id) {
    await admin.from("pgw_news").update(row).eq("id", id).eq("pro_id", pro.id);
  } else {
    await admin.from("pgw_news").insert({ ...row, pro_id: pro.id });
  }
  refresh(slug, "/news");
}

export async function deleteNewsAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin.from("pgw_news").update({ deleted_at: new Date().toISOString() }).eq("id", s(fd, "id")).eq("pro_id", pro.id);
  refresh(slug, "/news");
}

// ---------- 大会（日程・成績） ----------
export async function saveTournamentAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  const id = s(fd, "id");
  const start = s(fd, "start_date");
  const row = {
    name: s(fd, "name"),
    tour: s(fd, "tour") || null,
    venue: s(fd, "venue") || null,
    start_date: start,
    end_date: s(fd, "end_date") || start,
    result_rank: s(fd, "result_rank") || null,
    result_detail: s(fd, "result_detail") || null,
  };
  if (!row.name || !row.start_date) redirect(`/${slug}/admin/tournaments?err=required`);
  if (id) {
    await admin.from("pgw_tournaments").update(row).eq("id", id).eq("pro_id", pro.id);
  } else {
    await admin.from("pgw_tournaments").insert({ ...row, pro_id: pro.id });
  }
  refresh(slug, "/tournaments");
}

export async function deleteTournamentAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin.from("pgw_tournaments").update({ deleted_at: new Date().toISOString() }).eq("id", s(fd, "id")).eq("pro_id", pro.id);
  refresh(slug, "/tournaments");
}

// ---------- Instagram ----------
export async function addInstagramAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const url = s(fd, "post_url");
  if (!/^https:\/\/(www\.)?instagram\.com\/(p|reel)\//.test(url)) {
    redirect(`/${slug}/admin/instagram?err=url`);
  }
  const admin = createAdmin();
  await admin.from("pgw_instagram").insert({ pro_id: pro.id, post_url: url.split("?")[0] });
  refresh(slug, "/instagram");
}

export async function deleteInstagramAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin.from("pgw_instagram").update({ deleted_at: new Date().toISOString() }).eq("id", s(fd, "id")).eq("pro_id", pro.id);
  refresh(slug, "/instagram");
}

// ---------- スポンサーバナー ----------
const SPONSOR_BUCKET = "pgw-sponsors";
const SPONSOR_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function addSponsorAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const name = s(fd, "name");
  const file = fd.get("image");
  if (!name) redirect(`/${slug}/admin/sponsors?err=name`);
  if (!(file instanceof File) || file.size === 0) redirect(`/${slug}/admin/sponsors?err=file`);
  if (!file.type.startsWith("image/")) redirect(`/${slug}/admin/sponsors?err=filetype`);
  if (file.size > SPONSOR_MAX_BYTES) redirect(`/${slug}/admin/sponsors?err=filesize`);

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${pro.id}/${Date.now()}.${ext}`;
  const admin = createAdmin();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(SPONSOR_BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) redirect(`/${slug}/admin/sponsors?err=upload`);
  const { data: pub } = admin.storage.from(SPONSOR_BUCKET).getPublicUrl(path);

  await admin.from("pgw_sponsors").insert({
    pro_id: pro.id,
    name,
    image_url: pub.publicUrl,
    image_path: path,
    link_url: s(fd, "link_url") || null,
    size: ["large", "medium", "small"].includes(s(fd, "size")) ? s(fd, "size") : "medium",
    sort: Number(s(fd, "sort") || "100"),
  });
  refresh(slug, "/sponsors");
}

export async function updateSponsorAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin
    .from("pgw_sponsors")
    .update({
      name: s(fd, "name") || undefined,
      link_url: s(fd, "link_url") || null,
      size: ["large", "medium", "small"].includes(s(fd, "size")) ? s(fd, "size") : "medium",
      sort: Number(s(fd, "sort") || "100"),
    })
    .eq("id", s(fd, "id"))
    .eq("pro_id", pro.id);
  refresh(slug, "/sponsors");
}

export async function deleteSponsorAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  const { data: row } = await admin
    .from("pgw_sponsors")
    .select("image_path")
    .eq("id", s(fd, "id"))
    .eq("pro_id", pro.id)
    .maybeSingle();
  await admin.from("pgw_sponsors").update({ deleted_at: new Date().toISOString() }).eq("id", s(fd, "id")).eq("pro_id", pro.id);
  if (row?.image_path) {
    await admin.storage.from(SPONSOR_BUCKET).remove([row.image_path]); // 失敗しても論理削除済みなので握る
  }
  refresh(slug, "/sponsors");
}

// ---------- プロフィール ----------
export async function saveProAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin
    .from("pgw_pros")
    .update({
      name: s(fd, "name") || undefined,
      name_en: s(fd, "name_en") || null,
      catchphrase: s(fd, "catchphrase") || null,
      bio: s(fd, "bio") || null,
      affiliation: s(fd, "affiliation") || null,
      instagram_username: s(fd, "instagram_username").replace(/^@/, "") || null,
      x_username: s(fd, "x_username").replace(/^@/, "") || null,
      youtube_url: s(fd, "youtube_url") || null,
      hero_image_url: s(fd, "hero_image_url") || null,
      profile_image_url: s(fd, "profile_image_url") || null,
      world_ranking: s(fd, "world_ranking") || null,
      ranking_note: s(fd, "ranking_note") || null,
    })
    .eq("id", pro.id);
  refresh(slug, "/profile");
}

export async function saveProfileItemAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  const id = s(fd, "id");
  const row = { label: s(fd, "label"), value: s(fd, "value"), sort: Number(s(fd, "sort") || "100") };
  if (!row.label) redirect(`/${slug}/admin/profile?err=label`);
  if (id) {
    await admin.from("pgw_profile_items").update(row).eq("id", id).eq("pro_id", pro.id);
  } else {
    await admin.from("pgw_profile_items").insert({ ...row, pro_id: pro.id });
  }
  refresh(slug, "/profile");
}

export async function deleteProfileItemAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin.from("pgw_profile_items").update({ deleted_at: new Date().toISOString() }).eq("id", s(fd, "id")).eq("pro_id", pro.id);
  refresh(slug, "/profile");
}

// ---------- 主な戦歴 ----------
export async function saveCareerAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  const id = s(fd, "id");
  const row = {
    season: s(fd, "season") || null,
    event: s(fd, "event"),
    result: s(fd, "result") || null,
    note: s(fd, "note") || null,
    sort: Number(s(fd, "sort") || "100"),
  };
  if (!row.event) redirect(`/${slug}/admin/career?err=event`);
  if (id) {
    await admin.from("pgw_career").update(row).eq("id", id).eq("pro_id", pro.id);
  } else {
    await admin.from("pgw_career").insert({ ...row, pro_id: pro.id });
  }
  refresh(slug, "/career");
}

export async function deleteCareerAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin.from("pgw_career").update({ deleted_at: new Date().toISOString() }).eq("id", s(fd, "id")).eq("pro_id", pro.id);
  refresh(slug, "/career");
}

// ---------- クラブセッティング ----------
export async function saveClubAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  const id = s(fd, "id");
  const row = { category: s(fd, "category"), item: s(fd, "item"), sort: Number(s(fd, "sort") || "100") };
  if (!row.category || !row.item) redirect(`/${slug}/admin/clubs?err=required`);
  if (id) {
    await admin.from("pgw_clubs").update(row).eq("id", id).eq("pro_id", pro.id);
  } else {
    await admin.from("pgw_clubs").insert({ ...row, pro_id: pro.id });
  }
  refresh(slug, "/clubs");
}

export async function deleteClubAction(fd: FormData) {
  const slug = s(fd, "slug");
  const pro = await guard(slug);
  const admin = createAdmin();
  await admin.from("pgw_clubs").update({ deleted_at: new Date().toISOString() }).eq("id", s(fd, "id")).eq("pro_id", pro.id);
  refresh(slug, "/clubs");
}
