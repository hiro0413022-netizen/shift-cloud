"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@/lib/supabase/admin";
import { callAi, extractJson, hasAiKey } from "@/lib/ai";
import {
  assertOnlineActor, loadMember, loadThread, loadVideos, loadProfile, loadExamplePairs, forgetExamplePairs,
  type ThreadItem,
} from "@/lib/online/data";
import {
  buildSystemPrompt, buildUserPrompt, buildRewritePrompt, cleanDraft, fallbackDraft, pickExamples, rankVideos,
  buildPairs, waitInfo, withDefaults, type ReplyOptions, type DraftJson, type OnlineProfile,
} from "@/lib/online/reply";
import { parseLineExport, nameKeyOf, extractVideos, normalizeYoutubeUrl } from "@/lib/online/line-csv";
import { importParsedExport, refreshMemberTimes, findOrCreateMember } from "@/lib/online/import";

/**
 * オンラインレッスン・モードのサーバーアクション（2026-09-15）
 * どれも先頭で assertOnlineActor() → company_id で必ず絞る。
 * 送信はしない。LINEに貼るのは本人。ここで扱うのは「下書き」と「送った記録」だけ。
 */

type Ok<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

/* ================= 返信文をつくる ================= */

export async function generateReply(input: {
  memberId: string;
  incoming: string;
  memo: string;
  options: ReplyOptions;
}): Promise<Ok<{ replyId: string | null; reply: string; focus: string[]; aiUsed: boolean }>> {
  try {
    const actor = await assertOnlineActor();
    const admin = createAdmin();
    const member = await loadMember(actor.companyId, input.memberId);
    if (!member) throw new Error("会員が見つかりません");
    const [thread, videos, profile, allPairs] = await Promise.all([
      loadThread(actor.companyId, member.id, 120),
      loadVideos(actor.companyId),
      loadProfile(actor.companyId),
      loadExamplePairs(actor.companyId),
    ]);
    const query = `${input.incoming}\n${input.memo}\n${member.focus.join(" ")}`;
    const others = allPairs.filter((p) => p.memberName !== member.name);
    const examples = pickExamples(others, query, 4);
    const memberExamples = buildPairs(thread).slice(-2);
    const cands = rankVideos(
      videos.map((v) => ({ url: v.url, title: v.title, tags: v.tags, useCount: v.useCount })),
      `${input.memo}\n${member.focus.join(" ")}`,
      10,
      input.incoming
    );
    const wait = waitInfo(member.lastInAt, member.lastOutAt);

    let reply = "";
    let focus: string[] = [];
    let aiUsed = false;
    if (hasAiKey()) {
      const raw = await callAi({
        system: buildSystemPrompt(profile, member.plan),
        user: buildUserPrompt({
          member: { name: member.name, plan: member.plan, goal: member.goal, profile: member.profile, focus: member.focus, memo: member.memo, startedOn: member.startedOn },
          thread,
          incoming: input.incoming,
          memo: input.memo,
          options: input.options,
          examples,
          memberExamples,
          videos: cands,
          waitingHours: wait.waiting ? wait.hours : 0,
        }),
        maxTokens: 1400,
        json: true,
      });
      const parsed = raw ? extractJson<DraftJson>(raw) : null;
      if (parsed?.reply) {
        const c = cleanDraft(parsed, cands.map((v) => v.url));
        reply = c.reply;
        focus = c.focus;
        aiUsed = true;
      }
    }
    if (!reply) {
      reply = fallbackDraft({ memo: input.memo, options: input.options, video: input.memo.trim() ? cands[0] ?? null : null });
    }
    const sig = withDefaults(profile).signature?.trim();
    if (sig && !reply.includes(sig)) reply = `${reply}\n\n${sig}`;

    const { data } = await admin
      .from("sc_online_replies")
      .insert({
        company_id: actor.companyId,
        member_id: member.id,
        incoming: input.incoming || null,
        memo: input.memo || null,
        options: input.options,
        ai_draft: reply,
        status: "draft",
        created_by: actor.staffId,
      })
      .select("id")
      .single();
    return { ok: true, replyId: (data?.id as string) ?? null, reply, focus, aiUsed };
  } catch (e) {
    return fail(e);
  }
}

