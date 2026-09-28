/**
 * Ops ドメインの Tool（店舗運営: 予約・受付・シフト・勤怠・伝票）
 *
 * booking.create / booking.cancel / walkin.add は apps/genesis/src/lib/ai-execution.ts（#186）の
 * ハンドラを移したもの。ロジックは変えていない（打席 A→B→C・レフティは B・キャンセルは消さず status）。
 * ai-execution 側は P0 からこの Tool に委譲する。
 */
import { defineTool, type ToolContract } from "../tool.ts";
import { viewQuery, lit, isYmd, src, rows, addDays, inclusiveRange, storeLike, STORE_IN } from "./_shared.ts";
import { effectiveActor } from "../context.ts";

const BOOKED = "frunk_bookings";

export const bookingList = defineTool({
  name: "booking.list",
  version: 1,
  domain: "ops",
  description: "指定日の打席予約（FRANK GOLF）を一覧する。キャンセルは除く。複数日は date と days（例: 明日から3日 = date=明日, days=3）",
  input: { type: "object", properties: { date: { type: "string", format: "date", description: "YYYY-MM-DD（省略時は今日）" }, days: { type: "integer", minimum: 1, maximum: 14, default: 1, description: "date からの日数（1=その日だけ）" } } },
  output: { type: "object", properties: { rows: { type: "array" }, count: { type: "integer" }, date: { type: "string" } }, required: ["rows", "count"] },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "BookingList",
  impl: async (input, ctx) => {
    const date = isYmd(input.date) ? input.date : ctx.context.time.jstDate;
    const to = addDays(date, Number(input.days ?? 1));
    const data = await viewQuery(
      ctx.admin,
      ctx.context,
      `select booked_date, start_time, end_time, bay_name, customer_name, member_no, customer_kind, status, payment_status, note from gnv_bookings where booked_date >= ${lit(date)} and booked_date < ${lit(to)} and status <> 'cancelled' order by booked_date, start_time, bay_name`
    );
    return rows(data, "gnv_bookings", { data: { date } });
  },
});

