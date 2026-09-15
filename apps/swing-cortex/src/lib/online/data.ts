import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { requireCoachActor, type CoachActor } from "@/lib/auth";
import { loadFeatures } from "@/lib/plan";
import { redirect } from "next/navigation";
import type { OnlineProfile, ThreadMsg, ExamplePair } from "./reply";
import { buildPairs } from "./reply";

/**
 * オンラインレッスン・モードの読み取り（service_role＋company_id で必ず絞る）
 */

export type OnlineMember = {
  id: string;
  name: string;
  lineName: string | null;
  plan: "regular" | "premium" | "other";
  mark: string | null;
  status: "active" | "paused" | "left";
  startedOn: string | null;
  goal: string | null;
  profile: string | null;
  focus: string[];
  memo: string | null;
  lastInAt: string | null;
  lastOutAt: string | null;
};

export type InboxRow = OnlineMember & {
  lastText: string | null;
  lastTextAt: string | null;
  lastDirection: "in" | "out" | null;
  pendingMedia: number;
};

export type Video = { id: string; url: string; title: string; tags: string[]; note: string | null; useCount: number; lastUsedAt: string | null };
export type Template = { id: string; title: string; body: string; sortOrder: number };

/** オンラインモードのテナントだけ通す（それ以外は従来のトップへ） */
export async function requireOnlineActor(): Promise<CoachActor> {
  const actor = await requireCoachActor();
  const f = await loadFeatures(actor.companyId);
  if (f.mode !== "online") redirect("/");
  return actor;
}

/** サーバーアクション用（redirect ではなく例外） */
export async function assertOnlineActor(): Promise<CoachActor> {
  const actor = await requireCoachActor();
  const f = await loadFeatures(actor.companyId);
  if (f.mode !== "online") throw new Error("オンラインレッスンのアカウントではありません");
  return actor;
}

type MemberRow = {
  id: string; name: string; line_name: string | null; plan: string; mark: string | null; status: string;
  started_on: string | null; goal: string | null; profile: string | null; focus: unknown; memo: string | null;
  last_in_at: string | null; last_out_at: string | null;
};
const MEMBER_COLS = "id, name, line_name, plan, mark, status, started_on, goal, profile, focus, memo, last_in_at, last_out_at";

function toMember(r: MemberRow): OnlineMember {
  const focus = Array.isArray(r.focus)
    ? (r.focus as unknown[]).map((f) => (typeof f === "string" ? f : String((f as { text?: string })?.text ?? ""))).filter(Boolean)
    : [];
  return {
    id: r.id,
    name: r.name,
    lineName: r.line_name,
    plan: (["regular", "premium"].includes(r.plan) ? r.plan : "other") as OnlineMember["plan"],
    mark: r.mark,
    status: (r.status as OnlineMember["status"]) ?? "active",
    startedOn: r.started_on,
    goal: r.goal,
    profile: r.profile,
    focus,
    memo: r.memo,
    lastInAt: r.last_in_at,
    lastOutAt: r.last_out_at,
  };
}

export async function loadProfile(companyId: string): Promise<OnlineProfile> {
  const admin = createAdmin();
  const { data } = await admin.from("sc_settings").select("online_profile").eq("company_id", companyId).maybeSingle();
  return ((data as { online_profile?: OnlineProfile | null } | null)?.online_profile ?? {}) as OnlineProfile;
}

export async function loadMembers(companyId: string): Promise<OnlineMember[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_online_members")
    .select(MEMBER_COLS)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");
  return ((data ?? []) as MemberRow[]).map(toMember);
}

export async function loadMember(companyId: string, id: string): Promise<OnlineMember | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_online_members")
    .select(MEMBER_COLS)
    .eq("company_id", companyId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? toMember(data as MemberRow) : null;
}