export async function rewriteReply(input: { text: string; instruction: string }): Promise<Ok<{ reply: string }>> {
  try {
    await assertOnlineActor();
    if (!input.text.trim()) throw new Error("下書きが空です");
    if (!hasAiKey()) throw new Error("AIの設定がまだのため書き直しは使えません（本文は手で直せます）");
    const urls = [...input.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
    const raw = await callAi({
      system: "あなたはゴルフコーチのLINE返信の編集者です。口調を保ったまま指示どおりに整えます。",
      user: buildRewritePrompt(input.text, input.instruction),
      maxTokens: 1200,
      json: true,
    });
    const parsed = raw ? extractJson<DraftJson>(raw) : null;
    if (!parsed?.reply) throw new Error("書き直しに失敗しました。もう一度お試しください");
    return { ok: true, reply: cleanDraft(parsed, urls).reply };
  } catch (e) {
    return fail(e);
  }
}

/* ================= LINEに送った（記録） ================= */

export async function markSent(input: {
  memberId: string;
  replyId: string | null;
  finalBody: string;
  /** 貼り付けた会員のメッセージ（履歴に無いときだけ保存する） */
  incoming?: string;
  focus?: string[] | null;
}): Promise<Ok<{ message: ThreadItem }>> {
  try {
    const actor = await assertOnlineActor();
    const admin = createAdmin();
    const body = input.finalBody.trim();
    if (!body) throw new Error("本文が空です");
    const member = await loadMember(actor.companyId, input.memberId);
    if (!member) throw new Error("会員が見つかりません");
    const now = new Date();

    // 貼り付けた相談文が履歴に無ければ、先に「受信」として残す
    const incoming = (input.incoming ?? "").trim();
    if (incoming) {
      const recent = await loadThread(actor.companyId, member.id, 30);
      const key = nameKeyOf(incoming).slice(0, 60);
      const exists = recent.some((m) => m.direction === "in" && key && nameKeyOf(m.body).includes(key.slice(0, 30)));
      if (!exists) {
        await admin.from("sc_online_messages").insert({
          company_id: actor.companyId,
          member_id: member.id,
          direction: "in",
          kind: "text",
          body: incoming,
          sent_at: new Date(now.getTime() - 1000).toISOString(),
          source: "paste",
          fingerprint: `paste|${crypto.randomUUID()}`,
        });
      }
    }

    const { data: msg, error } = await admin
      .from("sc_online_messages")
      .insert({
        company_id: actor.companyId,
        member_id: member.id,
        direction: "out",
        kind: "text",
        sender: "app",
        body,
        sent_at: now.toISOString(),
        source: "app",
        fingerprint: `app|${crypto.randomUUID()}`,
      })
      .select("id, direction, kind, body, sent_at, source")
      .single();
    if (error) throw new Error(error.message);

    if (input.replyId) {
      await admin
        .from("sc_online_replies")
        .update({ final_body: body, status: "sent", sent_at: now.toISOString(), message_id: msg.id })
        .eq("id", input.replyId)
        .eq("company_id", actor.companyId);
    } else {
      await admin.from("sc_online_replies").insert({
        company_id: actor.companyId, member_id: member.id, incoming: incoming || null,
        final_body: body, status: "sent", sent_at: now.toISOString(), message_id: msg.id, created_by: actor.staffId,
      });
    }

    // 使った動画の回数を足す
    const urls = extractVideos(body).map((v) => v.url);
    if (urls.length) {
      const { data: vids } = await admin
        .from("sc_online_videos")
        .select("id, use_count")
        .eq("company_id", actor.companyId)
        .in("url", urls);
      for (const v of (vids ?? []) as { id: string; use_count: number }[]) {
        await admin.from("sc_online_videos").update({ use_count: v.use_count + 1, last_used_at: now.toISOString() }).eq("id", v.id);
      }
    }

    if (input.focus) {
      await admin
        .from("sc_online_members")
        .update({ focus: input.focus.map((t) => t.trim()).filter(Boolean).slice(0, 5) })
        .eq("id", member.id)
        .eq("company_id", actor.companyId);
    }
    await refreshMemberTimes(admin, actor.companyId, member.id);
    forgetExamplePairs(actor.companyId);
    revalidatePath("/online");
    return {
      ok: true,
      message: { id: msg.id, direction: "out", kind: "text", body: msg.body, sentAt: msg.sent_at, source: msg.source },
    };
  } catch (e) {
    return fail(e);
  }
}

/** 会員のメッセージを貼って「受信」として残すだけ（返信は後で） */
export async function addIncoming(input: { memberId: string; text: string }): Promise<Ok<{ message: ThreadItem }>> {
  try {
    const actor = await assertOnlineActor();
    const admin = createAdmin();
    const text = input.text.trim();
    if (!text) throw new Error("メッセージが空です");
    const member = await loadMember(actor.companyId, input.memberId);
    if (!member) throw new Error("会員が見つかりません");
    const { data, error } = await admin
      .from("sc_online_messages")
      .insert({
        company_id: actor.companyId, member_id: member.id, direction: "in", kind: "text", body: text,
        sent_at: new Date().toISOString(), source: "paste", fingerprint: `paste|${crypto.randomUUID()}`,
      })
      .select("id, direction, kind, body, sent_at, source")
      .single();
    if (error) throw new Error(error.message);
    await refreshMemberTimes(admin, actor.companyId, member.id);
    revalidatePath("/online");
    return { ok: true, message: { id: data.id, direction: "in", kind: "text", body: data.body, sentAt: data.sent_at, source: data.source } };
  } catch (e) {
    return fail(e);
  }
}

export async function loadOlder(input: { memberId: string; before: string }): Promise<Ok<{ items: ThreadItem[] }>> {
  try {
    const actor = await assertOnlineActor();
    const items = await loadThread(actor.companyId, input.memberId, 80, input.before);
    return { ok: true, items };
  } catch (e) {
    return fail(e);
  }
}

/* ================= 会員 ================= */

export async function saveMember(input: {
  memberId: string;
  name?: string;
  plan?: string;
  status?: string;
  mark?: string | null;
  goal?: string | null;
  profile?: string | null;
  memo?: string | null;
  focus?: string[];
  startedOn?: string | null;
}): Promise<Ok<object>> {
  try {
    const actor = await assertOnlineActor();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("名前は空にできません");
      patch.name = name;
      patch.name_key = nameKeyOf(name);
    }
    if (input.plan !== undefined) {
      if (!["regular", "premium", "other"].includes(input.plan)) throw new Error("プランが不正です");
      patch.plan = input.plan;
    }
    if (input.status !== undefined) {
      if (!["active", "paused", "left"].includes(input.status)) throw new Error("状態が不正です");
      patch.status = input.status;
    }
    if (input.mark !== undefined) patch.mark = input.mark?.trim() || null;
    if (input.goal !== undefined) patch.goal = input.goal?.trim() || null;
    if (input.profile !== undefined) patch.profile = input.profile?.trim() || null;
    if (input.memo !== undefined) patch.memo = input.memo?.trim() || null;
    if (input.startedOn !== undefined) patch.started_on = input.startedOn || null;
    if (input.focus !== undefined) patch.focus = input.focus.map((f) => f.trim()).filter(Boolean).slice(0, 5);
    const { error } = await createAdmin()
      .from("sc_online_members")
      .update(patch)
      .eq("id", input.memberId)
      .eq("company_id", actor.companyId);
    if (error) throw new Error(error.message.includes("uq_sc_online_members_key") ? "同じ名前の会員がすでにいます" : error.message);
    revalidatePath("/online");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createMember(input: { name: string; plan: string }): Promise<Ok<{ memberId: string }>> {
  try {
    const actor = await assertOnlineActor();
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) throw new Error("名前を入れてください");
    const plan = ["regular", "premium", "other"].includes(input.plan) ? input.plan : "regular";
    const r = await findOrCreateMember(
      createAdmin(),
      actor.companyId,
      { name, nameKey: nameKeyOf(name), lineName: null, plan, mark: null },
      new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
    );
    if (!r.created) throw new Error("同じ名前の会員がすでにいます");
    revalidatePath("/online");
    return { ok: true, memberId: r.id };
  } catch (e) {
    return fail(e);
  }
}

/* ================= 取り込み ================= */

export async function importLineCsv(input: {
  fileName: string;
  text: string;
  memberId?: string | null;
}): Promise<Ok<{ memberId: string; memberName: string; created: boolean; total: number; inserted: number; videos: number }>> {
  try {
    const actor = await assertOnlineActor();
    const parsed = parseLineExport(input.text, input.fileName);
    const r = await importParsedExport(createAdmin(), actor.companyId, parsed, { memberId: input.memberId ?? undefined });
    forgetExamplePairs(actor.companyId);
    revalidatePath("/online");
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

/* ================= 口調・ルール ================= */

export async function saveProfile(input: OnlineProfile): Promise<Ok<object>> {
  try {
    const actor = await assertOnlineActor();
    const clean: OnlineProfile = {
      coach_name: (input.coach_name ?? "").trim().slice(0, 40),
      service_name: (input.service_name ?? "").trim().slice(0, 60),
      tone: (input.tone ?? "").trim().slice(0, 2000),
      signature: (input.signature ?? "").trim().slice(0, 300),
      max_chars: Math.max(80, Math.min(1500, Number(input.max_chars) || 400)),
      plan_rules: {
        regular: (input.plan_rules?.regular ?? "").trim().slice(0, 1000),
        premium: (input.plan_rules?.premium ?? "").trim().slice(0, 1000),
        other: (input.plan_rules?.other ?? "").trim().slice(0, 1000),
      },
    };
    const { error } = await createAdmin()
      .from("sc_settings")
      .update({ online_profile: clean })
      .eq("company_id", actor.companyId);
    if (error) throw new Error(error.message);
    revalidatePath("/online/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ================= 動画ライブラリ ================= */

export async function saveVideo(input: { id?: string | null; url: string; title: string; tags: string[]; note?: string | null }): Promise<Ok<{ id: string }>> {
  try {
    const actor = await assertOnlineActor();
    const url = normalizeYoutubeUrl(input.url) ?? input.url.trim();
    if (!/^https?:\/\//.test(url)) throw new Error("URLを確認してください");
    const title = input.title.trim();
    if (!title) throw new Error("タイトルを入れてください");
    const row = {
      company_id: actor.companyId,
      url,
      title,
      tags: input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 12),
      note: input.note?.trim() || null,
      deleted_at: null,
    };
    const admin = createAdmin();
    if (input.id) {
      const { error } = await admin.from("sc_online_videos").update(row).eq("id", input.id).eq("company_id", actor.companyId);
      if (error) throw new Error(error.message.includes("uq_sc_online_videos_url") ? "同じURLの動画がすでにあります" : error.message);
      revalidatePath("/online/videos");
      return { ok: true, id: input.id };
    }
    const { data, error } = await admin
      .from("sc_online_videos")
      .upsert({ ...row, source: "manual" }, { onConflict: "company_id,url" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/online/videos");
    return { ok: true, id: data.id as string };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteVideo(id: string): Promise<Ok<object>> {
  try {
    const actor = await assertOnlineActor();
    await createAdmin().from("sc_online_videos").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
    revalidatePath("/online/videos");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ================= 定型文 ================= */

export async function saveTemplate(input: { id?: string | null; title: string; body: string; sortOrder?: number }): Promise<Ok<{ id: string }>> {
  try {
    const actor = await assertOnlineActor();
    const title = input.title.trim();
    if (!title) throw new Error("タイトルを入れてください");
    if (!input.body.trim()) throw new Error("本文を入れてください");
    const admin = createAdmin();
    if (input.id) {
      const { error } = await admin
        .from("sc_online_templates")
        .update({ title, body: input.body, ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}) })
        .eq("id", input.id)
        .eq("company_id", actor.companyId);
      if (error) throw new Error(error.message);
      revalidatePath("/online/templates");
      return { ok: true, id: input.id };
    }
    const { data, error } = await admin
      .from("sc_online_templates")
      .insert({ company_id: actor.companyId, title, body: input.body, sort_order: input.sortOrder ?? 900 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/online/templates");
    return { ok: true, id: data.id as string };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTemplate(id: string): Promise<Ok<object>> {
  try {
    const actor = await assertOnlineActor();
    await createAdmin().from("sc_online_templates").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
    revalidatePath("/online/templates");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reorderTemplates(ids: string[]): Promise<Ok<object>> {
  try {
    const actor = await assertOnlineActor();
    const admin = createAdmin();
    await Promise.all(
      ids.map((id, i) => admin.from("sc_online_templates").update({ sort_order: (i + 1) * 10 }).eq("id", id).eq("company_id", actor.companyId))
    );
    revalidatePath("/online/templates");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
