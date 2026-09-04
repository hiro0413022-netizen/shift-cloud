import { toMin, bookingWho, CUSTOMER_KIND_LABEL } from "@yozan/core/frank-booking";

/**
 * 打席×時間タイムラインの配置計算（#135）
 *
 * ★ なぜ純関数だけ切り出すか
 *   打席×時間のグリッドが4か所（/dashboard・/reservations・/board・サイトのbooking.html）に
 *   コピーで増え、色分けまで食い違っていた（会員が sky と indigo でバラバラ）。
 *   「2回目で切り出す」ルール（MODULARIZATION_PLAN）に沿って、
 *   ・並べ方（どのコマに何マスぶん置くか）
 *   ・種別ごとの色
 *   をここ1か所に集約する。DBにもReactにも依存しないのでテストできる。
 *
 * ★ 向きは「縦＝時間・横＝打席」（ユーザー指示 2026-08-13）
 *   Smart Hello（GOLF WINGの現行システム）と同じ向き。以前は横が時間だったので転置した。
 *
 * ★ 高さ＝所要時間
 *   これまでの occupancy() は「30分コマごとに同じ予約を重複して返す」形だったため、
 *   55分の体験でも見た目は30分コマが2つ並ぶだけだった。
 *   ここでは開始コマにだけブロックを置き、残りのコマは "covered"（何も描かない）にして
 *   rowSpan で縦に伸ばす。＝所要時間ぶんの高さになる。
 */

// ------------------------------------------------------------------
// 種別と色（ここが唯一の定義。画面側でハードコードしないこと）
// ------------------------------------------------------------------

export type TimelineKind = "member" | "dropin" | "trial" | "lesson";

export const TIMELINE_KINDS: TimelineKind[] = ["member", "trial", "dropin", "lesson"];

export const TIMELINE_TONE: Record<TimelineKind, { block: string; dot: string; label: string; short: string }> = {
  // 会員＝シアン系（Smart Helloの「練習タイム」に相当）
  member: { block: "border-sky-300 bg-sky-100 text-sky-900", dot: "bg-sky-400", label: "会員", short: "会" },
  // 体験＝琥珀（初めてのお客様なので目立たせる）
  trial: { block: "border-amber-300 bg-amber-100 text-amber-900", dot: "bg-amber-400", label: "体験", short: "体" },
  // 都度利用＝緑
  dropin: { block: "border-emerald-300 bg-emerald-100 text-emerald-900", dot: "bg-emerald-400", label: "都度利用", short: "都" },
  // レッスン枠＝紫（Smart Helloの「パーソナル」に相当）
  lesson: { block: "border-violet-300 bg-violet-100 text-violet-900", dot: "bg-violet-400", label: "レッスン", short: "レ" },
};

// ------------------------------------------------------------------
// タイムラインに載せる1件
// ------------------------------------------------------------------

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  /** 打席。null＝打席指定なし（レッスン枠にはありうる）→ 表には置けないので別枠で出す */
  bayId: string | null;
  /** "HH:MM" または "HH:MM:SS"（DBのtime型はSS付きで返る） */
  start: string;
  end: string;
  /** お客様名など */
  title: string;
  /** 補足（人数・レフティ・来店/欠席など） */
  sub: string;
  /** 重要説明事項あり（⚠を出す） */
  alert: boolean;
  /** ⚠のツールチップ本文 */
  alertNote: string;
  /**
   * 25分パーソナルレッスンの状態（#214）。予約の色と印をここで決める。
   * null＝レッスンなし / "requested"＝ご希望（担当と時間が未確定）/ "confirmed"＝確定
   */
  lessonOpt: "requested" | "confirmed" | null;
  /** チケットでお支払い済み（レジで二重に請求しない） */
  lessonTicket: boolean;
  /** 担当コーチ名（確定していれば名前、ご指名だけなら指名された人） */
  lessonCoach: string;
  /** レッスンの開始時刻 "HH:MM"（確定時のみ） */
  lessonStart: string;
};

