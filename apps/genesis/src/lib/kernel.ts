import "server-only";
// (経営ダッシュボード: 事業別ブレークダウン追加)
import { createAdmin } from "@/lib/supabase/admin";
import type { GenesisActor } from "@/lib/auth";
import { inDateWindow, isStaffMember, isTrialMember, PLACEHOLDER_LEAVE_REASONS } from "@yozan/core/members";

/** すべての重要操作をCompany Eventに記録する（MASTER_PROMPT 3-5） */
export async function logEvent(
  companyId: string,
  input: {
    event_type: string;
    title: string;
    description?: string;
    source?: string;
    source_type?: "human" | "system" | "ai" | "external";
    severity?: "info" | "notice" | "warning" | "critical";
    status?: string;
    priority?: number;
    amount?: number;
    tags?: string[];
    related_module_id?: string | null;
    related_staff_id?: string | null;
    raw_payload?: unknown;
    ai_summary?: string;
    ai_next_action?: string;
    human_approval_required?: boolean;
  }
): Promise<string | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("company_events")
    .insert({ company_id: companyId, ...input })
    .select("id")
    .single();
  return data?.id ?? null;
}

/** 監査ログ（既存audit_logs再利用、DECISIONS #16） */
export async function logAudit(
  actor: GenesisActor,
  action: string,
  tableName: string,
  recordId: string | null,
  before: unknown = null,
  after: unknown = null
) {
  const admin = createAdmin();
  await admin.from("audit_logs").insert({
    company_id: actor.companyId,
    actor_staff_id: actor.staffId,
    actor_type: "human",
    action,
    table_name: tableName,
    record_id: recordId,
    before,
    after,
  });
}

export type CockpitData = {
  devStatuses: Record<string, unknown>[];
  risks: Record<string, unknown>[];
  blockers: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  agents: Record<string, unknown>[];
  modules: Record<string, unknown>[];
  recentEvents: Record<string, unknown>[];
  kpis: Record<string, unknown>[];
};

/**
 * KPI 1行が「全社合算」なのか「その店舗の数字」なのか（#134）。
 * kpis に store_id が入る前（migration 0112 適用前）は必ず "company"＝全店合算になる。
 * 画面はこれをラベルで見せること。合算を黙って店舗の数字のように出さない。
 */
export type KpiScope = "company" | "store";

export function kpiScopeOf(k: Record<string, unknown>): KpiScope {
  return k.store_id ? "store" : "company";
}

/** KPIカードに出す範囲ラベル（#134） */
export function kpiScopeLabel(k: Record<string, unknown>): string {
  return kpiScopeOf(k) === "store" ? "店舗" : "全店合算";
}

/**
 * kpis を店舗スコープで選び直す（#134）。
 * - storeIds が null（cron・オーナー）→ 全社行（store_id なし）を優先し、無ければ全行
 * - storeIds あり → その店舗の行。無いコードは全社行にフォールバックする（＝ラベルが「全店合算」になる）
 * kpis.store_id は migration 0112（別作業）で入る。列が無い間も動くよう、JS側で選別している。
 */
function pickKpisForScope(rows: Record<string, unknown>[], storeIds: string[] | null): Record<string, unknown>[] {
  const hasStoreColumn = rows.some((r) => Object.prototype.hasOwnProperty.call(r, "store_id"));
  if (!hasStoreColumn) return rows; // 0112適用前＝全社行しか無い

  const companyRows = rows.filter((r) => r.store_id == null);
  if (!storeIds) {
    // 全社ビュー: 全社行があればそれだけ（店舗行と二重に並べない）
    return companyRows.length > 0 ? companyRows : rows;
  }
  const allowed = new Set(storeIds);
  const storeRows = rows.filter((r) => r.store_id != null && allowed.has(String(r.store_id)));
  const covered = new Set(storeRows.map((r) => String(r.code)));
  // 店舗別が無いコードだけ全社行で補う（数字が消えるより「全店合算」と分かって出るほうがよい）
  return [...storeRows, ...companyRows.filter((r) => !covered.has(String(r.code)))];
}

/** KPIだけを店舗スコープで取る（#134）。KPIカードだけ出す画面用 */
export async function getKpisForScope(
  companyId: string,
  storeIds?: string[] | null
): Promise<Record<string, unknown>[]> {
  const admin = createAdmin();
  const { data } = await admin.from("kpis").select("*").eq("company_id", companyId).is("deleted_at", null).order("code");
  return pickKpisForScope((data ?? []) as Record<string, unknown>[], Array.isArray(storeIds) ? storeIds : null);
}

