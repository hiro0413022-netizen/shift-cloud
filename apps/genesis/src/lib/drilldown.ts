import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { storeIdForMemberStoreName, storeInValues } from "@/lib/kernel";
import { isStaffMember, isTrialMember, PLACEHOLDER_LEAVE_REASONS, inDateWindow } from "@yozan/core/members";
import { MEMBER_OS_URL, MONEY_OS_URL, SHIFT_CLOUD_URL } from "@/lib/store-links";
import { jstYmd } from "@/lib/jst";

/**
 * 数字のドリルダウン（#244 ⑦）
 * ユーザー要望「会員数を押したらフランクゴルフとゴルフウィングの会員数が見れて、さらに押したら種別も見れる」。
 * どの数字も同じ3段: 全店 → 店舗 → 種別 → その人（外部アプリの会員カードへ）。
 *
 * 数字の出どころ（画面に必ず出す）:
 * - 会員: GOLF WING = mbr_members（Smart Hello 名簿・スタッフ/トライアル除外）、FRANK = frunk_members（#237）
 * - 体験・入会率: mbr_walkin_visits（visit_type='trial'・#93）
 * - 退会: 当月 leave_date
 * - 売上: fin_entries（当月・予測を除く）
 * 店舗スコープ（#134）: storeIds が配列ならその店だけ。
 */
export type DrillMetric = "members" | "monthly_sales" | "trial_bookings" | "conversion_rate" | "churn_rate" | "labor_cost";

export const DRILL_METRICS: Record<DrillMetric, string> = {
  members: "会員数",
  monthly_sales: "今月の売上",
  trial_bookings: "体験予約",
  conversion_rate: "体験からの入会率",
  churn_rate: "退会",
  labor_cost: "人件費",
};

export function isDrillMetric(v: unknown): v is DrillMetric {
  return typeof v === "string" && v in DRILL_METRICS;
}

export type DrillRow = {
  key: string;
  label: string;
  value: number;
  unit: string;
  sub?: string | null;
  /** 次の段へ（GENESIS内）。null なら終端 */
  next?: string | null;
  /** 外部アプリで開く（その人の会員カードなど） */
  external?: string | null;
};

export type DrillLevel = {
  metric: DrillMetric;
  crumbs: { label: string; href: string }[];
  title: string;
  total: { value: number; unit: string };
  rows: DrillRow[];
  source: string;
  actions: { label: string; href: string; external?: boolean }[];
  note?: string | null;
};

type Store = { id: string; name: string; code: string | null };

function monthWindow() {
  const today = jstYmd(); // YYYY-MM-DD（JST）
  const [y, m] = today.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const to = `${ny}-${String(nm).padStart(2, "0")}-01`;
  return { from, to, today };
}

const drillHref = (metric: DrillMetric, store?: string | null, kind?: string | null) => {
  const p = new URLSearchParams({ drill: metric });
  if (store) p.set("store", store);
  if (kind) p.set("kind", kind);
  return `/?${p.toString()}`;
};

export async function getDrill(
  companyId: string,
  storeIds: string[] | null,
  metric: DrillMetric,
  storeId: string | null,
  kind: string | null
): Promise<DrillLevel> {
  const admin = createAdmin();
  const allowed = Array.isArray(storeIds) ? new Set(storeIds) : null;
  const { data: storeRows } = await admin.from("stores").select("id,name,code").eq("company_id", companyId).eq("kind", "store").is("deleted_at", null).order("name"); // 本部（kind='hq'）は店舗ではない（#253）
  const allStores = (storeRows ?? []) as Store[];
  const stores = allowed ? allStores.filter((s) => allowed.has(s.id)) : allStores;
  const isFrank = (s: Store) => (s.code ?? "").startsWith("frunk");
  // 声からの指定は別名（alias:frank / alias:gw）で来る（jarvis-pure.detectStoreAlias）
  const store = storeId ? resolveStore(stores, storeId) : null;
  if (storeId && !store) {
    // 他店舗の直打ち（#134）は何も返さない
    return { metric, crumbs: [], title: DRILL_METRICS[metric], total: { value: 0, unit: "" }, rows: [], source: "", actions: [], note: "この店舗は見られません" };
  }
  const base = { label: DRILL_METRICS[metric], href: drillHref(metric) };
  const crumbs = [base, ...(store ? [{ label: store.name, href: drillHref(metric, store.id) }] : []), ...(kind ? [{ label: kind, href: drillHref(metric, storeId, kind) }] : [])];

  if (metric === "members") return membersDrill(admin, companyId, stores, allStores, isFrank, store, kind, crumbs, metric);
  if (metric === "trial_bookings" || metric === "conversion_rate") return trialsDrill(admin, companyId, stores, store, kind, crumbs, metric);
  if (metric === "churn_rate") return churnDrill(admin, companyId, stores, allStores, isFrank, store, kind, crumbs, metric);
  if (metric === "monthly_sales") return salesDrill(admin, companyId, stores, store, kind, crumbs, metric);
  return laborDrill(admin, companyId, stores, store, crumbs, metric);
}

