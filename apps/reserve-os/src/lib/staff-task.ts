import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { fmtJst, fmtSeq } from "@/lib/reserve";

/**
 * 予約申込 → スタッフポータル（Shift Cloud）の「やること」(sp_tasks) 連携。
 *
 * 運用（DECISIONS #55 / ユーザー指定）:
 *   申込 → GOLF WING の店舗共通タスク（staff_id=null, store_id=GOLF WING）として積む。
 *   スタッフはシフトアプリのホーム/カレンダーで見て、日程を確認 → GOLF WINGのメールアドレスから手動で返信。
 *   確定/見送り/キャンセルの操作でタスクは自動的に done になる。
 *   ※メール自動送信・LINE通知は次回対応（notifyLine は no-op のまま）。
 *
 * 疎結合の原則: sp_tasks から res_requests への FK は張らず ref_type/ref_id で緩く指す。
 * 失敗しても申込自体は成功させる（呼び出し側で catch）。
 */

const JST = "Asia/Tokyo";

/** 申込を受けた日（JST）— やることリストの date に使う */
function todayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: JST }); // YYYY-MM-DD
}

type RequestRow = Record<string, unknown>;

/** 新規申込の店舗共通タスクを作る（重複はユニークインデックスで弾かれるので握りつぶす） */
export async function createStaffTask(r: RequestRow, siteUrl: string): Promise<{ ok: boolean }> {
  const storeId = r.store_id as string | null;
  if (!storeId) {
    console.warn("[staff-task] service に store_id がないためタスク作成をスキップ:", r.id);
    return { ok: false };
  }
  const admin = createAdmin();
  const seq = fmtSeq(r.request_seq as number);
  const prefs = [r.pref1_at, r.pref2_at, r.pref3_at]
    .filter(Boolean)
    .map((v, i) => `第${i + 1}希望 ${fmtJst(v as string)}`)
    .join("\n");
  // 連絡手段: LINE連携済みなら確定操作でLINEが自動送信される（DECISIONS #56）。
  // 未連携ならメール（＝スタッフが手で返信）。スタッフが「どっちで返すのか」を迷わないよう明記する。
  // 確定は「お客様へ折り返し電話」で行う運用（DECISIONS #59）
  const contact = `☎ ${String(r.phone ?? "電話番号なし")}`;
  const howto = "空き状況を確認し、お客様へ折り返しお電話 → 日時が決まったら Reserve OS の詳細画面で「確定」を記録してください（画面に架電台本があります）。";
  const menu = r.plan_name
    ? `メニュー: ${String(r.plan_name)}${r.plan_price ? `（¥${Number(r.plan_price).toLocaleString("ja-JP")}）` : ""}\n`
    : "";
  const note = `${menu}${prefs}\n${contact}\n${howto}\n` + (siteUrl ? `詳細: ${siteUrl}/requests/${r.id}` : "");

  const { error } = await admin.from("sp_tasks").insert({
    company_id: r.company_id as string,
    staff_id: null, // = 店舗共通タスク（GOLF WING全員のやることリストに出る）
    store_id: storeId,
    date: todayJST(),
    title: `【予約申込】${String(r.name ?? "")}様 / ${String(r.service_name ?? "")}（${seq}）`,
    note,
    source: "reserve",
    ref_type: "reserve_request",
    ref_id: r.id as string,
    sort: -10, // 予約対応は上に出す
  });
  if (error) {
    // 23505 = 重複（同じ申込から2回作った）は正常系として扱う
    if (error.code === "23505") return { ok: true };
    console.error("[staff-task] sp_tasks insert失敗:", error);
    return { ok: false };
  }
  return { ok: true };
}

/** 申込が確定/見送り/キャンセル/完了になったら、対応するやることを done にする */
export async function closeStaffTask(requestId: string, staffId?: string | null): Promise<void> {
  const admin = createAdmin();
  const { error } = await admin
    .from("sp_tasks")
    .update({
      status: "done",
      done_by: staffId ?? null,
      done_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("ref_type", "reserve_request")
    .eq("ref_id", requestId)
    .eq("status", "open")
    .is("deleted_at", null);
  if (error) console.error("[staff-task] sp_tasks close失敗:", error);
}
