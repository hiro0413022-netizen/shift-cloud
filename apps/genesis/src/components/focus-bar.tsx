import { updateFocus } from "@/app/(main)/focus-actions";
import type { FocusView } from "@/lib/focus";

/**
 * Focus バー（#304）— 画面上部で「店舗 / 案件 / CEO モード」を選ぶ。
 * 選ぶと JARVIS の答え・Tool の絞り込み・記憶の読み込みがその範囲になる（cookie・30日）。
 */
export function FocusBar({ focus, isOwner }: { focus: FocusView; isOwner: boolean }) {
  const active = focus.store || focus.project || focus.ceo;
  const sel = "h-8 rounded-md border border-(--color-line) bg-(--color-bg) px-2 text-xs";
  return (
    <form action={updateFocus} className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${active ? "border-sky-800/60 bg-sky-950/20" : "border-(--color-line) bg-(--color-panel)"}`}>
      <span className="font-bold text-(--color-dim)">Focus</span>
      <select name="store" defaultValue={focus.store ?? ""} className={sel} title="店舗に絞る">
        <option value="">全店</option>
        {focus.stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select name="project" defaultValue={focus.project ?? ""} className={sel} title="案件を見る">
        <option value="">案件なし</option>
        {focus.projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {isOwner ? (
        <label className="flex items-center gap-1">
          <input type="checkbox" name="ceo" value="1" defaultChecked={focus.ceo} />
          <span>CEO モード</span>
        </label>
      ) : null}
      <button className="h-8 rounded-md border border-(--color-line) px-3 hover:border-sky-700">反映</button>
      {active ? (
        <span className="text-(--color-dim)">
          {focus.storeName ? `店舗: ${focus.storeName}　` : ""}{focus.projectName ? `案件: ${focus.projectName}　` : ""}{focus.ceo ? "CEO モード: 結論と判断を先に・月次の数字で" : ""}
        </span>
      ) : (
        <span className="text-(--color-faint)">店舗・案件に絞ると、JARVIS と Tool がその範囲で動きます</span>
      )}
    </form>
  );
}