export const bookingCreate = defineTool({
  name: "booking.create",
  version: 1,
  domain: "ops",
  description: "FRANK の打席予約を入れる（GOLF WING は Smart Hello のため不可）。打席は A→B→C の順で空きを探す・レフティは B。入れてから5分は取り消せる",
  input: {
    type: "object",
    required: ["date", "start"],
    properties: {
      date: { type: "string", format: "date" },
      start: { type: "string", pattern: "^\\d{2}:\\d{2}", description: "HH:MM" },
      minutes: { type: "integer", minimum: 30, maximum: 240, default: 60 },
      member_no: { type: "string", description: "会員番号（FR0001 など）" },
      guest_name: { type: "string", description: "会員でない方のお名前" },
      phone: { type: "string" },
      lefty: { type: "boolean", default: false },
      bay_name: { type: "string" },
      party_size: { type: "integer", minimum: 1, maximum: 6, default: 1 },
      note: { type: "string" },
      source: { type: "string", default: "jarvis" },
    },
  },
  output: { type: "object", required: ["booking_id", "date", "start"], properties: { booking_id: { type: "string" }, bay: { type: "string" }, date: { type: "string" }, start: { type: "string" }, end: { type: "string" }, who: { type: "string" } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 2,
  idempotency: (i, ctx) => `${ctx.company.id}:${i.date}:${i.start}:${i.member_no ?? i.guest_name ?? ""}`,
  rateLimit: { perMinute: 20 },
  emits: ["reservation.created@1"],
  renders: "BookingCard",
  undo: async (out, ctx) => {
    await ctx.call("booking.cancel@1", { booking_id: out.booking_id });
  },
  verify: async (out, ctx) => {
    const { data } = await ctx.admin.from(BOOKED).select("id, status").eq("id", out.booking_id).maybeSingle();
    return !!data && data.status !== "cancelled";
  },
  impl: async (p, ctx) => {
    const { admin } = ctx;
    const companyId = ctx.context.company.id;
    // 打席予約を受ける店舗と会員表は Pack（#306）。無い会社では使えない（黙って別の店に入れない）
    const storeId = ctx.pack.bookingStoreId;
    if (!storeId) throw new Error(`この会社（Pack: ${ctx.pack.name}）では打席予約 Tool が設定されていません`);
    const memberTable = ctx.pack.memberTable;
    const date = String(p.date);
    const start = String(p.start).slice(0, 5);
    const minutes = Number(p.minutes ?? 60);
    const { loadBookingCfg, businessHours, toMin, toTime } = await import("@yozan/core/frank-booking");
    const cfg = await loadBookingCfg(admin);
    const hours = businessHours(date, cfg);
    if (!hours) throw new Error(`${date} は定休日です`);
    const s0 = toMin(start);
    const e0 = s0 + minutes;
    if (s0 < toMin(hours.open) || e0 > toMin(hours.close)) throw new Error(`営業時間（${hours.open}〜${hours.close}）の外です`);

    let memberId: string | null = null;
    let memberName: string | null = null;
    const memberNo = p.member_no ? String(p.member_no).trim() : "";
    if (memberNo) {
      if (!memberTable) throw new Error("この会社では会員番号での予約は受けられません（お名前で）");
      const { data: m } = await admin.from(memberTable.table).select("id, name").eq("company_id", companyId).eq(memberTable.storeCol, storeId).eq(memberTable.noCol, memberNo).is("deleted_at", null).maybeSingle();
      if (!m) throw new Error(`会員番号 ${memberNo} が見つかりません`);
      memberId = String(m.id);
      memberName = String(m.name);
    }
    const guestName = String(p.guest_name ?? "").trim();
    if (!memberId && !guestName) throw new Error("お名前か会員番号が要ります（持ち主の分からない予約は作らない）");

    const wantLefty = p.lefty === true;
    const { data: bays } = await admin.from("frunk_bays").select("id, name, is_lefty, sort").eq("company_id", companyId).eq("active", true).is("deleted_at", null).order("sort", { ascending: true });
    let candidates = ((bays ?? []) as Array<{ id: string; name: string; is_lefty: boolean }>).filter((b) => (wantLefty ? b.is_lefty === true : true));
    if (p.bay_name) {
      const want = String(p.bay_name);
      candidates = candidates.filter((b) => String(b.name).includes(want));
      if (candidates.length === 0) throw new Error(`打席「${want}」が見つかりません`);
    }
    if (candidates.length === 0) throw new Error(wantLefty ? "レフティ用の打席が空いていません" : "使える打席がありません");

    // 実行の瞬間に重なりを見直す（積んだ時点と5分後で状況が変わる）
    const { data: sameDay } = await admin.from(BOOKED).select("bay_id, start_time, end_time").eq("company_id", companyId).eq("store_id", storeId).eq("booked_date", date).neq("status", "cancelled").is("deleted_at", null);
    const taken = (bayId: string) => ((sameDay ?? []) as Array<{ bay_id: string; start_time: string; end_time: string }>).some((b) => String(b.bay_id) === bayId && s0 < toMin(String(b.end_time)) && e0 > toMin(String(b.start_time)));
    const bay = candidates.find((b) => !taken(String(b.id)));
    if (!bay) throw new Error(`${date} ${start} は空いている打席がありません`);

    const { data: created, error } = await admin
      .from(BOOKED)
      .insert({
        company_id: companyId,
        store_id: storeId,
        member_id: memberId,
        customer_kind: memberId ? "member" : "dropin",
        guest_name: memberId ? null : guestName,
        guest_phone: p.phone ? String(p.phone) : null,
        party_size: Number(p.party_size ?? 1),
        bay_id: bay.id,
        booked_date: date,
        start_time: start,
        end_time: toTime(e0),
        status: "confirmed",
        source: String(p.source ?? "jarvis"),
        note: p.note ? String(p.note) : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const who = memberName ?? guestName;
    const out = { booking_id: String(created.id), bay: String(bay.name), date, start, end: toTime(e0), who };
    await ctx.emit("reservation.created", 1, { ...out, summary: `予約を登録: ${date} ${start} ${bay.name} ${who}` }, { kind: "reservation", id: out.booking_id });
    return { data: out, sources: [src(BOOKED)], kind: "fact" };
  },
});

export const bookingCancel = defineTool({
  name: "booking.cancel",
  version: 1,
  domain: "ops",
  description: "打席予約を取り消す。消さずに status='cancelled' にする（経緯を残す）",
  input: { type: "object", required: ["booking_id"], properties: { booking_id: { type: "string", format: "uuid" }, reason: { type: "string" } } },
  output: { type: "object", required: ["booking_id"], properties: { booking_id: { type: "string" }, cancelled: { type: "boolean" }, already: { type: "boolean" } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 2,
  idempotency: (i) => `cancel:${i.booking_id}`,
  rateLimit: { perMinute: 20 },
  emits: ["reservation.cancelled@1"],
  renders: "BookingCard",
  undo: async (out, ctx) => {
    // 取り消しの取り消し＝confirmed に戻す（空きの再検証は行わない: 直前まで自分が持っていた枠）
    await ctx.admin.from(BOOKED).update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("id", out.booking_id);
  },
  verify: async (out, ctx) => {
    const { data } = await ctx.admin.from(BOOKED).select("status").eq("id", out.booking_id).maybeSingle();
    return data?.status === "cancelled";
  },
  impl: async (p, ctx) => {
    const { admin } = ctx;
    const id = String(p.booking_id);
    const { data: b } = await admin.from(BOOKED).select("id, booked_date, start_time, status").eq("company_id", ctx.context.company.id).eq("id", id).is("deleted_at", null).maybeSingle();
    if (!b) throw new Error("その予約が見つかりません");
    if (String(b.status) === "cancelled") return { data: { booking_id: id, cancelled: true, already: true }, sources: [src(BOOKED)] };
    const { error } = await admin.from(BOOKED).update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    await ctx.emit("reservation.cancelled", 1, { booking_id: id, summary: `予約を取り消し: ${String(b.booked_date)} ${String(b.start_time).slice(0, 5)}` }, { kind: "reservation", id });
    return { data: { booking_id: id, cancelled: true, already: false }, sources: [src(BOOKED)] };
  },
});

export const walkinAdd = defineTool({
  name: "walkin.add",
  version: 1,
  domain: "ops",
  description: "受付台帳に来店・体験を1件載せる。同じ人の同じ日は二重に載せない",
  input: {
    type: "object",
    required: ["guest_name", "visited_on"],
    properties: {
      guest_name: { type: "string", minLength: 1 },
      visited_on: { type: "string", format: "date" },
      store_id: STORE_IN,
      visit_type: { type: "string", enum: ["trial", "visit", "fitting", "lesson"], default: "trial" },
      kana: { type: "string" },
      phone: { type: "string" },
      note: { type: "string" },
    },
  },
  output: { type: "object", required: ["walkin_id"], properties: { walkin_id: { type: "string" }, guest: { type: "string" }, visited_on: { type: "string" }, already: { type: "boolean" } } },
  permission: ["use_reception", "view_hq"],
  scope: "store",
  risk: 2,
  idempotency: (i, ctx) => `${ctx.company.id}:${i.store_id ?? ""}:${i.guest_name}:${i.visited_on}`,
  rateLimit: { perMinute: 20 },
  emits: ["visit.recorded@1"],
  renders: "EntityCard",
  undo: async (out, ctx) => {
    await ctx.admin.from("mbr_walkin_visits").update({ deleted_at: new Date().toISOString() }).eq("id", out.walkin_id);
  },
  verify: async (out, ctx) => {
    const { data } = await ctx.admin.from("mbr_walkin_visits").select("id").eq("id", out.walkin_id).is("deleted_at", null).maybeSingle();
    return !!data;
  },
  impl: async (p, ctx) => {
    const { admin } = ctx;
    const companyId = ctx.context.company.id;
    const name = String(p.guest_name).trim();
    const visitedOn = String(p.visited_on);
    const storeId = (typeof p.store_id === "string" && p.store_id) || effectiveActor(ctx.context.actor).primaryStoreId;
    if (!storeId) throw new Error("店舗が特定できません");
    const { data: g } = await admin.from("mbr_guests").select("id").eq("company_id", companyId).eq("store_id", storeId).eq("name", name).is("deleted_at", null).maybeSingle();
    let guestId = g?.id ? String(g.id) : null;
    if (!guestId) {
      const { data: ng, error: ge } = await admin.from("mbr_guests").insert({ company_id: companyId, store_id: storeId, name, name_kana: p.kana ? String(p.kana) : null, mobile: p.phone ? String(p.phone) : null }).select("id").single();
      if (ge) throw new Error(ge.message);
      guestId = String(ng.id);
    } else {
      const { data: dup } = await admin.from("mbr_walkin_visits").select("id").eq("company_id", companyId).eq("guest_id", guestId).eq("visited_on", visitedOn).is("deleted_at", null).maybeSingle();
      if (dup) return { data: { walkin_id: String(dup.id), guest: name, visited_on: visitedOn, already: true }, sources: [src("mbr_walkin_visits")] };
    }
    const { data: created, error } = await admin
      .from("mbr_walkin_visits")
      .insert({ company_id: companyId, store_id: storeId, guest_id: guestId, visited_on: visitedOn, visit_type: String(p.visit_type ?? "trial"), note: p.note ? String(p.note) : null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const out = { walkin_id: String(created.id), guest: name, visited_on: visitedOn, already: false };
    await ctx.emit("visit.recorded", 1, { walkin_id: out.walkin_id, visited_on: visitedOn, visit_type: String(p.visit_type ?? "trial"), guest: name, summary: `受付台帳に登録: ${visitedOn} ${name}` }, { kind: "person", id: guestId! });
    return { data: out, sources: [src("mbr_walkin_visits")] };
  },
});

export const shiftView = defineTool({
  name: "shift.view",
  version: 1,
  domain: "ops",
  description: "期間のシフト（出勤予定）を見る。店舗・スタッフ・時間。1日だけなら from と to に同じ日。store で店舗を絞れる（'GOLF WING' / 'FRANK'。無指定は全店）",
  input: { type: "object", properties: { from: { type: "string", format: "date", description: "開始日（省略時は今日）" }, to: { type: "string", format: "date", description: "終了日（この日を含む）" }, days: { type: "integer", minimum: 1, maximum: 31, default: 7, description: "to が無いときの日数" }, store: { type: "string", description: "店舗名で絞る（GOLF WING / FRANK / 宝塚 / 姫路）。無指定は全店" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" }, from: { type: "string" }, to: { type: "string" } } },
  permission: [],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "ShiftGrid",
  impl: async (input, ctx) => {
    const { from, to } = inclusiveRange(input.from, input.to, Number(input.days ?? 7), ctx.context.time.jstDate);
    const st = storeLike(input.store, ctx.pack);
    const data = await viewQuery(ctx.admin, ctx.context, `select date, staff_name, store_name, start_time, end_time, is_day_off, status from gnv_shifts where date >= ${lit(from)} and date < ${lit(to)}${st ? ` and store_name like ${lit(st)}` : ""} order by date, store_name, start_time`, 500);
    return rows(data, "gnv_shifts", { data: { from, to } });
  },
});

export const attendanceSummary = defineTool({
  name: "attendance.summary",
  version: 1,
  domain: "ops",
  description: "期間の勤怠実績をスタッフ別に集計（労働分・残業分・打刻漏れ）。to はその日を含む",
  input: { type: "object", properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date", description: "終了日（この日を含む）" }, store: { type: "string", description: "店舗名で絞る（無指定は全店）" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: ["view_hq", "manage_shifts", "manage_attendance"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 30 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const from0 = isYmd(input.from) ? input.from : addDays(ctx.context.time.jstDate, -30);
    const { from, to } = inclusiveRange(from0, input.to, 31, ctx.context.time.jstDate);
    const data = await viewQuery(
      ctx.admin,
      ctx.context,
      `select staff_name, store_name, count(*) as days, sum(work_minutes) as work_minutes, sum(overtime_minutes) as overtime_minutes, sum(case when is_missing_clock then 1 else 0 end) as missing_clock from gnv_attendance where date >= ${lit(from)} and date < ${lit(to)}${storeLike(input.store, ctx.pack) ? ` and store_name like ${lit(storeLike(input.store, ctx.pack)!)}` : ""} group by staff_name, store_name order by store_name, staff_name`
    );
    return rows(data, "gnv_attendance", { data: { from, to } });
  },
});

export const ordersToday = defineTool({
  name: "orders.today",
  version: 1,
  domain: "ops",
  description: "今日のモバイルオーダー（FRANK）の件数・金額・未提供",
  input: { type: "object", properties: { date: { type: "string", format: "date" } } },
  output: { type: "object", required: ["rows", "count"], properties: { rows: { type: "array" }, count: { type: "integer" } } },
  permission: ["use_reception", "view_hq"],
  scope: "company",
  risk: 0,
  idempotency: () => null,
  rateLimit: { perMinute: 60 },
  emits: [],
  renders: "Table",
  impl: async (input, ctx) => {
    const date = isYmd(input.date) ? input.date : ctx.context.time.jstDate;
    const data = await viewQuery(ctx.admin, ctx.context, `select status, count(*) as orders, sum(amount) as amount from gnv_orders where ordered_on = ${lit(date)} group by status order by status`);
    return rows(data, "gnv_orders", { data: { date } });
  },
});

export const OPS_TOOLS: ToolContract[] = [bookingList, bookingCreate, bookingCancel, walkinAdd, shiftView, attendanceSummary, ordersToday] as unknown as ToolContract[];
