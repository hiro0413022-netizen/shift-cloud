import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listParticipants } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { Badge, btnCls, cardCls, Empty, inputCls, labelCls } from "@/components/ui";
import { deleteParticipant, importParticipants, upsertParticipant } from "../actions";

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const participants = await listParticipants(id);

  return (
    <>
      <CompNav compId={id} active="participants" />

      <section className={`${cardCls} mb-5`}>
        <h2 className="mb-4 text-sm font-bold">参加者を追加</h2>
        <form action={upsertParticipant} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="comp_id" value={id} />
          <L label="氏名">
            <input name="name" required placeholder="山田 太郎" className={inputCls} />
          </L>
          <L label="フリガナ">
            <input name="kana" placeholder="ヤマダ タロウ" className={inputCls} />
          </L>
          <L label="HCP">
            <input name="hcp" type="number" step="0.1" min="0" max="54" placeholder="12.4" className={inputCls} />
          </L>
          <L label="性別">
            <select name="gender" className={inputCls} defaultValue="male">
              <option value="male">男性</option>
              <option value="female">女性</option>
            </select>
          </L>
          <L label="所属・組織">
            <input name="org" className={inputCls} />
          </L>
          <L label="電話番号">
            <input name="tel" className={inputCls} />
          </L>
          <L label="メールアドレス">
            <input name="email" type="email" className={inputCls} />
          </L>
          <div className="flex items-end">
            <button className={`${btnCls} w-full justify-center`}>追加する</button>
          </div>
        </form>
      </section>

      <section className={`${cardCls} mb-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">参加者一覧（{participants.length}名）</h2>
          <a href={`/c/${id}/participants/export`} className="text-sm text-(--color-dim) underline hover:text-(--color-txt)">
            CSVを書き出す
          </a>
        </div>

        {participants.length === 0 ? (
          <Empty title="まだ参加者がいません" hint="上のフォーム、または下のCSV取込で登録できます" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-(--color-accent) text-left text-white">
                  <Th className="w-10">#</Th>
                  <Th>氏名</Th>
                  <Th>フリガナ</Th>
                  <Th className="text-center">HCP</Th>
                  <Th>所属</Th>
                  <Th>連絡先</Th>
                  <Th className="text-center">参加費</Th>
                  <Th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {participants.map((p, i) => (
                  <tr key={p.id} className="border-b border-(--color-line) align-top">
                    <td className="px-3 py-2 text-center text-xs text-(--color-dim)">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold">
                      <details>
                        <summary className="cursor-pointer list-none">
                          {p.name}
                          <span className="ml-1 text-xs font-normal text-(--color-dim)">編集</span>
                        </summary>
                        <form action={upsertParticipant} className="mt-2 grid w-80 gap-2 rounded-lg bg-(--color-panel-2) p-3">
                          <input type="hidden" name="comp_id" value={id} />
                          <input type="hidden" name="participant_id" value={p.id} />
                          <input name="name" defaultValue={p.name} className={inputCls} />
                          <input name="kana" defaultValue={p.kana ?? ""} placeholder="フリガナ" className={inputCls} />
                          <input name="hcp" type="number" step="0.1" defaultValue={p.hcp ?? ""} placeholder="HCP" className={inputCls} />
                          <select name="gender" defaultValue={p.gender ?? "male"} className={inputCls}>
                            <option value="male">男性</option>
                            <option value="female">女性</option>
                          </select>
                          <input name="org" defaultValue={p.org ?? ""} placeholder="所属" className={inputCls} />
                          <input name="tel" defaultValue={p.tel ?? ""} placeholder="電話" className={inputCls} />
                          <input name="email" defaultValue={p.email ?? ""} placeholder="メール" className={inputCls} />
                          <input name="notes" defaultValue={p.notes ?? ""} placeholder="メモ" className={inputCls} />
                          <button className={btnCls}>更新する</button>
                        </form>
                      </details>
                    </td>
                    <td className="px-3 py-2 text-xs text-(--color-dim)">{p.kana ?? ""}</td>
                    <td className="px-3 py-2 text-center">{p.hcp ?? "—"}</td>
                    <td className="px-3 py-2">{p.org ?? ""}</td>
                    <td className="px-3 py-2 text-xs text-(--color-dim)">
                      {p.tel ?? ""}
                      {p.email ? <div>{p.email}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {p.paid ? <Badge tone="ok">徴収済</Badge> : <Badge tone="danger">未徴収</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteParticipant}>
                        <input type="hidden" name="comp_id" value={id} />
                        <input type="hidden" name="participant_id" value={p.id} />
                        <button className="text-xs text-red-600 hover:underline">削除</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="mb-2 text-sm font-bold">CSVから一括で取り込む</h2>
        <p className="mb-3 text-xs text-(--color-dim)">
          列の順番: 氏名, フリガナ, HCP, 性別(male/female), 所属, 電話, メール, 参加費(0/1), メモ
        </p>
        <form action={importParticipants} className="space-y-3">
          <input type="hidden" name="comp_id" value={id} />
          <textarea
            name="csv"
            rows={8}
            placeholder={"氏名,フリガナ,HCP,性別,所属,電話,メール,参加費,メモ\n山田太郎,ヤマダタロウ,12,male,営業部,090-0000-0000,,0,"}
            className={`${inputCls} font-mono text-xs`}
          />
          <label className="flex items-center gap-2 text-xs text-(--color-dim)">
            <input type="checkbox" name="skip_header" value="1" defaultChecked />
            1行目は見出しなので飛ばす
          </label>
          <button className={btnCls}>取り込む</button>
        </form>
      </section>
    </>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