/** ブロックの表示用時刻「10:00-10:55」 */
export function timeRange(item: { start: string; end: string }): string {
  return `${item.start.slice(0, 5)}-${item.end.slice(0, 5)}`;
}

// ------------------------------------------------------------------
// DBの行 → TimelineItem（キャンセルはここで落とす）
// ------------------------------------------------------------------

/** frunk_bookings の1行（必要な列だけを構造的に受ける＝BookingRowをそのまま渡せる） */
export type BookingLike = {
  id: string;
  bay_id: string;
  start_time: string;
  end_time: string;
  status: string;
  customer_kind: string;
  guest_name: string | null;
  party_size: number | null;
  frunk_members: { name: string; alert_note: string | null } | null;
  mbr_trial_requests: { name: string; lefty: boolean } | null;
  /** 25分パーソナル（0136）。#214 で表にも出すようにした */
  lesson_option_status?: string | null;
  lesson_option_staff_id?: string | null;
  lesson_option_start?: string | null;
  lesson_option_minutes?: number | null;
  lesson_option_fee?: number | null;
};

/**
 * レッスン付き予約の見分け（#214・2026-09-04 ユーザー依頼「レッスンチケットを買うになっているかが分かりづらい」）
 *
 * 種別（会員/体験/都度）の色は変えない——変えると「何のお客様か」が読めなくなる。
 * **左端の太い縁と行の印**を足して、レッスン付きだけが目に入るようにする。
 */
export const LESSON_OPT_EDGE: Record<"requested" | "confirmed", string> = {
  requested: "border-l-4 border-l-amber-500",
  confirmed: "border-l-4 border-l-violet-600",
};

/** frunk_lesson_slots の1行 */
export type LessonLike = {
  id: string;
  bay_id: string | null;
  start_time: string;
  end_time: string;
  staff: { name: string } | null;
};

function kindOf(customerKind: string): TimelineKind {
  return customerKind === "trial" ? "trial" : customerKind === "member" ? "member" : "dropin";
}

export function bookingToItem(b: BookingLike, coachName?: (staffId: string) => string): TimelineItem {
  const note = b.frunk_members?.alert_note?.trim() ?? "";
  const sub = [
    CUSTOMER_KIND_LABEL[b.customer_kind] ?? "",
    b.mbr_trial_requests?.lefty ? "左" : "",
    b.party_size && b.party_size > 1 ? `${b.party_size}名` : "",
    b.status === "visited" ? "来店" : b.status === "no_show" ? "欠" : "",
  ]
    .filter(Boolean)
    .join("・");
  const st = b.lesson_option_status === "requested" || b.lesson_option_status === "confirmed" ? b.lesson_option_status : null;
  return {
    id: b.id,
    kind: kindOf(b.customer_kind),
    bayId: b.bay_id,
    start: b.start_time,
    end: b.end_time,
    title: bookingWho(b) || "ご予約",
    sub,
    alert: note !== "",
    alertNote: note,
    lessonOpt: st,
    // チケットで承ったぶんは料金0で保存している（#199）
    lessonTicket: st === "confirmed" && Number(b.lesson_option_fee ?? -1) === 0,
    lessonCoach: b.lesson_option_staff_id && coachName ? coachName(String(b.lesson_option_staff_id)) : "",
    lessonStart: st === "confirmed" && b.lesson_option_start ? String(b.lesson_option_start).slice(0, 5) : "",
  };
}

export function lessonToItem(l: LessonLike): TimelineItem {
  return {
    id: `lesson:${l.id}`,
    kind: "lesson",
    bayId: l.bay_id,
    start: l.start_time,
    end: l.end_time,
    title: "レッスン",
    sub: l.staff?.name ?? "",
    alert: false,
    alertNote: "",
    lessonOpt: null,
    lessonTicket: false,
    lessonCoach: "",
    lessonStart: "",
  };
}

