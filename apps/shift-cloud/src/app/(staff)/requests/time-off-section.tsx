import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { fmtDateJP } from "@/lib/util";
import { submitTimeOff, withdrawTimeOff } from "./actions";

export type TimeOffRequest = {
  id: string;
  start_date: string;
  end_date: string;
  kind: string;
  reason: string | null;
  status: string;
  decision_note: string | null;
};

const STATUS: Record<string, { label: string; color: "amber" | "green" | "zinc" | "red" }> = {
  submitted: { label: "申請中", color: "amber" },
  approved: { label: "承認されました", color: "green" },
  rejected: { label: "見送り", color: "red" },
  withdrawn: { label: "取り下げ済み", color: "zinc" },
};

const KIND: Record<string, string> = {
  day_off: "休み希望",
  vacation: "長期休暇",
  other: "その他",
};

/**
 * 休み希望はシフト募集と切り離してある。
 * 「9月の募集がまだ開いていないから来年のお盆の休みが出せない」を無くすため。
 */
export function TimeOffSection({ mine, today }: { mine: TimeOffRequest[]; today: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">休み希望</h2>
      <p className="mb-3 mt-1 text-sm text-zinc-500">
        募集期間に関係なく、いつでも出せます。長期休暇や先に決まっている予定は早めに入れてください。
      </p>

      <Card className="!p-4">
        <form action={submitTimeOff} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>開始日</Label>
              <Input name="start_date" type="date" required min={today} />
            </div>
            <div>
              <Label>終了日</Label>
              <Input name="end_date" type="date" required min={today} />
            </div>
          </div>
          <p className="-mt-1 text-xs text-zinc-400">1日だけの場合は開始日と終了日に同じ日を入れてください。</p>
          <div>
            <Label>種類</Label>
            <select name="kind" defaultValue="day_off"
              className="w-full rounded-md border border-zinc-300 px-2 py-2 text-sm focus:border-brand focus:outline-none">
              <option value="day_off">休み希望</option>
              <option value="vacation">長期休暇</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div>
            <Label>理由・メモ（任意）</Label>
            <Input name="reason" placeholder="例: 帰省のため" />
          </div>
          <Button type="submit" className="w-full">休み希望を出す</Button>
        </form>
      </Card>

      {mine.length > 0 && (
        <div className="mt-3 space-y-2">
          {mine.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, color: "zinc" as const };
            const single = r.start_date === r.end_date;
            return (
              <Card key={r.id} className="!p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {single ? fmtDateJP(r.start_date) : `${fmtDateJP(r.start_date)} 〜 ${fmtDateJP(r.end_date)}`}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {KIND[r.kind] ?? r.kind}{r.reason ? ` ・ ${r.reason}` : ""}
                    </p>
                    {r.decision_note && (
                      <p className="mt-1 text-xs text-zinc-500">運営より: {r.decision_note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge color={st.color}>{st.label}</Badge>
                    {(r.status === "submitted" || r.status === "approved") && (
                      <form action={withdrawTimeOff}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-xs text-zinc-400 hover:text-red-600">取り下げ</button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
