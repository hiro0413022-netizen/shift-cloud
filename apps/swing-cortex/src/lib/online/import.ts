/**
 * LINEトーク履歴の取り込み（サーバー専用・DBクライアントは呼び出し側から渡す）
 *
 * - 会員は name_key で探し、無ければ作る（プラン・LINE表示名・印は取り込みのたびに最新へ）
 * - メッセージは (member_id, fingerprint) の一意索引で二重取込を防ぐ（ignoreDuplicates）
 * - 返信に貼ってあった YouTube は動画ライブラリへ（既存は回数だけ足さない＝取り込み直しで増えない）
 * - 最後に last_in_at / last_out_at を実データから引き直す
 *
 * "server-only" を付けないのは、初期投入スクリプト（node）からも同じ処理を使うため。
 * 画面から呼ぶのは online-actions.ts（サーバーアクション）経由だけ。
 */
import { extractVideos, type ParsedExport, type ParsedMessage } from "./line-csv.ts";

// supabase-js のクライアント（型を広く取る：アプリとスクリプトの両方から渡せるように）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ImportResult = {
  memberId: string;
  memberName: string;
  created: boolean;
  total: number;
  inserted: number;
  videos: number;
};

const CHUNK = 500;

export async function findOrCreateMember(
  db: Db,
  companyId: string,
  m: { name: string; nameKey: string; lineName: string | null; plan: string; mark: string | null },
  startedOn: string | null
): Promise<{ id: string; created: boolean }> {
  const { data: found, error: e1 } = await db
    .from("sc_online_members")
    .select("id, plan, started_on")
    .eq("company_id", companyId)
    .eq("name_key", m.nameKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (found) {
    const patch: Record<string, unknown> = {};
    if (m.lineName) patch.line_name = m.lineName;
    if (m.plan !== "other") patch.plan = m.plan;
    if (m.mark !== null) patch.mark = m.mark;
    if (startedOn && (!found.started_on || startedOn < found.started_on)) patch.started_on = startedOn;
    if (Object.keys(patch).length) {
      const { error } = await db.from("sc_online_members").update(patch).eq("id", found.id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    }
    return { id: found.id as string, created: false };
  }
  const { data, error } = await db
    .from("sc_online_members")
    .insert({
      company_id: companyId,
      name: m.name,
      name_key: m.nameKey,
      line_name: m.lineName,
      plan: m.plan === "other" ? "regular" : m.plan,
      mark: m.mark,
      started_on: startedOn,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, created: true };
}

/** 会員の最終受信・最終返信を実データから引き直す */
export async function refreshMemberTimes(db: Db, companyId: string, memberId: string): Promise<void> {
  const last = async (dir: "in" | "out") => {
    const { data } = await db
      .from("sc_online_messages")
      .select("sent_at")
      .eq("member_id", memberId)
      .eq("direction", dir)
      .neq("kind", "unsent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.sent_at as string | undefined) ?? null;
  };
  const [inAt, outAt] = await Promise.all([last("in"), last("out")]);
  await db
    .from("sc_online_members")
    .update({ last_in_at: inAt, last_out_at: outAt })
    .eq("id", memberId)
    .eq("company_id", companyId);
}

/** 動画ライブラリへ登録（既にあればタイトルが空のときだけ埋める） */
export async function upsertVideos(
  db: Db,
  companyId: string,
  refs: { url: string; title: string; count?: number; lastUsedAt?: string | null }[]
): Promise<number> {
  if (!refs.length) return 0;
  const urls = refs.map((r) => r.url);
  const { data: existing } = await db
    .from("sc_online_videos")
    .select("id, url, title")
    .eq("company_id", companyId)
    .in("url", urls);
  const byUrl = new Map<string, { id: string; title: string }>(
    ((existing ?? []) as { id: string; url: string; title: string }[]).map((e) => [e.url, e])
  );
  const fresh = refs.filter((r) => !byUrl.has(r.url));
  if (fresh.length) {
    const { error } = await db.from("sc_online_videos").upsert(
      fresh.map((r) => ({
        company_id: companyId,
        url: r.url,
        title: r.title || "（タイトル未設定）",
        use_count: r.count ?? 1,
        last_used_at: r.lastUsedAt ?? null,
        source: "history",
      })),
      { onConflict: "company_id,url", ignoreDuplicates: true }
    );
    if (error) throw new Error(error.message);
  }
  for (const r of refs) {
    const e = byUrl.get(r.url);
    if (e && r.title && (!e.title || e.title === "（タイトル未設定）")) {
      await db.from("sc_online_videos").update({ title: r.title }).eq("id", e.id);
    }
  }
  return fresh.length;
}

/** 返信に出てきた動画をまとめる（タイトルは一番多く使われた書き方） */
export function collectVideos(messages: ParsedMessage[]) {
  const map = new Map<string, { titles: Map<string, number>; count: number; last: string }>();
  for (const m of messages) {
    if (m.direction !== "out" || m.kind !== "text") continue;
    for (const v of extractVideos(m.body)) {
      const e = map.get(v.url) ?? { titles: new Map(), count: 0, last: m.sentAt };
      e.count++;
      if (m.sentAt > e.last) e.last = m.sentAt;
      if (v.title) e.titles.set(v.title, (e.titles.get(v.title) ?? 0) + 1);
      map.set(v.url, e);
    }
  }
  return [...map.entries()].map(([url, e]) => ({
    url,
    title: [...e.titles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
    count: e.count,
    lastUsedAt: e.last,
  }));
}

export async function importParsedExport(
  db: Db,
  companyId: string,
  parsed: ParsedExport,
  opts: { memberId?: string } = {}
): Promise<ImportResult> {
  if (!parsed.messages.length) throw new Error("メッセージが1件も読めませんでした（LINEのトーク履歴CSVか確認してください）");
  let memberId = opts.memberId ?? null;
  let created = false;
  let memberName = parsed.member?.name ?? "";
  if (!memberId) {
    if (!parsed.member || !parsed.member.name) throw new Error("会員名が読み取れませんでした。会員を選んでから取り込んでください");
    const firstDay = parsed.messages[0].sentAt.slice(0, 10);
    const r = await findOrCreateMember(db, companyId, parsed.member, firstDay);
    memberId = r.id;
    created = r.created;
  } else {
    const { data } = await db.from("sc_online_members").select("name").eq("id", memberId).eq("company_id", companyId).maybeSingle();
    if (!data) throw new Error("会員が見つかりません");
    memberName = data.name as string;
  }

  let inserted = 0;
  for (let i = 0; i < parsed.messages.length; i += CHUNK) {
    const part = parsed.messages.slice(i, i + CHUNK).map((m) => ({
      company_id: companyId,
      member_id: memberId,
      direction: m.direction,
      kind: m.kind,
      sender: m.sender || null,
      body: m.body,
      sent_at: m.sentAt,
      source: "csv",
      fingerprint: m.fingerprint,
    }));
    const { data, error } = await db
      .from("sc_online_messages")
      .upsert(part, { onConflict: "member_id,fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    inserted += (data ?? []).length;
  }

  const videos = await upsertVideos(db, companyId, collectVideos(parsed.messages));
  await refreshMemberTimes(db, companyId, memberId!);
  return { memberId: memberId!, memberName, created, total: parsed.messages.length, inserted, videos };
}