/**
 * Cockpit/Command Center用の横断データ取得
 * @param storeIds 店舗スコープ（#134）。null/未指定＝会社全体（cron・AI実行系・オーナー）
 */
export async function getCockpitData(companyId: string, storeIds?: string[] | null): Promise<CockpitData> {
  const admin = createAdmin();
  const [devStatuses, risks, blockers, approvals, agents, modules, recentEvents, kpis] =
    await Promise.all([
      admin.from("development_statuses").select("*").eq("company_id", companyId).is("deleted_at", null).order("progress"),
      admin.from("risks").select("*").eq("company_id", companyId).is("deleted_at", null).eq("status", "open").order("severity"),
      admin.from("blockers").select("*").eq("company_id", companyId).is("deleted_at", null).eq("status", "open"),
      admin.from("approval_requests").select("*").eq("company_id", companyId).eq("status", "pending").order("created_at", { ascending: false }).limit(20),
      admin.from("ai_agents").select("*").eq("company_id", companyId).is("deleted_at", null).order("code"),
      admin.from("modules").select("*").eq("company_id", companyId).is("deleted_at", null).order("sort_order"),
      admin.from("company_events").select("*").eq("company_id", companyId).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(15),
      admin.from("kpis").select("*").eq("company_id", companyId).is("deleted_at", null).order("code"),
    ]);
  return {
    devStatuses: devStatuses.data ?? [],
    risks: risks.data ?? [],
    blockers: blockers.data ?? [],
    approvals: approvals.data ?? [],
    agents: agents.data ?? [],
    modules: modules.data ?? [],
    recentEvents: recentEvents.data ?? [],
    // #134: 店舗スコープで選び直す（0112で store_id が入るまでは全社行のまま返る）
    kpis: pickKpisForScope((kpis.data ?? []) as Record<string, unknown>[], Array.isArray(storeIds) ? storeIds : null),
  };
}

/* ============================================================
   VISION準拠のCEO AIロジック（正典: docs/genesis/VISION.md）
   §5「YOZAN全体スコア」「今日の古川さんの判断リスト」§3「毎日出すもの」
   LLM不使用のルールベース（決定的・説明可能・クレジット消費ゼロ）
   ============================================================ */

/** VISION §6 最重要KPI 5つ（GOLF WINGの命） */
export const CORE_KPI_CODES = ["monthly_sales", "members", "trial_bookings", "churn_rate", "labor_cost_ratio"] as const;

/** 低いほど良いKPI（目標比の判定を反転） */
const LOWER_IS_BETTER = new Set(["churn_rate", "labor_cost_ratio", "labor_cost"]);

export type JudgmentItem = {
  kind: "approval" | "blocker" | "risk" | "kpi";
  title: string;
  detail?: string;
  href: string;
  /**
   * 全体スコアからの減点（省略＝0点）。DECISIONS #43。
   * computeGenesisScore が見ない外部チェック（KPI整合性・法務）が、
   * 自分の重みを申告してスコアに反映させるための欄。
   * これが無いと「判断リストに警告3件あるのにスコア100点」になる。
   */
  weight?: number;
  /** スコアの説明（factors）に出す短いラベル。weight>0のとき必須相当 */
  scoreLabel?: string;
};

export type GenesisScore = {
  score: number; // 0-100
  grade: "good" | "watch" | "danger";
  factors: string[]; // 減点理由（説明可能性）
};

function kpiOf(d: CockpitData, code: string): Record<string, unknown> | undefined {
  return d.kpis.find((k) => k.code === code);
}

/** KPIが目標未達か（value/targetが揃っている場合のみ判定） */
function kpiMissTarget(k: Record<string, unknown>): boolean {
  if (k.current_value == null || k.target_value == null) return false;
  const v = Number(k.current_value);
  const t = Number(k.target_value);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t === 0) return false;
  return LOWER_IS_BETTER.has(String(k.code)) ? v > t : v < t;
}