type Admin = ReturnType<typeof createAdmin>;

/** 店舗の実ID or 別名（alias:frank / alias:gw）→ 店舗 */
export function resolveStore<S extends Store>(stores: S[], idOrAlias: string): S | null {
  if (idOrAlias === "alias:frank") return stores.find((s) => (s.code ?? "").startsWith("frunk") || /FRANK|FRUNK|姫路/.test(s.name)) ?? null;
  if (idOrAlias === "alias:gw") return stores.find((s) => /GOLF ?WING|宝塚/i.test(s.name)) ?? null;
  return stores.find((s) => s.id === idOrAlias) ?? null;
}

/* ---------------- 会員数 ---------------- */
async function membersDrill(
  admin: Admin,
  companyId: string,
  stores: Store[],
  allStores: Store[],
  isFrank: (s: Store) => boolean,
  store: Store | null,
  kind: string | null,
  crumbs: DrillLevel["crumbs"],
  metric: DrillMetric
): Promise<DrillLevel> {
  const source = "GOLF WING＝会員名簿（Smart Hello取込・スタッフとトライアルを除く）／FRANK GOLF＝入会フォームの会員台帳（在籍のみ）";
  const frankIds = stores.filter(isFrank).map((s) => s.id);

  const [gwRes, frRes, planRes] = await Promise.all([
    admin.from("mbr_members").select("id, name, member_no, store_name, member_type, leave_date, join_date").eq("company_id", companyId),
    frankIds.length
      ? admin
          .from("frunk_members")
          .select("id, name, member_no, store_id, status, plan_id, join_date")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["active", "suspended"])
          .in("store_id", storeInValues(new Set(frankIds)))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("frunk_plans").select("id, name").eq("company_id", companyId),
  ]);
  const planName = new Map<string, string>(((planRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  type GW = { id: string; name: string | null; member_no: string; store_name: string | null; member_type: string | null; leave_date: string | null; join_date: string | null; sid: string | null };
  const gw: GW[] = ((gwRes.data ?? []) as Omit<GW, "sid">[])
    .filter((m) => !isStaffMember(m.member_type) && !isTrialMember(m.member_type) && !m.leave_date)
    .map((m) => ({ ...m, sid: storeIdForMemberStoreName(m.store_name, allStores) }))
    .filter((m) => m.sid && !frankIds.includes(m.sid) && stores.some((s) => s.id === m.sid));
  type FR = { id: string; name: string; member_no: string | null; store_id: string; status: string; plan_id: string | null; join_date: string | null };
  const fr = (frRes.data ?? []) as FR[];
  const frKind = (m: FR) => (m.status === "suspended" ? "休会中" : planName.get(m.plan_id ?? "") ?? "プラン未設定");

  // 1段目: 店舗ごと
  if (!store) {
    const rows: DrillRow[] = stores.map((s) => {
      const n = isFrank(s) ? fr.filter((m) => m.store_id === s.id).length : gw.filter((m) => m.sid === s.id).length;
      return { key: s.id, label: s.name, value: n, unit: "名", next: drillHref(metric, s.id), sub: isFrank(s) ? "入会フォームの会員台帳" : "会員名簿" };
    });
    const total = rows.reduce((a, r) => a + r.value, 0);
    return { metric, crumbs, title: "会員数（店舗ごと）", total: { value: total, unit: "名" }, rows, source, actions: [{ label: "事業別の内訳", href: "/finance" }] };
  }

  // 2段目: 種別ごと
  const isF = isFrank(store);
  const members = isF ? fr.filter((m) => m.store_id === store.id) : gw.filter((m) => m.sid === store.id);
  const kindOf = (m: GW | FR) => (isF ? frKind(m as FR) : ((m as GW).member_type ?? "").trim() || "種別未設定");
  if (!kind) {
    const by = new Map<string, number>();
    for (const m of members) by.set(kindOf(m), (by.get(kindOf(m)) ?? 0) + 1);
    const rows: DrillRow[] = Array.from(by.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ key: k, label: k, value: n, unit: "名", next: drillHref(metric, store.id, k) }));
    return {
      metric,
      crumbs,
      title: `${store.name} の会員（種別ごと）`,
      total: { value: members.length, unit: "名" },
      rows,
      source,
      actions: isF
        ? [{ label: "FRANK会員一覧を開く", href: `${MEMBER_OS_URL}/frunk`, external: true }]
        : [{ label: "会員名簿（受付台帳）を開く", href: `${MEMBER_OS_URL}/search`, external: true }],
    };
  }

  // 3段目: その人たち
  const people = members.filter((m) => kindOf(m) === kind).slice(0, 200);
  const rows: DrillRow[] = people.map((m) => ({
    key: m.id,
    label: `${m.name ?? "（名前なし）"} 様`,
    value: 0,
    unit: "",
    sub: [m.member_no ?? null, m.join_date ? `入会 ${String(m.join_date).replace(/-/g, "/")}` : null].filter(Boolean).join("・"),
    external: isF ? `${MEMBER_OS_URL}/frunk/${m.id}` : `${MEMBER_OS_URL}/search?q=${encodeURIComponent(m.name ?? "")}`,
  }));
  return {
    metric,
    crumbs,
    title: `${store.name} ／ ${kind}`,
    total: { value: people.length, unit: "名" },
    rows,
    source,
    actions: [],
    note: people.length >= 200 ? "200名まで表示しています" : null,
  };
}

