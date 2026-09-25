import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { listCoachesForAdmin, coachCandidates } from "@/lib/frank-coaches";
import { publicCoaches } from "@yozan/core/frank-coach-profile";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { saveCoachAction, removeCoachAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * コーチ紹介の編集（#279・2026-09-25 ユーザー依頼）
 *
 * ユーザー指示:「権限のある店舗スタッフが、管理画面からコーチの追加／写真の追加・変更／
 *   名前の変更／紹介文の変更をできるように」
 *
 * ★ 1枚の画面に、今出ているコーチを縦に並べて、その場で直せるようにする。
 *   「一覧→詳細→編集」にすると、写真を1枚差し替えるのに3回画面が変わる。
 *   店頭で片手間に直すものなので、開いた画面がそのまま編集画面。
 *
 * ★ 「掲載しない」は消さずに外す。辞めた・産休などで一時的に外したいことがある。
 *
 * ★ 出さないスタッフ（line_hidden・#243）は候補に出さない。ユーザー指示:
 *   「会員ページと公式サイトの両方、絶対に名前は出さないこと」
 */

const noticeOf = (sp: { saved?: string; removed?: string; err?: string }) => {
  if (sp.err) return { text: sp.err, ok: false };
  if (sp.saved) return { text: "保存しました。会員ページと公式サイトに反映されます。", ok: true };
  if (sp.removed) return { text: "掲載をやめました。", ok: true };
  return null;
};

function CoachForm({
  coach,
  candidates,
}: {
  coach: {
    id: string | null;
    name: string;
    name_en: string;
    title: string;
    photo_url: string;
    bio: string;
    quals: string;
    sort_order: number;
    published: boolean;
    staff_id: string;
    link_url: string;
    link_label: string;
  };
  candidates: Array<{ id: string; name: string; role: string }>;
}) {
  const save = saveCoachAction.bind(null, coach.id);
  return (
    <form action={save} encType="multipart/form-data" className="grid gap-4 md:grid-cols-[13rem_1fr]">
      {/* 写真 */}
      <div className="space-y-2">
        <div className="aspect-[3/4] w-full overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel-2)">
          {coach.photo_url ? (
            // 外部Storageの画像。next/image の最適化は挟まない（バケットのURLがそのまま公式サイトでも使われる）
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coach.photo_url} alt={coach.name || "コーチ"} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-(--color-dim)">写真なし</div>
          )}
        </div>
        <label className="block text-xs text-(--color-dim)">
          写真を変える（JPEG・PNG・WebP / 8MBまで）
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full text-xs" />
        </label>
        {/* 選ばなければ今の写真のまま */}
        <input type="hidden" name="photo_url" value={coach.photo_url} />
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="お名前">
            <input name="name" defaultValue={coach.name} required maxLength={40} className={inputCls} placeholder="小川 うらら" />
          </Field>
          <Field label="ローマ字（公式サイトの飾り・空でOK）">
            <input name="name_en" defaultValue={coach.name_en} maxLength={60} className={inputCls} placeholder="URARA OGAWA" />
          </Field>
          <Field label="肩書">
            <input name="title" defaultValue={coach.title} maxLength={40} className={inputCls} placeholder="所属レッスンプロ" />
          </Field>
          <Field label="並び順（小さいほど上）">
            <input name="sort_order" type="number" min={0} max={9999} defaultValue={coach.sort_order} className={inputCls} />
          </Field>
        </div>

        <Field label="紹介文（改行はそのまま出ます）">
          <textarea name="bio" defaultValue={coach.bio} rows={5} maxLength={1200} className={inputCls} />
        </Field>

        <Field label="資格・実績（1行に1つ）">
          <textarea name="quals" defaultValue={coach.quals} rows={3} maxLength={600} className={inputCls} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="リンク先（任意・YouTubeなど）">
            <input name="link_url" type="url" defaultValue={coach.link_url} className={inputCls} placeholder="https://..." />
          </Field>
          <Field label="リンクのボタン文字">
            <input name="link_label" defaultValue={coach.link_label} maxLength={40} className={inputCls} placeholder="無料レッスン動画を見る（YouTube）" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="スタッフと結びつける（任意）">
            <select name="staff_id" defaultValue={coach.staff_id} className={inputCls}>
              <option value="">結びつけない</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? `（${c.role}）` : ""}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={coach.published} className="size-4" />
            <span>会員ページと公式サイトに掲載する</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btnCls}>
            {coach.id ? "保存する" : "このコーチを追加する"}
          </button>
          {coach.id ? (
            <button formNoValidate formAction={removeCoachAction.bind(null, coach.id)} className={btnGhostCls}>
              掲載をやめる
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export default async function CoachesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; removed?: string; err?: string }>;
}) {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) notFound();

  const sp = await searchParams;
  const notice = noticeOf(sp);
  const [rows, candidates] = await Promise.all([
    listCoachesForAdmin(actor.companyId),
    coachCandidates(actor.companyId),
  ]);
  const shown = publicCoaches(rows).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-(--color-txt)">コーチ紹介</h1>
          <p className="mt-1 text-sm text-(--color-dim)">
            ここで直すと、会員ページのトップと公式サイト frankgolf.jp の「コーチ紹介」の両方が変わります。
          </p>
        </div>
        <Link href="/frunk" className={btnGhostCls}>
          FRANK会員へ戻る
        </Link>
      </div>

      {notice ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <Panel title={`掲載中のコーチ（${shown}名）`}>
        {rows.length === 0 ? (
          <Empty>まだ登録がありません。下の「コーチを追加」からどうぞ。</Empty>
        ) : (
          <div className="space-y-8">
            {rows.map((r) => (
              <div key={r.id} className="border-b border-(--color-line) pb-8 last:border-0 last:pb-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold text-(--color-txt)">{r.name}</span>
                  {r.published === false ? <Badge tone="warn">掲載していません</Badge> : <Badge tone="ok">掲載中</Badge>}
                </div>
                <CoachForm
                  coach={{
                    id: String(r.id),
                    name: String(r.name ?? ""),
                    name_en: String(r.name_en ?? ""),
                    title: String(r.title ?? ""),
                    photo_url: String(r.photo_url ?? ""),
                    bio: String(r.bio ?? ""),
                    quals: String(r.quals ?? ""),
                    sort_order: Number(r.sort_order ?? 100),
                    published: r.published !== false,
                    staff_id: String(r.staff_id ?? ""),
                    link_url: String(r.link_url ?? ""),
                    link_label: String(r.link_label ?? ""),
                  }}
                  candidates={candidates}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="コーチを追加">
        <CoachForm
          coach={{
            id: null,
            name: "",
            name_en: "",
            title: "",
            photo_url: "",
            bio: "",
            quals: "",
            sort_order: (rows.length + 1) * 10,
            published: true,
            staff_id: "",
            link_url: "",
            link_label: "",
          }}
          candidates={candidates}
        />
      </Panel>
    </div>
  );
}