/** YOZAN全体スコア（VISION §5）: 100点から減点方式 */
export function computeGenesisScore(d: CockpitData): GenesisScore {
  let score = 100;
  const factors: string[] = [];

  if (d.blockers.length > 0) {
    score -= d.blockers.length * 10;
    factors.push(`ブロッカー${d.blockers.length}件 (-${d.blockers.length * 10})`);
  }
  const high = d.risks.filter((r) => ["high", "critical"].includes(String(r.severity))).length;
  const low = d.risks.length - high;
  if (high > 0) {
    score -= high * 6;
    factors.push(`高リスク${high}件 (-${high * 6})`);
  }
  if (low > 0) {
    score -= low * 2;
    factors.push(`リスク${low}件 (-${low * 2})`);
  }
  if (d.approvals.length > 0) {
    score -= d.approvals.length * 3;
    factors.push(`承認待ち${d.approvals.length}件 (-${d.approvals.length * 3})`);
  }

  let disconnected = 0;
  let missed = 0;
  for (const code of CORE_KPI_CODES) {
    const k = kpiOf(d, code);
    if (!k || k.current_value == null) disconnected++;
    else if (kpiMissTarget(k)) missed++;
  }
  if (disconnected > 0) {
    score -= disconnected * 4;
    factors.push(`5大KPI未接続${disconnected}件 (-${disconnected * 4})`);
  }
  if (missed > 0) {
    score -= missed * 8;
    factors.push(`5大KPI目標未達${missed}件 (-${missed * 8})`);
  }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? "good" : score >= 60 ? "watch" : "danger";
  return { score, grade, factors };
}

/**
 * 外部チェック（KPI整合性 #37 / 法務 #40）の判断項目をスコアへ反映する（DECISIONS #43）。
 * computeGenesisScore は CockpitData しか見ないため、これらは従来スコアに載らず
 * 「警告が出ているのに100点」という事故が起きていた（2026-07-11 発見）。
 *
 * 数字の整合性違反は「経営判断の土台が嘘」なので最も重い減点にする。
 */
export function applyJudgmentPenalties(base: GenesisScore, items: JudgmentItem[]): GenesisScore {
  let score = base.score;
  const factors = [...base.factors];

  // 同じラベルはまとめて「〇〇2件 (-24)」と出す（説明可能性）
  const byLabel = new Map<string, { count: number; total: number }>();
  for (const it of items) {
    const w = Number(it.weight ?? 0);
    if (!Number.isFinite(w) || w <= 0) continue;
    const label = it.scoreLabel ?? "要対応";
    const cur = byLabel.get(label) ?? { count: 0, total: 0 };
    byLabel.set(label, { count: cur.count + 1, total: cur.total + w });
  }
  for (const [label, v] of byLabel) {
    score -= v.total;
    factors.push(`${label}${v.count}件 (-${v.total})`);
  }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? "good" : score >= 60 ? "watch" : "danger";
  return { score, grade, factors };
}

/** 今日の判断リスト（VISION §5）: 古川さんが今日決めるべきこと */
export function buildJudgmentList(d: CockpitData): JudgmentItem[] {
  const items: JudgmentItem[] = [];

  for (const a of d.approvals) {
    items.push({ kind: "approval", title: `承認判断: ${String(a.kind ?? "承認リクエスト")}`, href: "/approvals" });
  }
  for (const b of d.blockers) {
    items.push({
      kind: "blocker",
      title: `ブロッカー解消の指示: ${String(b.title)}`,
      detail: b.needs != null ? `解消条件: ${String(b.needs)}` : undefined,
      href: "/dev",
    });
  }
  for (const r of d.risks.filter((r) => ["high", "critical"].includes(String(r.severity)))) {
    items.push({ kind: "risk", title: `リスク対応の判断: ${String(r.title)}`, href: "/dev" });
  }
  for (const code of CORE_KPI_CODES) {
    const k = kpiOf(d, code);
    if (k && k.current_value != null && kpiMissTarget(k)) {
      items.push({
        kind: "kpi",
        title: `KPI目標未達への打ち手: ${String(k.name)}（${Number(k.current_value).toLocaleString("ja-JP")}${k.unit} / 目標${Number(k.target_value).toLocaleString("ja-JP")}${k.unit}）`,
        href: "/future",
      });
    }
  }
  // 未接続KPIの入力促し（最大2件、判断というより日課）
  const disconnected = CORE_KPI_CODES.filter((c) => {
    const k = kpiOf(d, c);
    return !k || k.current_value == null;
  }).slice(0, 2);
  for (const code of disconnected) {
    const k = kpiOf(d, code);
    items.push({
      kind: "kpi",
      title: `KPI入力/接続: ${String(k?.name ?? code)}`,
      detail: k?.notes != null ? String(k.notes) : undefined,
      href: code === "monthly_sales" ? "/finance" : "/command",
    });
  }
  return items;
}

