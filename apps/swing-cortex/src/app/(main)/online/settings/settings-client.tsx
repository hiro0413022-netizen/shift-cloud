"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { OnlineProfile } from "@/lib/online/reply";
import { AutoTextarea, SectionTitle, Toast, useToast } from "../ui";
import { saveProfile, importLineCsv } from "../online-actions";

type Result = { file: string; ok: boolean; text: string; memberId?: string };

export default function SettingsClient({
  profile,
  members,
  aiReady,
}: {
  profile: OnlineProfile & { plan_rules: { regular: string; premium: string; other: string } };
  members: { id: string; name: string }[];
  aiReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState(profile);
  const [busy, start] = useTransition();
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [target, setTarget] = useState("");

  const save = () =>
    start(async () => {
      const r = await saveProfile(p);
      toast.show(r.ok ? "保存しました。次の返信から反映されます" : r.error);
    });

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    const list: Result[] = [];
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const r = await importLineCsv({ fileName: f.name, text, memberId: target || null });
        list.push(
          r.ok
            ? {
                file: f.name, ok: true, memberId: r.memberId,
                text: `${r.memberName}さん ${r.created ? "（新規）" : ""}— ${r.total.toLocaleString()}件中 ${r.inserted.toLocaleString()}件を追加${r.videos ? `・動画${r.videos}本` : ""}`,
              }
            : { file: f.name, ok: false, text: r.error }
        );
      } catch (e) {
        list.push({ file: f.name, ok: false, text: e instanceof Error ? e.message : "読み込めませんでした" });
      }
      setResults([...list]);
    }
    setImporting(false);
    router.refresh();
  };

  const rule = (k: "regular" | "premium", label: string) => (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold">{label}</span>
      <AutoTextarea
        minRows={2}
        className="rr-input text-sm"
        value={p.plan_rules[k]}
        onChange={(e) => setP({ ...p, plan_rules: { ...p.plan_rules, [k]: e.target.value } })}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionTitle en="Settings" ja="設定 — 返信の口調・プランのルール・トーク履歴の取り込み" />

      <div className={"rr-card flex items-center gap-3 p-4 " + (aiReady ? "" : "border-(--rr-wait)")}>
        <span className={"h-2.5 w-2.5 rounded-full " + (aiReady ? "bg-emerald-500" : "bg-(--rr-wait)")} />
        <div className="text-sm">
          {aiReady ? "AIの返信づくりは使える状態です" : "AIの設定がまだです（管理者作業）。今はメモから簡易な下書きを組み立てます"}
        </div>
      </div>

      {/* 口調 */}
      <section className="rr-card space-y-3 p-5">
        <div>
          <div className="rr-en text-xl leading-none">Voice</div>
          <div className="mt-1 text-[12px] text-(--color-dim)">返信の口調とルール。ここを直すと、AIの下書きがその通りに変わります</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[12px] font-semibold">コーチ名</span>
            <input className="rr-input !py-2" value={p.coach_name ?? ""} onChange={(e) => setP({ ...p, coach_name: e.target.value })} />
          </label>
          <label>
            <span className="mb-1 block text-[12px] font-semibold">サービス名</span>
            <input className="rr-input !py-2" value={p.service_name ?? ""} onChange={(e) => setP({ ...p, service_name: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold">口調・書き方</span>
          <AutoTextarea minRows={4} className="rr-input text-sm" value={p.tone ?? ""} onChange={(e) => setP({ ...p, tone: e.target.value })} />
        </label>
        {rule("regular", "レギュラープランで答えてよい範囲")}
        {rule("premium", "プレミアムプランで答えてよい範囲")}
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <label>
            <span className="mb-1 block text-[12px] font-semibold">文末に毎回つける一言（任意）</span>
            <input className="rr-input !py-2" placeholder="空なら付けません" value={p.signature ?? ""} onChange={(e) => setP({ ...p, signature: e.target.value })} />
          </label>
          <label>
            <span className="mb-1 block text-[12px] font-semibold">文字数の上限</span>
            <input type="number" min={80} max={1500} step={10} className="rr-input !py-2" value={p.max_chars ?? 400} onChange={(e) => setP({ ...p, max_chars: Number(e.target.value) })} />
          </label>
        </div>
        <div className="flex justify-end">
          <button className="rr-btn-ink px-6" disabled={busy} onClick={save}>保存</button>
        </div>
      </section>

      {/* 取り込み */}
      <section className="rr-card space-y-3 p-5">
        <div>
          <div className="rr-en text-xl leading-none">Import</div>
          <div className="mt-1 text-[12px] text-(--color-dim)">
            LINE公式アカウントの「トーク履歴のダウンロード（CSV）」をそのまま入れられます。何度入れても二重にはなりません。
          </div>
        </div>
        <ol className="list-decimal space-y-0.5 pl-5 text-[12px] text-(--color-dim)">
          <li>LINE Official Account Manager → チャット → 会員のトークを開く</li>
          <li>右上のメニュー → 「トーク履歴をダウンロード」</li>
          <li>下のボタンから選ぶ（複数まとめてOK）</li>
        </ol>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold">取り込み先</span>
          <select className="rr-input !py-2" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">CSVの名前から自動で判定（いなければ会員を作る）</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}さんに入れる</option>
            ))}
          </select>
        </label>
        <label className={"rr-btn-ink w-full cursor-pointer py-3.5 " + (importing ? "pointer-events-none opacity-50" : "")}>
          {importing ? "取り込み中…" : "CSVファイルを選ぶ"}
          <input type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        {results.length > 0 && (
          <ul className="space-y-1.5">
            {results.map((r, i) => (
              <li key={i} className={"rounded-xl px-3 py-2 text-[12px] " + (r.ok ? "bg-emerald-50 text-emerald-800" : "bg-(--rr-wait-soft) text-(--rr-wait)")}>
                <div className="truncate font-semibold">{r.file}</div>
                <div className="flex items-center gap-2">
                  <span>{r.text}</span>
                  {r.memberId && <Link className="ml-auto underline" href={`/online/${r.memberId}`}>ひらく</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rr-card p-5 text-[12px] leading-relaxed text-(--color-dim)">
        <div className="mb-1 font-semibold text-(--color-txt)">このシステムの約束</div>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>LINEへの送信はしません。返信は必ずご自身でLINEに貼って送ります。</li>
          <li>AIは動画を見ていません。動きの指摘は「動画を見て気づいたこと」に書いた内容だけを使います。</li>
          <li>参考動画のURLはライブラリにあるものだけが入ります（AIがURLを作ることはありません）。</li>
          <li>AIの下書きとご自身で直した文の両方が残るので、使うほど口調が合っていきます。</li>
        </ul>
      </section>
      <Toast msg={toast.msg} />
    </div>
  );
}
