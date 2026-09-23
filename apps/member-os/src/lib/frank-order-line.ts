import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@yozan/core/jst";
import { getLineChannel, linePush, forLine } from "@yozan/core/line-send";
import { orderNotifyText, type OrderNotifyLine } from "@yozan/core/frank-order-notify";
import { staffOnShiftAt, shiftDateRange, type ShiftRowLike } from "@yozan/core/frank-shift-now";
import { FRANK_STORE_ID } from "@/lib/store-scope";

/**
 * ドリンク注文が入ったら、その時間シフトに入っているスタッフのLINEへ飛ばす（#273・2026-09-24）
 *
 * ★ 注文を絶対に止めない
 *   お客様は注文ボタンの先で待っている。LINEが落ちても・チャネルが未設定でも・
 *   月の上限に当たって429が返っても、注文自体は成立させる。ここは全部 try/catch で飲み、
 *   失敗は gn_line_outbox に status='error' で残す（あとで理由が読める）。
 *
 * ★ 誰に送るか
 *   シフト（published・当日/前日ぶん）から「いまの時間に入っている人」を出し（@yozan/core/frank-shift-now）、
 *   gn_line_contacts.staff_id で本人のLINEを引く（0198）。名前の文字列で突き合わせない
 *   ＝"林 和希" と "林和希" の空白差で静かに誰にも飛ばなくなるのを避ける。
 *
 * ★ 文面
 *   @yozan/core/frank-order-notify の1か所。お客様のお名前は出さない（スタッフ個人の端末に残るため）。
 *   送信は linePush 経由＝#243 の伏せ字を必ず通る。
 */

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");

export type NotifyOrderInput = {
  companyId: string;
  storeId: string;
  orderId: string;
  orderNo: string;
  bayId: string | null;
  isMember: boolean;
  lines: OrderNotifyLine[];
  total: number;
  settlement: "oncard" | "register";
};

/** JSTの「いま」（暦日＋0:00からの分） */
function jstNow(): { date: string; minutes: number } {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { date: jstYmd(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export async function notifyOrderToShiftStaff(input: NotifyOrderInput): Promise<void> {
  // FRANK姫路の注文だけ（他店舗にはシフト連動の伝票運用がまだ無い）
  if (input.storeId !== FRANK_STORE_ID) return;

  const admin = createAdmin();
  const now = jstNow();
  const { from, to } = shiftDateRange(now);

  const [shiftRes, chRes] = await Promise.all([
    admin
      .from("shifts")
      .select("staff_id, date, start_time, end_time, is_day_off, status")
      .eq("company_id", input.companyId)
      .eq("store_id", input.storeId)
      .gte("date", from)
      .lte("date", to)
      .is("deleted_at", null),
    getLineChannel(admin, input.companyId, "staff"),
  ]);

  const staffIds = staffOnShiftAt((shiftRes.data ?? []) as unknown as ShiftRowLike[], now);
  if (staffIds.length === 0) return; // 誰も出ていない時間の注文（テスト等）。静かに何もしない
  if (!chRes) {
    await logFailure(admin, input, "LINEチャネル未登録（gn_line_channels code=staff）");
    return;
  }

  const { data: contacts } = await admin
    .from("gn_line_contacts")
    .select("id, person_name, line_user_id, staff_id, notify_orders")
    .eq("company_id", input.companyId)
    .eq("channel_code", "staff")
    .in("staff_id", staffIds)
    .is("deleted_at", null);

  const targets = ((contacts ?? []) as Row[]).filter((c) => c.notify_orders !== false && s(c.line_user_id));
  if (targets.length === 0) return; // 出勤者のLINEが未リンク。注文は通す

  const bayName = input.bayId ? await bayLabel(admin, input.bayId) : null;
  const text = orderNotifyText({
    orderNo: input.orderNo,
    bayName,
    isMember: input.isMember,
    lines: input.lines,
    total: input.total,
    settlement: input.settlement,
  });

  // 1人ずつ送る。1人が失敗しても他の人には届ける（Promise.all だと最初の失敗で巻き込む）
  for (const c of targets) {
    try {
      await linePush(chRes, s(c.line_user_id), text);
      await admin.from("gn_line_outbox").insert({
        company_id: input.companyId,
        to_group_id: s(c.line_user_id),
        body: forLine(chRes, text),
        status: "sent",
        sent_at: new Date().toISOString(),
        created_by: null,
      });
    } catch (e) {
      await logFailure(admin, input, `${s(c.person_name) || "連絡先"}: ${(e as Error).message}`);
    }
  }
}

async function bayLabel(admin: ReturnType<typeof createAdmin>, bayId: string): Promise<string | null> {
  const { data } = await admin.from("frunk_bays").select("name").eq("id", bayId).maybeSingle();
  return s((data as Row | null)?.name) || null;
}

/** 失敗も必ず残す。「送ったつもりで送れていない」を作らないため（月200通の上限もここに出る） */
async function logFailure(
  admin: ReturnType<typeof createAdmin>,
  input: NotifyOrderInput,
  message: string,
): Promise<void> {
  try {
    await admin.from("gn_line_outbox").insert({
      company_id: input.companyId,
      to_group_id: "",
      body: `【注文通知の送信失敗】伝票 ${input.orderNo}`,
      // status の許容値は pending/sent/error（gn_line_outbox_status_check）
      status: "error",
      error: message.slice(0, 500),
      created_by: null,
    });
  } catch {
    // ここで失敗しても注文は成立させる
  }
}
