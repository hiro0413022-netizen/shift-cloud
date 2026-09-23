/**
 * LINE Messaging API（#80 / A-4解消）
 *
 * 実体は `@yozan/core/line-send` に移した（#273）。member-os からもドリンク注文の通知を
 * 送るようになり、アプリごとに fetch を書くと #243 の伏せ字を通らない経路が増えるため。
 * genesis 側の import を全部書き換えずに済むよう、ここは薄い再輸出だけにしてある。
 */
import { createAdmin } from "@/lib/supabase/admin";
import {
  getLineChannel as coreGetLineChannel,
  getLineHiddenNames as coreGetLineHiddenNames,
  type LineChannel,
} from "@yozan/core/line-send";

export { forLine, linePush, lineBroadcast } from "@yozan/core/line-send";
export type { LineChannel } from "@yozan/core/line-send";

type Admin = ReturnType<typeof createAdmin>;

export function getLineHiddenNames(admin: Admin, companyId: string): Promise<string[]> {
  return coreGetLineHiddenNames(admin, companyId);
}

export function getLineChannel(admin: Admin, companyId: string, code: string): Promise<LineChannel | null> {
  return coreGetLineChannel(admin, companyId, code);
}