/* ---------------- 体験・入会率 ---------------- */
async function trialsDrill(
  admin: Admin,
  companyId: string,
  stores: Store[],
  store: Store | null,
  kind: string | null,
  crumbs: DrillLevel["crumbs"],
  metric: DrillMetric
): Promise<DrillLevel> {
  const { from, to } = monthWindow();
  const source = "受付台帳（体験区分・当月来店分）。入会率＝成約「入会」÷体験件数";
  let q = admin
    .from("mbr_walkin_visits")
    .select("id, store_id, visited_on, result, referral_source, guest_id, mbr_guests(name)")
    .eq("company_id", companyId)
    .eq("visit_type", "trial")
    .is("deleted_at", null)
    .gte("visited_on", from)
    .lt("visited_on", to)
    .order("visited_on", { ascending: false });
  q = q.in("store_id", storeInValues(new Set(stores.map((s) => s.id))));
  const { data } = await q;
  type V = { id: string; store_id: string | null; visited_on: string; result: string; referral_source: string | null; mbr_guests: { name: string | null } | { name: string | null }[] | null };
  const visits = (data ?? []) as unknown as V[];
  const nameOf = (v: V) => (Array.isArray(v.mbr_guests) ? v.mbr_guests[0]?.name : v.mbr_guests?.name) ?? "お客様";
  const isRate = metric === "conversion_rate";
  const rateOf = (vs: V[]) => (vs.length ? Math.round((vs.filter((v) => v.result === "join").length / vs.length) * 100) : 0);

  if (!store) {
    const rows: DrillRow[] = stores.map((s) => {
      const vs = visits.filter((v) => v.store_id === s.id);
      return isRate
        ? { key: s.id, label: s.name, value: rateOf(vs), unit: "%", sub: `体験 ${vs.length}件 ／ 入会 ${vs.filter((v) => v.result === "join").length}件`, next: drillHref(metric, s.id) }
        : { key: s.id, label: s.name, value: vs.length, unit: "件", sub: `入会 ${vs.filter((v) => v.result === "join").length}件`, next: drillHref(metric, s.id) };
    });
    return {
      metric,
      crumbs,
      title: isRate ? "体験からの入会率（店舗ごと・今月）" : "体験（店舗ごと・今月）",
      total: isRate ? { value: rateOf(visits), unit: "%" } : { value: visits.length, unit: "件" },
      rows,
      source,
      actions: [{ label: "体験の予約一覧", href: `${MEMBER_OS_URL}/trials`, external: true }],
    };
  }
  const vs = visits.filter((v) => v.store_id === store.id);
  const RESULT_LABEL: Record<string, string> = { join: "入会した", purchase: "購入した", none: "まだ決まっていない" };
  if (!kind) {
    const by = new Map<string, V[]>();
    for (const v of vs) {
      const k = RESULT_LABEL[v.result] ?? v.result;
      by.set(k, [...(by.get(k) ?? []), v]);
    }
    const rows: DrillRow[] = Array.from(by.entries()).map(([k, list]) => ({ key: k, label: k, value: list.length, unit: "件", next: drillHref(metric, store.id, k) }));
    return {
      metric,
      crumbs,
      title: `${store.name} の体験（結果ごと・今月）`,
      total: isRate ? { value: rateOf(vs), unit: "%" } : { value: vs.length, unit: "件" },
      rows,
      source,
      actions: [{ label: "フォロー一覧を開く", href: `${MEMBER_OS_URL}/follow`, external: true }],
    };
  }
  const list = vs.filter((v) => (RESULT_LABEL[v.result] ?? v.result) === kind);
  return {
    metric,
    crumbs,
    title: `${store.name} ／ ${kind}`,
    total: { value: list.length, unit: "件" },
    rows: list.map((v) => ({
      key: v.id,
      label: `${nameOf(v)} 様`,
      value: 0,
      unit: "",
      sub: [String(v.visited_on).replace(/-/g, "/"), v.referral_source].filter(Boolean).join("・"),
      external: `${MEMBER_OS_URL}/search?q=${encodeURIComponent(nameOf(v))}`,
    })),
    source,
    actions: [],
  };
}

