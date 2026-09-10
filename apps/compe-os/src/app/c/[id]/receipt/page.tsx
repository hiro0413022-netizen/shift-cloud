import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listParticipants, listReceipts } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { btnCls, cardCls, Empty, inputCls, labelCls } from "@/components/ui";
import { dateJa, yen } from "@/lib/format";
import { issueReceipt } from "../actions";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const [participants, receipts] = await Promise.all([listParticipants(id), listReceipts(id)]);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  return (
    <>
      <CompNav compId={id} active="receipt" />

      <section className={`${cardCls} mb-5`}>
        <h2 className="mb-4 text-sm font-bold">領収書を発行する</h2>
        <form action={issueReceipt} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="comp_id" value={id} />
          <label className="block sm:col-span-2">
            <span className={labelCls}>宛名（参加者）</span>
            <select name="participant_id" className={inputCls}>
              <option value="">— 選択してください —</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.org ? `（${p.org}）` : ""}
                  {p.paid ? " ✓徴収済" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>金額（円）</span>
            <input type="number" name="amount" defaultValue={comp.fee} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>但し書き</span>
            <input name="purpose" defaultValue="ゴルフコンペ参加費として" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>発行日</span>
            <input type="date" name="issued_on" defaultValue={today} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>発行者</span>
            <input name="issuer" defaultValue={comp.organizer ?? ""} className={inputCls} />
          </label>
          <div className="sm:col-span-3">
            <button className={btnCls}>発行して控えに残す</button>
            <span className="ml-3 text-xs text-(--color-dim)">
              発行すると、その方の参加費は「徴収済」になります。
            </span>
          </div>
        </form>
      </section>

      <section className={cardCls}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">発行済みの控え（{receipts.length}件）</h2>
          {receipts.length > 0 && (
            <Link
              href={`/c/${id}/print/receipts`}
              target="_blank"
              className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
            >
              まとめて印刷
            </Link>
          )}
        </div>
        {receipts.length === 0 ? (
          <Empty title="まだ発行していません" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-(--color-accent) text-left text-white">
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">宛名</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2">但し</th>
                <th className="px-3 py-2">発行日</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-(--color-line)">
                  <td className="px-3 py-2 font-mono text-xs">{r.receipt_no}</td>
                  <td className="px-3 py-2 font-semibold">
                    {r.participant_id ? (byId.get(r.participant_id)?.name ?? "—") : "（宛名なし）"}
                  </td>
                  <td className="px-3 py-2 text-right">{yen(r.amount)}</td>
                  <td className="px-3 py-2 text-xs text-(--color-dim)">{r.purpose ?? ""}</td>
                  <td className="px-3 py-2 text-xs">{dateJa(r.issued_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
