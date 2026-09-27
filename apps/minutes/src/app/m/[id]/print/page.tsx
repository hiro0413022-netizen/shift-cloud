import { notFound } from "next/navigation";
import { ownMeeting } from "@/lib/meetings";
import { MODE_BY_ID, isModeId, summaryToText } from "@/lib/modes";
import { LEVEL_INFO } from "@/lib/levels";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/** 印刷・PDF用（ブラウザの印刷で「PDFに保存」）。確定前は「下書き」と大きく出す */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { meeting: m } = await ownMeeting(id);
  if (!m) notFound();
  const mode = isModeId(m.mode) ? MODE_BY_ID[m.mode] : null;
  const body = m.body ?? (m.summary && mode ? summaryToText(m.summary, mode) : "");
  const todos = m.todos ?? m.summary?.todos ?? [];
  const draft = m.status !== "confirmed";

  return (
    <main className="mx-auto max-w-[800px] bg-white p-10 text-[14px] leading-relaxed print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>
      {draft && <p className="mb-4 border-2 border-red-500 p-2 text-center font-bold text-red-600">下書き（未確定）</p>}
      {m.level !== "L1" && <p className="mb-2 text-right text-xs font-bold">{LEVEL_INFO[m.level].label}・取扱注意</p>}
      <h1 className="mb-1 text-2xl font-bold">議事録　{m.title}</h1>
      <table className="mb-6 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-28 border border-gray-300 bg-gray-50 px-2 py-1 text-left font-normal">日付</th>
            <td className="border border-gray-300 px-2 py-1">{m.meetingDate}</td>
          </tr>
          {m.participants && (
            <tr>
              <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-left font-normal">参加者</th>
              <td className="border border-gray-300 px-2 py-1">{m.participants}</td>
            </tr>
          )}
          {mode && (
            <tr>
              <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-left font-normal">種類</th>
              <td className="border border-gray-300 px-2 py-1">{mode.label}</td>
            </tr>
          )}
          {m.creatorName && (
            <tr>
              <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-left font-normal">作成</th>
              <td className="border border-gray-300 px-2 py-1">
                {m.creatorName}
                {m.confirmedAt ? `（${m.confirmedAt.slice(0, 10)} 確定）` : ""}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <pre className="whitespace-pre-wrap font-sans">{body}</pre>
      {todos.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-bold">■ ToDo</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-left">内容</th>
                <th className="w-28 border border-gray-300 bg-gray-50 px-2 py-1 text-left">担当</th>
                <th className="w-28 border border-gray-300 bg-gray-50 px-2 py-1 text-left">期限</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((t, i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1">{t.task}</td>
                  <td className="border border-gray-300 px-2 py-1">{t.owner}</td>
                  <td className="border border-gray-300 px-2 py-1">{t.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