/** ブロックに出す1行「🎫 レッスン14:30 小川うらら」（#214）。空文字＝出さない */
export function lessonBadge(item: TimelineItem): string {
  if (!item.lessonOpt) return "";
  const head = item.lessonOpt === "requested" ? "レッスン希望" : `レッスン${item.lessonStart ? item.lessonStart : ""}`;
  return [item.lessonTicket ? "🎫" : "", head, item.lessonCoach].filter(Boolean).join(" ");
}

/** 1日ぶんのカレンダーに載せるもの全部。キャンセル済みは載せない（空き枠として見せる） */
export function toTimelineItems(
  bookings: BookingLike[],
  lessons: LessonLike[],
  /** 担当コーチのidから名前を引く（#214）。渡さなければ名前は出さない */
  coachName?: (staffId: string) => string,
): TimelineItem[] {
  return [
    ...bookings.filter((b) => b.status !== "cancelled").map((b) => bookingToItem(b, coachName)),
    ...lessons.map(lessonToItem),
  ];
}

// ------------------------------------------------------------------
// 配置（縦＝時間コマ・横＝打席）
// ------------------------------------------------------------------

export type PlacedBlock = {
  item: TimelineItem;
  /** slots の index（開始コマ） */
  row: number;
  /** 何コマぶんの高さか（rowSpan） */
  span: number;
  /** 営業時間の開始より前から始まっている（＝上が切れている） */
  cutTop: boolean;
  /** 営業時間の終了をはみ出している（＝下が切れている） */
  cutBottom: boolean;
};

export type UnplacedReason =
  /** 打席が決まっていない（打席指定なしのレッスン枠など） */
  | "no_bay"
  /** その日の営業時間の外（設定変更で営業時間が縮んだ後の古い予約など） */
  | "outside_hours"
  /** 同じ打席の同じ時間に既に別の予約がある（二重予約 or 表示粒度が粗い） */
  | "conflict";

export type TimelineCell =
  | { kind: "block"; block: PlacedBlock }
  | { kind: "empty"; slot: string; bayId: string }
  /** 上のブロックの rowSpan に飲み込まれているセル。<td>を描いてはいけない */
  | { kind: "covered" };

export type TimelineLayout = {
  slots: string[];
  bayIds: string[];
  rows: { slot: string; cells: TimelineCell[] }[];
  /** 表に置けなかったもの（黙って消さずに一覧で出す） */
  unplaced: { item: TimelineItem; reason: UnplacedReason }[];
};

/**
 * 予約を「開始コマ＋高さ」に畳み込む。
 *
 * - 開始が半端（表示30分刻みで10:15開始）なら、そのコマの先頭に寄せる（切り上げると1コマ後ろにズレて見える）
 * - 終了は切り上げ（10:00-10:55 は 10:30 の枠も潰しているので2コマぶんの高さ）
 * - 営業時間からはみ出す予約は、表の中に収まる範囲だけ描いて cutTop/cutBottom を立てる
 * - 完全に外なら unplaced（画面下の一覧に出す）
 */