/**
 * アラート（整合性・法務・KPI）の確認済み判定キー（#101 判断フィードの確認ボタン修正）。
 * kind＋title をそのままキーにする＝ title に金額・比率・現在値が入っているため、
 * 内容が変わればキーも変わり、確認済みでも自動的に再表示される。
 */
export function alertKey(item: JudgmentItem): string {
  return `${item.kind}::${item.title}`;
}

/** 確認済みアラートのキー集合を取得（gn_alert_acks、0092） */
export async function getAckedAlertKeys(companyId: string): Promise<Set<string>> {
  const admin = createAdmin();
  const { data } = await admin.from("gn_alert_acks").select("alert_key").eq("company_id", companyId);
  return new Set((data ?? []).map((r) => String((r as { alert_key: string }).alert_key)));
}

/* ============================================================
   事業別 → 店舗ドリルダウン（経営ダッシュボード用）
   事業の器 = fin_segments、当月の実績を fin_entries から集計。
   店舗 = stores。事業→店舗の対応はコードで定義（DBにFKが無いため）。
   数字が無い箇所は捏造せず hasData=false / 0 で返し、UI側で明示する。
   ============================================================ */

export type StoreMetric = {
  id: string;
  name: string;
  operating: boolean; // 当月シフトがあれば稼働中、無ければ準備中扱い
  staff: number;
  shifts: number; // 当月シフト数
  trials: number; // 当月体験（一時利用者名簿 visit_type='trial'）
  members: number; // 在籍会員数（スタッフ除外・leave_date無し）
  joins: number; // 今月入会数（本会員・スタッフ除外）
  leavesCore: number; // 今月退会（本会員＝トライアル・スタッフ除く）痛い退会
  leavesTrial: number; // 今月退会（トライアル会員）想定内
  leaveReasons: string[]; // 今月の本会員退会の主な理由（重複除去・未記入除外）
  revenue: number | null; // 当月売上（事業→店舗が1:1のとき按分、不明はnull）
};

export type SegmentLine = { name: string; kind: string; amount: number };

export type SegmentMetric = {
  code: string;
  name: string;
  revenue: number;
  cogs: number;
  expense: number;
  profit: number;
  hasFinance: boolean; // 当月に財務入力があるか
  stores: StoreMetric[];
  /** 収支のカテゴリ別内訳（#83: カードタップでざっくり見える用） */
  lines: SegmentLine[];
};

export type BusinessBreakdown = {
  monthLabel: string; // PL表示の対象＝最新の完了月（進行中の当月は除外）
  segments: SegmentMetric[];
  forecastMonthLabel: string; // 当月（進行中）
  forecastTotal: number; // 当月の予測売上合計（source='forecast'、主に月会費予測）
  /** 店舗を特定できず集計から外した会員数（#134: 静かに宝塚へ寄せるのをやめ、見える化する） */
  unmatchedMembers: number;
  /** 店舗名が分からなかった store_name の実例（最大5件・表記ゆれの手当てをするための手がかり） */
  unmatchedStoreNames: string[];
  /** この結果が actor の所属店舗で絞られているか（false＝全店＝オーナー/cron） */
  scoped: boolean;
};

/** 事業(fin_segment)コード → 配下店舗の判定（DBにマッピングが無いため名称で対応付け） */
function storesForSegment(code: string, stores: { id: string; name: string }[]) {
  if (code === "golf") return stores.filter((s) => s.name.includes("GOLF WING"));
  // 姫路店は表記ゆれ（FRANK が正・DB上は FRUNK の旧名が残る場合あり）を両方拾う
  if (code === "himeji") return stores.filter((s) => s.name.includes("FRANK") || s.name.includes("FRUNK") || s.name.includes("姫路"));
  return [];
}

/**
 * 会員名簿の store_name（Smart Hello由来のテキスト）→ store.id へ対応付け。
 * store_id列が無いためアプリ層で正規化。新店舗名が増えたらここに追記する。
 *
 * #134: 以前は「該当しなければGOLF WING」を既定にしていたため、FRANK会員が宝塚に混ざっていた。
 * 表記ゆれで判定できないものは null（＝不明）を返し、集計から外して件数を見せる。
 * 数字を静かに間違えるより、分からないことを見えるようにする。
 */