/* ---------------- 退会 ---------------- */
async function churnDrill(
  admin: Admin,
  companyId: string,
  stores: Store[],
  allStores: Store[],
  isFrank: (s: Store) => boolean,
  store: Store | null,
  kind: string | null,
  crumbs: DrillLevel["crumbs"],
  metric: DrillMetric
): Promise<DrillLevel> {
  const { from, to } = monthWindow();
  const source = "当月に退会日が入った会員（GOLF WING＝会員名簿・理由つき／FRANK GOLF＝会員台帳）";
  const frankIds = stores.filter(isFrank).map((s) => s.id);
  const [gwRes, frRes] = await Promise.all([
    admin.from("mbr_members").select("id, name, store_name, member_type, leave_date, leave_reason").eq("company_id", companyId).not("leave_date", "is", null).gte("leave_date", from).lt("leave_date", to),
    frankIds.length
      ? admin.from("frunk_members").select("id, name, member_no, store_id, leave_date").eq("company_id", companyId).is("deleted_at", null).not("leave_date", "is", null).gte("leave_date", from).lt("leave_date", to).in("store_id", storeInValues(new Set(frankIds)))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  type L = { id: string; name: string | null; sid: string | null; reason: string; external: string; sub: string };
  const leaves: L[] = [];
  for (const m of (gwRes.data ?? []) as { id: string; name: string | null; store_name: string | null; member_type: string | null; leave_date: string; leave_reason: string | null }[]) {
    if (isStaffMember(m.member_type) || !inDateWindow(m.leave_date, from, to)) continue;
    const sid = storeIdForMemberStoreName(m.store_name, allStores);
    if (!sid || frankIds.includes(sid) || !stores.some((s) => s.id === sid)) continue;
    const r = (m.leave_reason ?? "").trim();
    leaves.push({
      id: m.id,
      name: m.name,
      sid,
      reason: isTrialMember(m.member_type) ? "トライアル会員（想定内）" : PLACEHOLDER_LEAVE_REASONS.has(r) || !r ? "理由の記入なし" : r,
      external: `${MEMBER_OS_URL}/search?q=${encodeURIComponent(m.name ?? "")}`,
      sub: `退会日 ${m.leave_date.replace(/-/g, "/")}`,
    });
  }
  for (const m of (frRes.data ?? []) as { id: string; name: string; member_no: string | null; store_id: string; leave_date: string }[]) {
    leaves.push({ id: m.id, name: m.name, sid: m.store_id, reason: "退会（FRANK）", external: `${MEMBER_OS_URL}/frunk/${m.id}`, sub: `${m.member_no ?? ""}・退会日 ${m.leave_date.replace(/-/g, "/")}` });
  }
  if (!store) {
    const rows: DrillRow[] = stores.map((s) => ({ key: s.id, label: s.name, value: leaves.filter((l) => l.sid === s.id).length, unit: "名", next: drillHref(metric, s.id) }));
    return { metric, crumbs, title: "今月の退会（店舗ごと）", total: { value: leaves.length, unit: "名" }, rows, source, actions: [] };
  }
  const ls = leaves.filter((l) => l.sid === store.id);
  if (!kind) {
    const by = new Map<string, number>();
    for (const l of ls) by.set(l.reason, (by.get(l.reason) ?? 0) + 1);
    const rows: DrillRow[] = Array.from(by.entries()).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: k, value: n, unit: "名", next: drillHref(metric, store.id, k) }));
    return { metric, crumbs, title: `${store.name} の退会（理由ごと・今月）`, total: { value: ls.length, unit: "名" }, rows, source, actions: [] };
  }
  const list = ls.filter((l) => l.reason === kind);
  return {
    metric,
    crumbs,
    title: `${store.name} ／ ${kind}`,
    total: { value: list.length, unit: "名" },
    rows: list.map((l) => ({ key: l.id, label: `${l.name ?? "（名前なし）"} 様`, value: 0, unit: "", sub: l.sub, external: l.external })),
    source,
    actions: [],
  };
}

