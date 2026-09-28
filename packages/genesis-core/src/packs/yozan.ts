/**
 * YOZAN の Pack（#306）。Core は会社を知らない。ここにだけ YOZAN 固有の「構造」を書く。
 * ルール（藤田プロの名前を出さない・「仮」を出さない）は Memory（gn_memories）にある。ここには置かない。
 */
import type { Pack } from "../pack.ts";

export const FRANK_STORE_ID = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

export const YOZAN_PACK: Pack = {
  name: "yozan",
  // 打席予約は FRANK GOLF 姫路だけ（GOLF WING は Smart Hello）
  bookingStoreId: FRANK_STORE_ID,
  memberTable: { table: "frunk_members", storeCol: "store_id", noCol: "member_no" },
  storeAliases: [
    { match: /frank|フランク|姫路|himeji/, like: "%FRANK%" },
    { match: /golf ?wing|ゴルフウィング|ゴルフウイング|宝塚|takarazuka|gw\b/, like: "%GOLF WING%" },
  ],
  memberSources: [
    { label: "FRANK GOLF", view: "gnv_frank_members", where: "status = 'active' and plan_type <> 'テスト'" },
    { label: "GOLF WING", view: "gnv_members", where: "is_active" },
  ],
  kindLabels: { guest: "受付台帳", member: "GOLF WING会員", frank: "FRANK会員", frank_guest: "FRANKビジター" },
};