export function storeIdForMemberStoreName(storeName: string | null, stores: { id: string; name: string }[]): string | null {
  const n = (storeName ?? "").trim();
  if (!n) return null;
  const find = (kw: string) => stores.find((s) => s.name.includes(kw))?.id ?? null;
  // 姫路（FRANK GOLF）— FRANK が正・DB上は FRUNK の旧名が残る場合あり
  if (n.includes("FRANK") || n.includes("FRUNK") || n.includes("フランク") || n.includes("姫路"))
    return find("FRANK") ?? find("FRUNK") ?? find("姫路");
  // 宝塚（GOLF WING）— 明示的に一致した場合のみ寄せる（既定にはしない）
  if (
    n.toUpperCase().includes("GOLF WING") ||
    n.toUpperCase().includes("GOLFWING") ||
    n.includes("ゴルフウィング") ||
    n.includes("ゴルフウイング") ||
    n.includes("宝塚")
  )
    return find("GOLF WING") ?? find("宝塚");
  // 店舗名そのものと一致するなら採用（新店舗が増えても拾える保険）
  return stores.find((s) => n.includes(s.name) || s.name.includes(n))?.id ?? null;
}

/**
 * 店舗スコープの共通適用（#134）。allowed が null なら素通し＝会社全体（cron・AI実行系はactorが無い）。
 * UI非表示ではなくクエリ段階で切るための共通口。
 */
function scopeStore<T>(q: T, allowed: Set<string> | null, column = "store_id"): T {
  if (!allowed) return q;
  return (q as unknown as { in: (c: string, v: string[]) => T }).in(column, storeInValues(allowed));
}

/**
 * `.in()` に渡す値。配属店舗ゼロのときに空配列を渡すと PostgREST が構文エラーになるため、
 * 「絶対に一致しないID」を1つ入れて 0件 にする（#134）。エラーで画面を落とさない。
 */
export function storeInValues(allowed: Set<string>): string[] {
  return allowed.size > 0 ? Array.from(allowed) : ["00000000-0000-0000-0000-000000000000"];
}

/**
 * 事業別 → 店舗ドリルダウン。
 * @param storeIds 見てよい店舗（#134）。null/未指定＝会社全体（cron・AI実行系はactorが無いのでこちら）。
 *                 オーナーは全店比較を見てよいので画面側も null を渡す。
 */