/* ---------------- 売上 ---------------- */
async function salesDrill(
  admin: Admin,
  companyId: string,
  stores: Store[],
  store: Store | null,
  kind: string | null,
  crumbs: DrillLevel["crumbs"],
  metric: DrillMetric
): Promise<DrillLevel> {
  const { from } = monthWindow();
  const source = "Money OS の帳簿（fin_entries・当月・予測は除く）。事業ごとに集計";
  const [segRes, catRes, entRes] = await Promise.all([
    admin.from("fin_segments").select("id,name,code").eq("company_id", companyId).is("deleted_at", null),
    admin.from("fin_categories").select("id,kind,name").eq("company_id", companyId).is("deleted_at", null),
    admin.from("fin_entries").select("segment_id,category_id,amount,source").eq("company_id", companyId).gte("target_month", from).is("deleted_at", null),
  ]);
  const segs = (segRes.data ?? []) as { id: string; name: string; code: string }[];
  const cats = new Map<string, { kind: string; name: string }>(((catRes.data ?? []) as { id: string; kind: string; name: string }[]).map((c) => [c.id, c]));
  const ents = ((entRes.data ?? []) as { segment_id: string; category_id: string; amount: number | string; source: string | null }[]).filter(
    (e) => String(e.source ?? "") !== "forecast" && cats.get(e.category_id)?.kind === "revenue"
  );
  // 事業 → 店舗の対応（kernel.storesForSegment と同じ規則）
  const segStores = (code: string) =>
    code === "golf" ? stores.filter((s) => s.name.includes("GOLF WING")) : code === "himeji" ? stores.filter((s) => /FRANK|FRUNK|姫路/.test(s.name)) : [];
  // 店舗を持たない事業（キャディ派遣など）も売上は出す。店舗の段が無いので next は付けない
  const visibleSegs = segs;
  const sumOf = (segId: string) => ents.filter((e) => e.segment_id === segId).reduce((a, e) => a + (Number(e.amount) || 0), 0);

  // 「店舗」の段は事業で代用（売上は事業単位でしか記帳されていない）
  const seg = store ? segs.find((sg) => segStores(sg.code).some((s) => s.id === store.id)) ?? null : null;
  if (!store) {
    const rows: DrillRow[] = visibleSegs.map((sg) => {
      const st = segStores(sg.code)[0];
      return { key: sg.id, label: sg.name, value: sumOf(sg.id), unit: "円", sub: st ? st.name : "店舗なし", next: st ? drillHref(metric, st.id) : null };
    });
    return { metric, crumbs, title: "今月の売上（事業ごと）", total: { value: rows.reduce((a, r) => a + r.value, 0), unit: "円" }, rows, source, actions: [{ label: "事業別PL", href: "/finance" }, { label: "Money OS を開く", href: `${MONEY_OS_URL}/`, external: true }] };
  }
  if (!seg) return { metric, crumbs, title: `${store.name} の売上`, total: { value: 0, unit: "円" }, rows: [], source, actions: [], note: "この店舗に対応する事業がありません" };
  const by = new Map<string, number>();
  for (const e of ents.filter((e) => e.segment_id === seg.id)) {
    const n = cats.get(e.category_id)?.name ?? "その他";
    by.set(n, (by.get(n) ?? 0) + (Number(e.amount) || 0));
  }
  const rows: DrillRow[] = Array.from(by.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v, unit: "円", external: `${MONEY_OS_URL}/analysis` }));
  return {
    metric,
    crumbs,
    title: `${store.name}（${seg.name}）の売上（科目ごと・今月）`,
    total: { value: sumOf(seg.id), unit: "円" },
    rows,
    source,
    actions: [{ label: "Money OS の分析を開く", href: `${MONEY_OS_URL}/analysis`, external: true }],
    note: kind ? null : "科目を押すと Money OS の分析で明細まで見られます",
  };
}