/** 受信箱: 会員ごとの最新の文章と、未返信の動画・写真の数 */
export async function loadInbox(companyId: string): Promise<InboxRow[]> {
  const admin = createAdmin();
  const members = await loadMembers(companyId);
  const rows = await Promise.all(
    members.map(async (m) => {
      const { data } = await admin
        .from("sc_online_messages")
        .select("direction, kind, body, sent_at")
        .eq("member_id", m.id)
        .neq("direction", "system")
        .neq("kind", "unsent")
        .order("sent_at", { ascending: false })
        .limit(12);
      const list = (data ?? []) as { direction: "in" | "out"; kind: string; body: string; sent_at: string }[];
      const lastText = list.find((x) => x.kind === "text") ?? null;
      let pendingMedia = 0;
      for (const x of list) {
        if (x.direction === "out") break;
        if (x.kind === "video" || x.kind === "photo") pendingMedia++;
      }
      return {
        ...m,
        lastText: lastText?.body ?? null,
        lastTextAt: lastText?.sent_at ?? null,
        lastDirection: lastText?.direction ?? null,
        pendingMedia,
      };
    })
  );
  return rows;
}

type MsgRow = { id: string; direction: "in" | "out" | "system"; kind: string; body: string; sent_at: string; source: string };

export type ThreadItem = ThreadMsg & { id: string; source: string };

/** スレッド（新しい方から limit 件を取り、古い→新しいの順で返す） */
export async function loadThread(companyId: string, memberId: string, limit = 80, before?: string): Promise<ThreadItem[]> {
  const admin = createAdmin();
  let q = admin
    .from("sc_online_messages")
    .select("id, direction, kind, body, sent_at, source")
    .eq("company_id", companyId)
    .eq("member_id", memberId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("sent_at", before);
  const { data } = await q;
  return ((data ?? []) as MsgRow[])
    .reverse()
    .map((r) => ({ id: r.id, direction: r.direction, kind: r.kind, body: r.body, sentAt: r.sent_at, source: r.source }));
}

export async function loadVideos(companyId: string): Promise<Video[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_online_videos")
    .select("id, url, title, tags, note, use_count, last_used_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("use_count", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false });
  return ((data ?? []) as { id: string; url: string; title: string; tags: string[] | null; note: string | null; use_count: number; last_used_at: string | null }[]).map(
    (v) => ({ id: v.id, url: v.url, title: v.title, tags: v.tags ?? [], note: v.note, useCount: v.use_count, lastUsedAt: v.last_used_at })
  );
}

export async function loadTemplates(companyId: string): Promise<Template[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_online_templates")
    .select("id, title, body, sort_order")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  return ((data ?? []) as { id: string; title: string; body: string; sort_order: number }[]).map((t) => ({
    id: t.id, title: t.title, body: t.body, sortOrder: t.sort_order,
  }));
}

/* ---- 過去の返信例（全会員ぶん）。重いので10分だけ覚えておく ---- */
const pairCache = new Map<string, { at: number; pairs: ExamplePair[] }>();

export async function loadExamplePairs(companyId: string): Promise<ExamplePair[]> {
  const hit = pairCache.get(companyId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.pairs;
  const admin = createAdmin();
  const members = await loadMembers(companyId);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const rows: (MsgRow & { member_id: string })[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await admin
      .from("sc_online_messages")
      .select("id, member_id, direction, kind, body, sent_at, source")
      .eq("company_id", companyId)
      .in("kind", ["text", "video", "photo"])
      .in("direction", ["in", "out"])
      .order("member_id")
      .order("sent_at")
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    rows.push(...(data as (MsgRow & { member_id: string })[]));
    if (data.length < PAGE) break;
  }
  const byMember = new Map<string, ThreadMsg[]>();
  for (const r of rows) {
    const list = byMember.get(r.member_id) ?? [];
    list.push({ direction: r.direction, kind: r.kind, body: r.body, sentAt: r.sent_at });
    byMember.set(r.member_id, list);
  }
  const pairs: ExamplePair[] = [];
  for (const [mid, list] of byMember) pairs.push(...buildPairs(list, nameOf.get(mid)));
  pairCache.set(companyId, { at: Date.now(), pairs });
  return pairs;
}

export function forgetExamplePairs(companyId: string) {
  pairCache.delete(companyId);
}

export async function monthStats(companyId: string): Promise<{ repliesThisMonth: number }> {
  const admin = createAdmin();
  const now = new Date(Date.now() + 9 * 3600 * 1000); // JST
  const start = `${now.toISOString().slice(0, 7)}-01T00:00:00+09:00`;
  const { count } = await admin
    .from("sc_online_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("direction", "out")
    .eq("kind", "text")
    .gte("sent_at", start);
  return { repliesThisMonth: count ?? 0 };
}
