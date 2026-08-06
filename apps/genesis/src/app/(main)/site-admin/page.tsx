import { createAdmin } from "@/lib/supabase/admin";
import { DEFAULT_BOOKING_CFG, type BookingCfg } from "@/lib/frank-booking";
import { saveBasics, saveBookingCfg, addNews, deleteNews, saveRawJson } from "./actions";

export const dynamic = "force-dynamic";

/**
 * FRANK GOLF サイト管理（#85 §3-1 CMS）
 * ここで保存 → 60秒以内に frankgolf.jp に反映（公開API経由・再デプロイ不要）。
 * 空欄で保存 = サイト内蔵の既定値（site-data.js）に戻る。
 */
export default async function SiteAdminPage() {
  const admin = createAdmin();
  const { data: row } = await admin.from("gn_site_content").select("data, news, updated_at").eq("site", "frank-golf").maybeSingle();
  const d = (row?.data ?? {}) as { store?: Record<string, string>; preopen?: { benefits?: string[] } };
  const news = (Array.isArray(row?.news) ? row?.news : []) as { date?: string; tag?: string; title?: string; url?: string | null }[];

  const input = "w-full rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm";
  const label = "mb-1 block text-[11px] text-(--color-dim)";
  const btn = "rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500";

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold">FRANK GOLF サイト管理</h1>
        <p className="mt-1 text-[12px] text-(--color-dim)">
          保存すると約1分以内に公式サイトへ反映されます（再デプロイ不要）。空欄で保存するとサイト既定値に戻ります。
          {row?.updated_at ? ` 最終更新: ${String(row.updated_at).slice(0, 16).replace("T", " ")}` : ""}
        </p>
      </div>

      <form action={saveBasics} className="space-y-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
        <h2 className="text-sm font-semibold">基本情報</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>営業時間</label>
            <input name="hours" defaultValue={d.store?.hours ?? ""} placeholder="平日 10:00〜22:00 ／ 土日祝 9:00〜20:00" className={input} />
          </div>
          <div>
            <label className={label}>定休日</label>
            <input name="holiday" defaultValue={d.store?.holiday ?? ""} placeholder="毎週火曜日" className={input} />
          </div>
          <div>
            <label className={label}>電話番号</label>
            <input name="tel" defaultValue={d.store?.tel ?? ""} placeholder="079-XXX-XXXX" className={input} />
          </div>
          <div>
            <label className={label}>駐車場</label>
            <input name="parking" defaultValue={d.store?.parking ?? ""} placeholder="最大20台・無料" className={input} />
          </div>
        </div>
        <div>
          <label className={label}>プレオープン特典（「、」区切りで複数）</label>
          <input name="benefits" defaultValue={(d.preopen?.benefits ?? []).join("、")} placeholder="入会金無料、初月会費半額" className={input} />
        </div>
        <button type="submit" className={btn}>基本情報を保存</button>
      </form>

      <BookingSection d={d as Record<string, unknown>} input={input} label={label} btn={btn} />

      <div className="space-y-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
        <h2 className="text-sm font-semibold">お知らせ（サイトのNEWS欄）</h2>
        <form action={addNews} className="grid grid-cols-[110px_110px_1fr_auto] gap-2">
          <input name="date" type="date" className={input} />
          <input name="tag" placeholder="お知らせ" className={input} />
          <input name="title" placeholder="タイトル（必須）" required className={input} />
          <button type="submit" className={btn}>追加</button>
        </form>
        <ul className="space-y-2">
          {news.length === 0 && <li className="text-[12px] text-(--color-dim)">まだお知らせはありません（0件のときサイトのNEWS欄は自動非表示）</li>}
          {news.map((n, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-(--color-panel-2) px-3 py-2 text-sm">
              <span>
                <span className="mr-2 text-[11px] text-(--color-dim)">{n.date}</span>
                <span className="mr-2 rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] text-sky-300">{n.tag}</span>
                {n.title}
              </span>
              <form action={deleteNews}>
                <input type="hidden" name="index" value={i} />
                <button type="submit" className="text-[12px] text-red-300 hover:underline">削除</button>
              </form>
            </li>
          ))}
        </ul>
      </div>

      {/* 上級者向けJSON */}
      <details className="rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
        <summary className="cursor-pointer text-sm font-semibold text-(--color-dim)">上級者向け: 全項目をJSONで直接編集</summary>
        <form action={saveRawJson} className="mt-4 space-y-3">
          <textarea name="json" rows={12} defaultValue={JSON.stringify(row?.data ?? {}, null, 2)} className={`${input} font-mono text-[12px]`} />
          <p className="text-[11px] text-(--color-dim)">
            サイトの window.FRANK に上書きマージされます。例: {"{"}"store":{"{"}"tel":"079-260-8686"{"}"}{"}"}。キーは sites/frank-golf/assets/site-data.js を参照。
          </p>
          <button type="submit" className={btn}>JSONを保存</button>
        </form>
      </details>
    </div>
  );
}

/** 予約設定フォーム（#87: 営業時間・定休日・祝日・臨時休業を設定で変更） */
function BookingSection({ d, input, label, btn }: { d: Record<string, unknown>; input: string; label: string; btn: string }) {
  const cfg: BookingCfg = {
    ...DEFAULT_BOOKING_CFG,
    ...((d.booking ?? {}) as Partial<BookingCfg>),
    weekday: { ...DEFAULT_BOOKING_CFG.weekday, ...((d.booking as Partial<BookingCfg> | undefined)?.weekday ?? {}) },
    weekend: { ...DEFAULT_BOOKING_CFG.weekend, ...((d.booking as Partial<BookingCfg> | undefined)?.weekend ?? {}) },
  };
  return (
    <form action={saveBookingCfg} className="space-y-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
      <h2 className="text-sm font-semibold">予約設定（打席予約の営業時間・休業日）</h2>
      <div className="grid grid-cols-4 gap-3">
        <div><label className={label}>平日 開店</label><input name="wd_open" defaultValue={cfg.weekday.open} className={input} /></div>
        <div><label className={label}>平日 閉店</label><input name="wd_close" defaultValue={cfg.weekday.close} className={input} /></div>
        <div><label className={label}>土日祝 開店</label><input name="we_open" defaultValue={cfg.weekend.open} className={input} /></div>
        <div><label className={label}>土日祝 閉店</label><input name="we_close" defaultValue={cfg.weekend.close} className={input} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label}>定休曜日（0=日〜6=土、複数は「,」区切り）</label>
          <input name="closed_dows" defaultValue={cfg.closed_dows.join(",")} placeholder="2" className={input} />
        </div>
        <div>
          <label className={label}>予約枠の単位（分）</label>
          <input name="slot" defaultValue={String(cfg.slot_minutes)} placeholder="30" className={input} />
        </div>
        <div>
          <label className={label}>何日先まで予約可</label>
          <input name="advance_days" defaultValue={String(cfg.advance_days)} className={input} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>祝日（土日祝営業時間を適用・YYYY-MM-DDを「,」区切り）</label>
          <input name="holiday_dates" defaultValue={cfg.holiday_dates.join(", ")} placeholder="2026-09-21, 2026-09-23" className={input} />
        </div>
        <div>
          <label className={label}>臨時休業日（YYYY-MM-DDを「,」区切り）</label>
          <input name="closed_dates" defaultValue={cfg.closed_dates.join(", ")} placeholder="2026-12-31" className={input} />
        </div>
      </div>
      <button type="submit" className={btn}>予約設定を保存</button>
    </form>
  );
}
