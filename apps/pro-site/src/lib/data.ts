import "server-only";
import { createAdmin } from "@/lib/db";
import { todayJst } from "@/lib/jst";

export type Pro = {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  catchphrase: string | null;
  bio: string | null;
  affiliation: string | null;
  instagram_username: string | null;
  x_username: string | null;
  youtube_url: string | null;
  hero_image_url: string | null;
  profile_image_url: string | null;
  world_ranking: string | null;
  ranking_note: string | null;
};

export type NewsItem = {
  id: string;
  kind: "news" | "media";
  category: string;
  title: string;
  body: string | null;
  link_url: string | null;
  published_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  tour: string | null;
  venue: string | null;
  start_date: string;
  end_date: string | null;
  result_rank: string | null;
  result_detail: string | null;
};

export type CareerRow = { id: string; season: string | null; event: string; result: string | null; note: string | null; sort: number };
export type ClubRow = { id: string; category: string; item: string; sort: number };
export type ProfileItem = { id: string; label: string; value: string; sort: number };
export type InstaPost = { id: string; post_url: string; created_at: string };
export type Sponsor = { id: string; name: string; image_url: string; image_path: string; link_url: string | null; size: "large" | "medium" | "small"; sort: number };

export async function getPro(slug: string): Promise<Pro | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("pgw_pros")
    .select("id, slug, name, name_en, catchphrase, bio, affiliation, instagram_username, x_username, youtube_url, hero_image_url, profile_image_url, world_ranking, ranking_note")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Pro | null) ?? null;
}

export async function listNews(proId: string, kind: "news" | "media", limit?: number): Promise<NewsItem[]> {
  const admin = createAdmin();
  let q = admin
    .from("pgw_news")
    .select("id, kind, category, title, body, link_url, published_at")
    .eq("pro_id", proId)
    .eq("kind", kind)
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return (data as NewsItem[] | null) ?? [];
}

export async function getNews(proId: string, id: string): Promise<NewsItem | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("pgw_news")
    .select("id, kind, category, title, body, link_url, published_at")
    .eq("pro_id", proId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as NewsItem | null) ?? null;
}

/** 今日以降 = SCHEDULE（開始日昇順） */
export async function listSchedule(proId: string, limit?: number): Promise<Tournament[]> {
  const admin = createAdmin();
  let q = admin
    .from("pgw_tournaments")
    .select("id, name, tour, venue, start_date, end_date, result_rank, result_detail")
    .eq("pro_id", proId)
    .is("deleted_at", null)
    .gte("end_date", todayJst())
    .order("start_date", { ascending: true });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return (data as Tournament[] | null) ?? [];
}

/** 終了済み = RESULT（開始日降順） */
export async function listResults(proId: string, limit?: number): Promise<Tournament[]> {
  const admin = createAdmin();
  let q = admin
    .from("pgw_tournaments")
    .select("id, name, tour, venue, start_date, end_date, result_rank, result_detail")
    .eq("pro_id", proId)
    .is("deleted_at", null)
    .lt("end_date", todayJst())
    .order("start_date", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return (data as Tournament[] | null) ?? [];
}

export async function listCareer(proId: string): Promise<CareerRow[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("pgw_career")
    .select("id, season, event, result, note, sort")
    .eq("pro_id", proId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as CareerRow[] | null) ?? [];
}

export async function listClubs(proId: string): Promise<ClubRow[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("pgw_clubs")
    .select("id, category, item, sort")
    .eq("pro_id", proId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as ClubRow[] | null) ?? [];
}

export async function listProfileItems(proId: string): Promise<ProfileItem[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("pgw_profile_items")
    .select("id, label, value, sort")
    .eq("pro_id", proId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as ProfileItem[] | null) ?? [];
}

export async function listSponsors(proId: string): Promise<Sponsor[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("pgw_sponsors")
    .select("id, name, image_url, image_path, link_url, size, sort")
    .eq("pro_id", proId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as Sponsor[] | null) ?? [];
}

export async function listInstagram(proId: string, limit?: number): Promise<InstaPost[]> {
  const admin = createAdmin();
  let q = admin
    .from("pgw_instagram")
    .select("id, post_url, created_at")
    .eq("pro_id", proId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  return (data as InstaPost[] | null) ?? [];
}
