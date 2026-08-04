import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { registerLink } from "@yozan/track/server";
import { trackingSnippet } from "@yozan/track/beacon";

/**
 * 集客LPの閲覧計測（@yozan/track #95 を genesis に横展開・#101）。
 *
 * - LPは匿名の公開ページなので「開封＝ホットリード通知」はしない
 *   → 登録直後に notified_at を埋めて判断フィードの hotlead 枠から外す（集計は /ai-sales で見る）
 * - 社内から開くときは ?preview=1（is_internal・集計から除外。@yozan/track の鉄則）
 */

const YOZAN_COMPANY_ID = "ec00ad2a-4032-4061-bdb7-03face8a04e7";

export const LP_DEFS = {
  pganote: {
    token: "lp-pganote",
    resourceId: "c0117a9e-1b1a-4f6e-9b1a-000000000001",
    label: "PGA NOTE 集客LP",
    href: "/lp/pganote",
  },
  "swing-cortex": {
    token: "lp-swing-cortex",
    resourceId: "c0117a9e-1b1a-4f6e-9b1a-000000000002",
    label: "SWING CORTEX 集客LP",
    href: "/lp/swing-cortex",
  },
  webdesign: {
    token: "lp-webdesign",
    resourceId: "c0117a9e-1b1a-4f6e-9b1a-000000000003",
    label: "HP制作 集客LP",
    href: "/lp/webdesign",
  },
} as const;

export type LpKey = keyof typeof LP_DEFS;

// プロセスごとに1回だけ登録（registerLinkは冪等なので多重でも壊れない）
const registered = new Set<string>();

export async function ensureLpLink(key: LpKey): Promise<void> {
  if (registered.has(key)) return;
  registered.add(key);
  try {
    const admin = createAdmin();
    const def = LP_DEFS[key];
    await registerLink(admin, {
      companyId: YOZAN_COMPANY_ID,
      app: "genesis",
      resourceType: "lp",
      resourceId: def.resourceId,
      token: def.token,
      label: def.label,
      href: def.href,
    });
    // LPはホットリード通知の対象外（匿名ページ）。notified_at を埋めてフィードから外す
    await admin
      .from("trk_links")
      .update({ notified_at: new Date().toISOString() })
      .eq("token", def.token)
      .is("notified_at", null);
  } catch {
    // 計測の初期化失敗でLP表示を壊さない
    registered.delete(key);
  }
}

/** LPに埋めるビーコン <script>（配信時注入の原則どおり、ページ描画時に生成） */
export function lpBeacon(key: LpKey, isPreview: boolean): string {
  return trackingSnippet({ endpoint: "/api/track", token: LP_DEFS[key].token, internal: isPreview });
}
