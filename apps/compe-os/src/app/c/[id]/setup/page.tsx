import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { btnCls, cardCls, inputCls, labelCls } from "@/components/ui";
import { COMPE_FORMAT_LABELS } from "@yozan/core/compe-score";
import { saveSetup } from "../actions";
import { deleteComp, duplicateComp } from "@/app/actions";

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();

  return (
    <>
      <CompNav compId={id} active="setup" />
      <form action={saveSetup} className="space-y-5">
        <input type="hidden" name="comp_id" value={id} />

        <section className={cardCls}>
          <h2 className="mb-4 text-sm font-bold">基本情報</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <L label="コンペ名">
              <input name="name" defaultValue={comp.name} required className={inputCls} />
            </L>
            <L label="主催者・団体名">
              <input name="organizer" defaultValue={comp.organizer ?? ""} placeholder="例: GOLF WING 宝塚" className={inputCls} />
            </L>
            <L label="開催日">
              <input type="date" name="held_on" defaultValue={comp.held_on ?? ""} className={inputCls} />
            </L>
            <L label="ゴルフ場・会場">
              <input name="venue" defaultValue={comp.venue ?? ""} placeholder="例: 吉川カントリー倶楽部" className={inputCls} />
            </L>
            <L label="集合時刻（案内文にそのまま出ます）">
              <input name="meet_time" defaultValue={comp.meet_time ?? ""} placeholder="例: 練習開始7:10　集合8:10" className={inputCls} />
            </L>
            <L label="スタート時刻">
              <input name="start_time" defaultValue={comp.start_time ?? ""} placeholder="例: 8:30" className={inputCls} />
            </L>
          </div>
        </section>

        <section className={cardCls}>
          <h2 className="mb-4 text-sm font-bold">競技設定</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <L label="競技形式">
              <select name="format" defaultValue={comp.format} className={inputCls}>
                {Object.entries(COMPE_FORMAT_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </L>
            <L label="1組の人数">
              <select name="team_size" defaultValue={String(comp.team_size)} className={inputCls}>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}名
                  </option>
                ))}
              </select>
            </L>
            <L label="参加費（円）">
              <input type="number" name="fee" defaultValue={comp.fee} min={0} className={inputCls} />
            </L>
            <L label="コース名（詳細）">
              <input name="course" defaultValue={comp.course ?? ""} placeholder="例: OUT / IN" className={inputCls} />
            </L>
            <L label="スタートホール（カンマ区切り）">
              <input name="tee_options" defaultValue={comp.tee_options.join(",")} className={inputCls} />
            </L>
            <L label="進行状況">
              <select name="status" defaultValue={comp.status} className={inputCls}>
                <option value="planning">準備中</option>
                <option value="running">当日</option>
                <option value="closed">終了</option>
              </select>
            </L>
          </div>
          <p className="mt-3 text-xs text-(--color-dim)">
            ※ シンペリア・ダブルペリアを選ぶと、HCPは申告値ではなくスコアから自動計算されます（隠しホール方式・パー72）。
          </p>
        </section>

        <section className={cardCls}>
          <h2 className="mb-4 text-sm font-bold">連絡先・備考</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <L label="担当者連絡先">
              <input name="contact" defaultValue={comp.contact ?? ""} placeholder="例: 0797-82-0833" className={inputCls} />
            </L>
          </div>
          <div className="mt-4">
            <L label="備考・注意事項">
              <textarea name="notes" defaultValue={comp.notes ?? ""} rows={4} className={inputCls} />
            </L>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button className={btnCls}>保存する</button>
        </div>
      </form>

      <section className={`${cardCls} mt-6`}>
        <h2 className="mb-3 text-sm font-bold">このコンペの操作</h2>
        <div className="flex flex-wrap gap-3">
          <form action={duplicateComp}>
            <input type="hidden" name="comp_id" value={id} />
            <button className="rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-dim) hover:text-(--color-txt)">
              次回コンペを作る（名簿・景品を引き継ぐ）
            </button>
          </form>
          <form action={deleteComp}>
            <input type="hidden" name="comp_id" value={id} />
            <button className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              このコンペを削除する
            </button>
          </form>
        </div>
        <p className="mt-2 text-xs text-(--color-dim)">
          削除は取り消せる形（論理削除）で行われ、データは残ります。
        </p>
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
