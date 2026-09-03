import { listVoiceNotes } from "../note-actions";
import NoteClient from "./note-client";

export const dynamic = "force-dynamic";

/**
 * レッスン記録（音声メモの下書き置き場）/ 2026-09-03
 * 録音そのものはレイアウトの録音バーが持っている（画面を移っても切れないようにするため）。
 * ここは「できた下書きを直して保存する」ためだけの画面。
 */
export default async function NotePage() {
  const notes = await listVoiceNotes(20);
  return (
    <div className="p-5 pb-8">
      <h1 className="mb-1 text-xl font-bold text-slate-900">レッスン記録</h1>
      <p className="mb-4 text-[11px] leading-relaxed text-slate-500">
        上の【🎙 レッスンを記録する】で録音すると、ここに下書きが出ます。
        内容を直して保存したものだけが記録として残ります（AIが出したままでは残りません）。
      </p>
      <NoteClient initial={notes} />
    </div>
  );
}