/* ---------------- 人件費 ---------------- */
async function laborDrill(admin: Admin, companyId: string, stores: Store[], store: Store | null, crumbs: DrillLevel["crumbs"], metric: DrillMetric): Promise<DrillLevel> {
  const { from, to } = monthWindow();
  const { data } = await admin
    .from("shifts")
    .select("store_id, staff_id")
    .eq("company_id", companyId)
    .gte("date", from)
    .lt("date", to)
    .eq("status", "published")
    .in("store_id", storeInValues(new Set(stores.map((s) => s.id))));
  const shifts = (data ?? []) as { store_id: string | null; staff_id: string | null }[];
  const source = "確定シフト（当月）。金額は給与画面（Shift Cloud）で確定する";
  if (!store) {
    const rows: DrillRow[] = stores.map((s) => {
      const ss = shifts.filter((x) => x.store_id === s.id);
      return { key: s.id, label: s.name, value: ss.length, unit: "コマ", sub: `出勤する人 ${new Set(ss.map((x) => x.staff_id)).size}名`, next: drillHref(metric, s.id) };
    });
    return { metric, crumbs, title: "人件費（店舗ごと・確定シフト数）", total: { value: shifts.length, unit: "コマ" }, rows, source, actions: [{ label: "給与画面を開く", href: `${SHIFT_CLOUD_URL}/admin/payroll`, external: true }] };
  }
  const ss = shifts.filter((x) => x.store_id === store.id);
  const by = new Map<string, number>();
  for (const x of ss) by.set(String(x.staff_id), (by.get(String(x.staff_id)) ?? 0) + 1);
  const ids = Array.from(by.keys());
  const { data: staffRows } = ids.length ? await admin.from("staff").select("id,name").in("id", ids) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map<string, string>(((staffRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const rows: DrillRow[] = Array.from(by.entries()).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ key: id, label: nameOf.get(id) ?? "（不明）", value: n, unit: "コマ", external: `${SHIFT_CLOUD_URL}/admin/payroll` }));
  return { metric, crumbs, title: `${store.name} のシフト（人ごと・今月）`, total: { value: ss.length, unit: "コマ" }, rows, source, actions: [{ label: "給与画面を開く", href: `${SHIFT_CLOUD_URL}/admin/payroll`, external: true }] };
}