export async function getBusinessBreakdown(companyId: string, storeIds?: string[] | null): Promise<BusinessBreakdown> {
  const admin = createAdmin();
  const scoped = Array.isArray(storeIds);
  const allowed = scoped ? new Set(storeIds) : null;

  // 財務の最新入力月を特定
  // PL表示は「最新の完了月」＝進行中の当月(monthStart以降)を除外した最新月
  const { data: latest } = await admin
    .from("fin_entries")
    .select("target_month")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .lt("target_month", monthStart())
    .order("target_month", { ascending: false })
    .limit(1);
  const month: string | null = latest?.[0]?.target_month ?? null;

  // 当月（進行中）の予測売上合計（月会費予測など source='forecast'）
  const { data: fcRows } = await admin
    .from("fin_entries")
    .select("amount")
    .eq("company_id", companyId)
    .eq("source", "forecast")
    .gte("target_month", monthStart())
    .is("deleted_at", null);
  const forecastTotal = (fcRows ?? []).reduce((s, r) => s + (Number((r as { amount: number | string }).amount) || 0), 0);

  const [segRes, catRes, entRes, storeRes, assignRes, shiftRes, trialRes, memberRes] = await Promise.all([
    admin.from("fin_segments").select("id,name,code").eq("company_id", companyId).is("deleted_at", null),
    admin.from("fin_categories").select("id,kind,name").eq("company_id", companyId).is("deleted_at", null),
    month
      ? admin.from("fin_entries").select("segment_id,category_id,amount").eq("company_id", companyId).eq("target_month", month).is("deleted_at", null)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // stores だけは会社全件を取る（会員名簿の store_name 突き合わせに全店の名前が要るため）。
    // 表示に使う店舗は下で allowed に絞る（#134）
    admin.from("stores").select("id,name,brand_id").eq("company_id", companyId).is("deleted_at", null),
    // #134: 店舗またぎ廃止。allowed が指定されていれば、店舗に紐づくデータはその範囲だけを取る
    scopeStore(admin.from("staff_store_assignments").select("store_id").eq("company_id", companyId).is("deleted_at", null), allowed),
    scopeStore(admin.from("shifts").select("store_id,date").eq("company_id", companyId).gte("date", monthStart()), allowed),
    // 体験は一時利用者名簿（0018で mbr_trial_bookings から移行済・#93）。当月来店分のみ
    scopeStore(
      admin
        .from("mbr_walkin_visits")
        .select("store_id")
        .eq("company_id", companyId)
        .eq("visit_type", "trial")
        .is("deleted_at", null)
        .gte("visited_on", monthStart()),
      allowed
    ),
    // 会員名簿には store_id が無い（store_nameのテキストのみ）ので、店舗の絞りはアプリ側で行う
    admin.from("mbr_members").select("store_name,member_type,join_date,leave_date,leave_reason").eq("company_id", companyId),
  ]);

  const segments = (segRes.data ?? []) as { id: string; name: string; code: string }[];
  const catKind = new Map<string, string>();
  const catName = new Map<string, string>();
  for (const c of (catRes.data ?? []) as { id: string; kind: string; name: string }[]) {
    catKind.set(c.id, c.kind);
    catName.set(c.id, c.name);
  }
  // allStores＝名寄せ用（会社全店）／stores＝表示・集計に使う店舗（actorのスコープ・#134）
  const allStores = (storeRes.data ?? []) as { id: string; name: string }[];
  const stores = allowed ? allStores.filter((s) => allowed.has(s.id)) : allStores;

  // 店舗別カウント
  const countBy = (rows: { store_id: string | null }[] | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      if (!r.store_id) continue;
      m.set(r.store_id, (m.get(r.store_id) ?? 0) + 1);
    }
    return m;
  };
  const staffByStore = countBy(assignRes.data as { store_id: string | null }[]);
  const shiftByStore = countBy(shiftRes.data as { store_id: string | null }[]);
  const trialByStore = countBy(trialRes.data as { store_id: string | null }[]);

  // 会員名簿を店舗別に集計（在籍会員数・今月入会・今月退会）
  // 当月ウィンドウ [月初, 翌月初)。leave_date は月末付の退会予定日なので範囲判定する。
  const from = monthStart(); // "YYYY-MM-01"
  const to = nextMonthStart(); // "翌月-01"（ISO日付なので文字列比較で当月判定可能）
  const inThisMonth = (d: string | null) => inDateWindow(d, from, to);
  const memberByStore = new Map<string, number>();
  const joinByStore = new Map<string, number>();
  const leaveCoreByStore = new Map<string, number>();
  const leaveTrialByStore = new Map<string, number>();
  const reasonsByStore = new Map<string, Set<string>>();
  const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);
  // 会員の分類ルール（スタッフ除外・トライアル区別・退会理由の除外語）の正典は @yozan/core/members（#84）
  // #134: 店舗を特定できない会員は「不明」として集計から外し、件数と実例を返す（黙って宝塚に足さない）
  let unmatchedMembers = 0;
  const unmatchedNames = new Set<string>();

  for (const mem of (memberRes.data ?? []) as {
    store_name: string | null;
    member_type: string | null;
    join_date: string | null;
    leave_date: string | null;
    leave_reason: string | null;
  }[]) {
    if (isStaffMember(mem.member_type)) continue; // スタッフは顧客会員から除外（不明カウントにも入れない）
    // 名寄せは会社全店の名前で行う（スコープで店舗を減らすと「不明」が増えて数字が歪むため）
    const sid = storeIdForMemberStoreName(mem.store_name, allStores);
    if (!sid) {
      unmatchedMembers += 1;
      const raw = (mem.store_name ?? "").trim();
      if (unmatchedNames.size < 5) unmatchedNames.add(raw || "(店舗名なし)");
      continue;
    }
    if (allowed && !allowed.has(sid)) continue; // 自店舗以外は集計しない（#134）
    const isTrial = isTrialMember(mem.member_type);

    if (!mem.leave_date && !isTrial) bump(memberByStore, sid); // 在籍（本会員）
    if (inThisMonth(mem.join_date) && !isTrial) bump(joinByStore, sid); // 今月入会（本会員）
    if (inThisMonth(mem.leave_date)) {
      if (isTrial) {
        bump(leaveTrialByStore, sid); // トライアル退会（想定内）
      } else {
        bump(leaveCoreByStore, sid); // 本会員退会（痛い）
        const r = (mem.leave_reason ?? "").trim();
        if (!PLACEHOLDER_LEAVE_REASONS.has(r)) {
          if (!reasonsByStore.has(sid)) reasonsByStore.set(sid, new Set());
          reasonsByStore.get(sid)!.add(r);
        }
      }
    }
  }

  const storeMetric = (s: { id: string; name: string }, revenue: number | null): StoreMetric => {
    const shifts = shiftByStore.get(s.id) ?? 0;
    const members = memberByStore.get(s.id) ?? 0;
    return {
      id: s.id,
      name: s.name,
      operating: shifts > 0 || members > 0,
      staff: staffByStore.get(s.id) ?? 0,
      shifts,
      trials: trialByStore.get(s.id) ?? 0,
      members,
      joins: joinByStore.get(s.id) ?? 0,
      leavesCore: leaveCoreByStore.get(s.id) ?? 0,
      leavesTrial: leaveTrialByStore.get(s.id) ?? 0,
      leaveReasons: Array.from(reasonsByStore.get(s.id) ?? []).slice(0, 3),
      revenue,
    };
  };

  // 事業別 財務集計（当月）＋カテゴリ別内訳（#83）
  const bySeg = new Map<string, { revenue: number; cogs: number; expense: number }>();
  const linesBySeg = new Map<string, Map<string, SegmentLine>>();
  for (const e of (entRes.data ?? []) as { segment_id: string; category_id: string; amount: number | string }[]) {
    const kind = catKind.get(e.category_id);
    if (!kind || !e.segment_id) continue;
    const acc = bySeg.get(e.segment_id) ?? { revenue: 0, cogs: 0, expense: 0 };
    const amt = Number(e.amount) || 0;
    if (kind === "revenue") acc.revenue += amt;
    else if (kind === "cogs") acc.cogs += amt;
    else if (kind === "expense") acc.expense += amt;
    bySeg.set(e.segment_id, acc);

    if (kind === "revenue" || kind === "cogs" || kind === "expense") {
      const name = catName.get(e.category_id) ?? "その他";
      const m = linesBySeg.get(e.segment_id) ?? new Map<string, SegmentLine>();
      const line = m.get(name) ?? { name, kind, amount: 0 };
      line.amount += amt;
      m.set(name, line);
      linesBySeg.set(e.segment_id, m);
    }
  }

  const result: SegmentMetric[] = segments.map((seg) => {
    const f = bySeg.get(seg.id) ?? { revenue: 0, cogs: 0, expense: 0 };
    const hasFinance = f.revenue !== 0 || f.cogs !== 0 || f.expense !== 0;
    const segStores = storesForSegment(seg.code, stores);
    // 事業→店舗が1:1のときのみ、当月売上を店舗へ按分（複数店は不明=null）
    const perStoreRevenue = segStores.length === 1 && hasFinance ? f.revenue : null;
    return {
      code: seg.code,
      name: seg.name,
      revenue: f.revenue,
      cogs: f.cogs,
      expense: f.expense,
      profit: f.revenue - f.cogs - f.expense,
      hasFinance,
      stores: segStores.map((s) => storeMetric(s, perStoreRevenue)),
      lines: Array.from(linesBySeg.get(seg.id)?.values() ?? []).sort((a, b) => {
        const rank = (k: string) => (k === "revenue" ? 0 : k === "cogs" ? 1 : 2);
        if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
        return b.amount - a.amount;
      }),
    };
  });

  // 並び順: 配下店舗がある事業 → 財務入力がある事業 → その他
  result.sort((a, b) => {
    const rank = (s: SegmentMetric) => (s.stores.length > 0 ? 0 : s.hasFinance ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return b.revenue - a.revenue;
  });

  return {
    monthLabel: month ? fmtMonth(month) : "—",
    segments: result,
    forecastMonthLabel: fmtMonth(monthStart()),
    forecastTotal,
    unmatchedMembers,
    unmatchedStoreNames: Array.from(unmatchedNames),
    scoped,
  };
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function nextMonthStart(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtMonth(d: string): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月`;
}
