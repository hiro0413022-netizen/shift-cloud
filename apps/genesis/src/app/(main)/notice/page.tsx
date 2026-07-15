import { requireGenesisActor } from "@/lib/auth";
import { getLineGroups, getNotices } from "@/lib/staff-notice";
import { NoticeClient } from "./notice-client";

/**
 * スタッフへ連絡（DECISIONS #59 / migration 0059）
 * ここで書けば → ①gn_directivesに記録 ②公式LINEでスタッフグループへ自動配信
 * ③（任意）スタッフアプリの「やること」にも表示。
 * 個別LINEをやめ、連絡をGENESISに集約して追える形にする。
 */
export default async function NoticePage() {
  const actor = await requireGenesisActor();
  const [groups, notices] = await Promise.all([
    getLineGroups(actor.companyId),
    getNotices(actor.companyId),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">スタッフへ連絡</h1>
      <p className="mb-6 text-sm text-(--color-dim)">
        書いて送ると公式LINEのスタッフグループに届きます。連絡はここに記録され、あとから追えます。
      </p>
      <NoticeClient groups={groups} notices={notices} />
    </div>
  );
}