export function buildTimeline(
  slots: string[],
  step: number,
  bayIds: string[],
  items: TimelineItem[],
): TimelineLayout {
  const unplaced: { item: TimelineItem; reason: UnplacedReason }[] = [];
  const rows: { slot: string; cells: TimelineCell[] }[] = slots.map((slot) => ({
    slot,
    cells: bayIds.map((bayId) => ({ kind: "empty", slot, bayId }) as TimelineCell),
  }));

  if (slots.length === 0 || step <= 0) {
    // 定休日など。全部「営業時間外」に回す
    for (const item of items) unplaced.push({ item, reason: "outside_hours" });
    return { slots, bayIds, rows, unplaced };
  }

  const gridStart = toMin(slots[0]);
  const gridEnd = toMin(slots[slots.length - 1]) + step;
  const colOf = new Map(bayIds.map((id, i) => [id, i]));

  // 早い順に置く。重なったときに「先に入っていた予約」が残るようにするため
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

  for (const item of sorted) {
    const col = item.bayId == null ? undefined : colOf.get(item.bayId);
    if (col === undefined) {
      unplaced.push({ item, reason: "no_bay" });
      continue;
    }
    const s0 = toMin(item.start);
    const e0 = toMin(item.end);
    if (e0 <= gridStart || s0 >= gridEnd) {
      unplaced.push({ item, reason: "outside_hours" });
      continue;
    }
    const s = Math.max(s0, gridStart);
    const e = Math.min(Math.max(e0, s0), gridEnd);
    const row = Math.floor((s - gridStart) / step);
    const endRow = Math.min(slots.length, Math.max(row + 1, Math.ceil((e - gridStart) / step)));
    const span = endRow - row;

    let free = true;
    for (let r = row; r < row + span; r++) if (rows[r].cells[col].kind !== "empty") free = false;
    if (!free) {
      unplaced.push({ item, reason: "conflict" });
      continue;
    }

    rows[row].cells[col] = {
      kind: "block",
      block: { item, row, span, cutTop: s0 < gridStart, cutBottom: e0 > gridEnd },
    };
    for (let r = row + 1; r < row + span; r++) rows[r].cells[col] = { kind: "covered" };
  }

  return { slots, bayIds, rows, unplaced };
}

// ------------------------------------------------------------------
// 週表示（縦＝時間・横＝曜日）用
// ------------------------------------------------------------------

/** 週の各日で営業時間が違う（平日10-22 / 土日9-20）ので、時間軸は全日の和集合にする */
export function unionSlots(daySlots: string[][]): string[] {
  const set = new Set<string>();
  for (const list of daySlots) for (const s of list) set.add(s.slice(0, 5));
  return [...set].sort((a, b) => toMin(a) - toMin(b));
}

/** 各コマに重なっている予約を集める（週表示は打席を合算して密度で見せるため） */
export function groupBySlot(slots: string[], step: number, items: TimelineItem[]): TimelineItem[][] {
  return slots.map((slot) => {
    const s = toMin(slot);
    const e = s + step;
    return items
      .filter((it) => toMin(it.start) < e && toMin(it.end) > s)
      .sort((a, b) => a.start.localeCompare(b.start));
  });
}

// ------------------------------------------------------------------
// 月表示（件数だけ・時間軸は持たない）
// ------------------------------------------------------------------

/** 月カレンダーの1日ぶん。1か月ぶんを loadDay で35回引くのは重いので件数だけ集計する */
export type DayCount = { total: number; member: number; dropin: number; trial: number; lesson: number };

export const EMPTY_DAY_COUNT: DayCount = { total: 0, member: 0, dropin: 0, trial: 0, lesson: 0 };

// ------------------------------------------------------------------
// 月ミニカレンダー用の日付計算
// ------------------------------------------------------------------
// ★ ここは「日付文字列の足し算」だけ。今日の判定には必ず jstToday() を使うこと（JST日付ルール #73）。
//   T12:00:00Z を基準にするのはタイムゾーン/夏時間で1日ズレないようにするため。

export function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 曜日 0=日〜6=土 */
export function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** その月の1日 / 翌月の1日（DBの範囲検索用） */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${addMonths(month, 1)}-01` };
}

/** ミニカレンダー用の6週×7日。前後の月の日も埋める（高さが月によって変わらないように） */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDaysStr(first, -dowOf(first));
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDaysStr(start, w * 7 + d)),
  );
}

/** 週表示の起点（その日を含む週の日曜） */
export function weekStart(dateStr: string): string {
  return addDaysStr(dateStr, -dowOf(dateStr));
}

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 「8/13（水）」 */
export function labelJa(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${DOW_JA[d.getUTCDay()]}）`;
}

export { DOW_JA, toMin };
