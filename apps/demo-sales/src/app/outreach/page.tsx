import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { cardCls, inputCls, btnCls } from "@/components/ui";
import { INDUSTRIES } from "@/lib/types";
import { saveOutSettings, saveTemplate, pauseOutreach, resumeOutreach, previewOutreach, addSuppression } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "営業メールの送受信" };

type Msg = {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  error: string | null;
  prospect_id: string | null;
};
type Tpl = { id: string; key: string; name: string; industry: string | null; subject: string; body: string; enabled: boolean; sort: number };
type Sup = { id: string; email: string | null; domain: string | null; reason: string; created_at: string };

const STATUS_LABEL: Record<string, string> = {
  queued: "送信待ち",
  sent: "送信済み",
  delivered: "相手のサーバーに到達",
  opened: "開封された",
  bounced: "宛先不明で返ってきた",
  complained: "迷惑メール報告",
  failed: "送信失敗",
  canceled: "取消",
};

const jst = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function OutreachPage() {
  const actor = await requireActor();
  const admin = createAdmin();

  const [{ data: st }, { data: tpls }, { data: msgs }, { data: sups }, { count: readyCount }] = await Promise.all([
    admin.from("out_settings").select("*").eq("company_id", actor.companyId).maybeSingle(),
    admin.from("out_templates").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort"),
    admin.from("out_messages").select("*").eq("company_id", actor.companyId).order("created_at", { ascending: false }).limit(50),
    admin.from("out_suppressions").select("*").eq("company_id", actor.companyId).order("created_at", { ascending: false }).limit(30),
    admin
      .from("dms_prospects")
      .select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .eq("status", "demo_done")
      .not("email", "is", null)
      .eq("email_source", "site"),
  ]);

  const rows = (msgs ?? []) as Msg[];
  const tplRows = (tpls ?? []) as Tpl[];
  const supRows = (sups ?? []) as Sup[];
  const enabled = Boolean(st?.enabled);
  const paused = Boolean(st?.paused_at);

  const tally = (k: string) => rows.filter((r) => r.status === k).length;
  const opened = rows.filter((r) => r.opened_at).length;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-(--color-dim) hover:text-(--color-txt)">
          ← 営業司令へ戻る
        </Link>
        <h1 className="text-2xl font-bold">営業メールの送受信</h1>
        <p className="text-sm text-(--color-dim)">
          デモが完成した営業先へ、毎日 設定した時刻に自動でメールを送ります（パソコンを開いていなくても動きます）。
          <b>送るのは、先方のサイトにメールアドレスが公表されている先だけ</b>です。返信は info@yozan-group.jp に届きます。
        </p>
      </header>

      {/* 状態 */}
      <section className={`${cardCls} mb-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className={`rounded px-2 py-1 text-xs ${paused ? "bg-red-500/15 text-red-300" : enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-(--color-dim)"}`}>
              {paused ? "自動停止中" : enabled ? "送信ON" : "送信OFF"}
            </span>
            {paused && st?.paused_reason ? <span className="ml-3 text-sm text-red-300">{st.paused_reason}</span> : null}
          </div>
          <div className="flex gap-2">
            <form action={previewOutreach}>
              <button className={btnCls}>送らずに内容を確認</button>
            </form>
            {paused ? (
              <form action={resumeOutreach}>
                <button className={btnCls}>停止を解除して再開</button>
              </form>
            ) : (
              <form action={pauseOutreach}>
                <button className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10">いますぐ止める</button>
              </form>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ["送信できる先", `${readyCount ?? 0} 件`],
            ["送信済み", `${tally("sent") + tally("delivered") + opened} 通`],
            ["開封", `${opened} 通`],
            ["宛先不明", `${tally("bounced")} 通`],
            ["迷惑報告", `${tally("complained")} 通`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-(--color-line) p-3">
              <div className="text-xs text-(--color-dim)">{k}</div>
              <div className="text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 設定 */}
      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">送信設定</h2>
        <form action={saveOutSettings} className="grid gap-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs text-(--color-dim)">
              送信元アドレス（送信専用サブドメイン）
              <input name="from_email" defaultValue={st?.from_email ?? ""} placeholder="web@send.yozan-group.jp" className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">
              差出人名
              <input name="from_name" defaultValue={st?.from_name ?? "株式会社YOZAN"} className={inputCls} />
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="text-xs text-(--color-dim)">
              返信の受け口
              <input name="reply_to" defaultValue={st?.reply_to ?? "info@yozan-group.jp"} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">
              1日の上限（最終）
              <input name="daily_cap_max" type="number" defaultValue={st?.daily_cap_max ?? 50} className={inputCls} />
            </label>
            <label className="text-xs text-(--color-dim)">
              送信する時刻（JST）
              <input name="send_hour_jst" type="number" min={0} max={23} defaultValue={st?.send_hour_jst ?? 10} className={inputCls} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={enabled} />
            自動送信を有効にする
            <span className="text-xs text-(--color-dim)">（送信ドメインの認証が終わってからONにしてください）</span>
          </label>
          <div>
            <button className={btnCls}>保存</button>
          </div>
        </form>
        <p className="mt-3 text-[11px] text-(--color-dim)">
          初日は10通、以降1日ずつ10通ふえて上限で止まります（新しい送信元から急に大量に送ると迷惑メール扱いになるため）。
          宛先不明が8%を超える、または迷惑メール報告が2件に達すると<b>自動で停止</b>します。
        </p>
      </section>

      {/* 送信ログ */}
      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">送信ログ（直近50通）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-(--color-dim)">
              <tr>
                <th className="py-1 pr-3">送信</th>
                <th className="py-1 pr-3">宛先</th>
                <th className="py-1 pr-3">件名</th>
                <th className="py-1 pr-3">状態</th>
                <th className="py-1 pr-3">開封</th>
                <th className="py-1 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-2 text-(--color-dim)">
                    まだ1通も送っていません
                  </td>
                </tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="border-t border-(--color-line)">
                    <td className="py-1 pr-3 whitespace-nowrap">{jst(m.sent_at)}</td>
                    <td className="py-1 pr-3">{m.to_email}</td>
                    <td className="py-1 pr-3 max-w-[22rem] truncate">{m.subject}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {STATUS_LABEL[m.status] ?? m.status}
                      {m.error ? <span className="ml-1 text-red-300">（{m.error.slice(0, 40)}）</span> : null}
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap">{jst(m.opened_at)}</td>
                    <td className="py-1 pr-3">
                      {m.prospect_id ? (
                        <Link href={`/p/${m.prospect_id}`} className="text-(--color-accent) hover:underline">
                          営業先 →
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-(--color-dim)">
          先方からの<b>返信は info@yozan-group.jp（Gmailへ転送済み）に届きます</b>。この画面には「送った・届いた・開かれた」までが出ます。
        </p>
      </section>

      {/* 文面 */}
      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">文面（{tplRows.length}件）</h2>
        <p className="mb-3 text-[11px] text-(--color-dim)">
          差込: <code>{"{{name}}"}</code> 屋号 / <code>{"{{improve}}"}</code> 改善余地 / <code>{"{{demoUrl}}"}</code> デモURL /{" "}
          <code>{"{{company}}"}</code> 会社名 / <code>{"{{representative}}"}</code> 代表者。
          会社の住所・配信停止リンクは<b>自動で末尾に付きます</b>（法律で義務づけられているため、本文に書く必要はありません）。
        </p>
        <div className="grid gap-4">
          {tplRows.map((t) => (
            <form key={t.id} action={saveTemplate} className="grid gap-2 rounded-lg border border-(--color-line) p-3 text-sm">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="key" value={t.key} />
              <div className="grid gap-2 md:grid-cols-3">
                <label className="text-xs text-(--color-dim)">
                  名前
                  <input name="name" defaultValue={t.name} className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">
                  業種（空＝全業種の既定）
                  <select name="industry" defaultValue={t.industry ?? ""} className={inputCls}>
                    <option value="">全業種の既定</option>
                    {Object.entries(INDUSTRIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-(--color-dim)">
                  優先度（小さいほど先）
                  <input name="sort" type="number" defaultValue={t.sort} className={inputCls} />
                </label>
              </div>
              <label className="text-xs text-(--color-dim)">
                件名
                <input name="subject" defaultValue={t.subject} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim)">
                本文
                <textarea name="body" defaultValue={t.body} rows={12} className={`${inputCls} font-mono text-[13px]`} />
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="enabled" defaultChecked={t.enabled} /> 使う
                </label>
                <button className={btnCls}>保存</button>
              </div>
            </form>
          ))}
          {tplRows.length === 0 ? (
            <p className="text-sm text-(--color-dim)">
              まだありません。「送らずに内容を確認」を押すと、既定の文面が自動で作られます。
            </p>
          ) : null}
        </div>
      </section>

      {/* 送らない先 */}
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">送らない先（{supRows.length}件）</h2>
        <form action={addSuppression} className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="text-xs text-(--color-dim)">
            メールアドレス
            <input name="email" className={inputCls} placeholder="info@example.jp" />
          </label>
          <label className="text-xs text-(--color-dim)">
            またはドメイン
            <input name="domain" className={inputCls} placeholder="example.jp" />
          </label>
          <label className="text-xs text-(--color-dim)">
            メモ
            <input name="note" className={inputCls} />
          </label>
          <button className={btnCls}>追加</button>
        </form>
        <ul className="grid gap-1 text-xs">
          {supRows.map((s) => (
            <li key={s.id} className="flex items-center justify-between border-b border-(--color-line) py-1">
              <span>{s.email ?? `@${s.domain}`}</span>
              <span className="text-(--color-dim)">
                {{ unsubscribed: "配信停止のご希望", bounced: "宛先不明", complained: "迷惑メール報告", no_solicit: "営業お断りの表示", manual: "手動" }[s.reason] ?? s.reason} ／ {jst(s.created_at)}
              </span>
            </li>
          ))}
          {supRows.length === 0 ? <li className="text-(--color-dim)">まだありません</li> : null}
        </ul>
      </section>
    </main>
  );
}
