import { notFound } from "next/navigation";
import { getPro, listResults, listSchedule, type Tournament } from "@/lib/data";
import { fmtSpanJa } from "@/lib/jst";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { deleteTournamentAction, saveTournamentAction } from "../actions";

export const dynamic = "force-dynamic";

function TournamentForm({ slug, item }: { slug: string; item?: Tournament }) {
  return (
    <form action={saveTournamentAction} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div>
        <label className="mb-1 block text-xs font-bold">大会名（必須）</label>
        <input name="name" required defaultValue={item?.name ?? ""} placeholder="例: ◯◯オープンゴルフトーナメント" className="adm-input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold">開始日（必須）</label>
          <input type="date" name="start_date" required defaultValue={item?.start_date ?? ""} className="adm-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">最終日</label>
          <input type="date" name="end_date" defaultValue={item?.end_date ?? ""} className="adm-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold">ツアー名</label>
          <input name="tour" defaultValue={item?.tour ?? ""} placeholder="例: 2026 JapanTOUR" className="adm-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">開催コース</label>
          <input name="venue" defaultValue={item?.venue ?? ""} placeholder="例: 兵庫県: ◯◯カントリー倶楽部" className="adm-input" />
        </div>
      </div>
      <div className="rounded-lg bg-(--color-panel) p-3">
        <p className="mb-2 text-xs font-bold text-(--color-dim)">試合が終わったら結果を入力（空欄のままなら「出場予定」として表示）</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold">順位</label>
            <input name="result_rank" defaultValue={item?.result_rank ?? ""} placeholder="例: 優勝 / 5位T / 予選落ち" className="adm-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">スコアなど</label>
            <input name="result_detail" defaultValue={item?.result_detail ?? ""} placeholder="例: 通算-12（68・70・66・68）" className="adm-input" />
          </div>
        </div>
      </div>
      <button type="submit" className="adm-btn bg-(--color-ink) text-white">{item ? "更新する" : "この大会を登録する"}</button>
    </form>
  );
}

function List({ slug, items, empty }: { slug: string; items: Tournament[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-(--color-dim)">{empty}</p>;
  return (
    <div className="space-y-2">
      {items.map((t) => (
        <details key={t.id} className="rounded-xl border border-(--color-line) bg-white">
          <summary className="cursor-pointer list-none p-4">
            <span className="mr-2 text-xs text-(--color-dim)">{fmtSpanJa(t.start_date, t.end_date)}</span>
            <span className="font-bold">{t.name}</span>
            {t.result_rank ? <span className="ml-2 rounded-sm bg-(--color-gold) px-1.5 py-0.5 text-[10px] font-black text-white">{t.result_rank}</span> : null}
          </summary>
          <div className="border-t border-(--color-line) p-4">
            <TournamentForm slug={slug} item={t} />
            <form action={deleteTournamentAction} className="mt-3 text-right">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={t.id} />
              <DeleteButton label="この大会を削除" />
            </form>
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function AdminTournaments({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const [schedule, results] = await Promise.all([listSchedule(pro.id), listResults(pro.id)]);

  return (
    <div>
      <AdminTitle slug={slug} title="試合日程・成績" hint="開催前は SCHEDULE、終了後は RESULT として自動で振り分けられます。" />
      <Msg ok={sp.ok} err={sp.err} />

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">＋ 新しい大会を登録</p>
        <TournamentForm slug={slug} />
      </div>

      <p className="mb-2 text-sm font-bold">出場予定（タップで編集・結果入力）</p>
      <div className="mb-8"><List slug={slug} items={schedule} empty="出場予定はありません。" /></div>

      <p className="mb-2 text-sm font-bold">終了した大会（タップで編集）</p>
      <List slug={slug} items={results} empty="終了した大会はありません。" />
    </div>
  );
}
