"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InboxRow } from "@/lib/online/data";
import { waitInfo, waitLabel } from "@/lib/online/reply";
import { nameKeyOf } from "@/lib/online/line-csv";
import { Avatar, PlanBadge, SectionTitle, draftStore, fmtAgo, pasteText, Toast, useToast } from "./ui";
import { createMember } from "./online-actions";

type Filter = "all" | "waiting" | "regular" | "premium";

export default function InboxClient({ rows, repliesThisMonth }: { rows: InboxRow[]; repliesThisMonth: number }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [paste, setPaste] = useState("");
  const [pick, setPick] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState("regular");
  const [pending, start] = useTransition();

  const enriched = useMemo(
    () =>
      rows
        .filter((r) => r.status !== "left")
        .map((r) => ({ ...r, wait: waitInfo(r.lastInAt, r.lastOutAt) }))
        .sort((a, b) => {
          if (a.wait.waiting !== b.wait.waiting) return a.wait.waiting ? -1 : 1;
          if (a.wait.waiting) return b.wait.hours - a.wait.hours; // 長く待たせている人が上
          return (b.lastInAt ?? "").localeCompare(a.lastInAt ?? "");
        }),
    [rows]
  );
  const waitingCount = enriched.filter((r) => r.wait.waiting).length;

  const list = enriched.filter((r) => {
    if (filter === "waiting" && !r.wait.waiting) return false;
    if (filter === "regular" && r.plan !== "regular") return false;
    if (filter === "premium" && r.plan !== "premium") return false;
    if (q.trim()) {
      const k = nameKeyOf(q);
      return nameKeyOf(r.name).includes(k) || nameKeyOf(r.lineName ?? "").includes(k);
    }
    return true;
  });

  // 貼った文から会員を推定（本文に名前が入っていることが多い：「辻子 曜です」）
  const guessed = useMemo(() => {
    const k = nameKeyOf(paste);
    if (!k) return [];
    return enriched.filter((r) => {
      const nk = nameKeyOf(r.name);
      const family = nk.slice(0, Math.min(2, nk.length));
      return k.includes(nk) || (family.length >= 2 && k.includes(family));
    });
  }, [paste, enriched]);
  const target = pick || (guessed.length === 1 ? guessed[0].id : "");

  const go = () => {
    if (!target) return;
    if (paste.trim()) draftStore.set(`rr-paste:${target}`, paste.trim());
    router.push(`/online/${target}`);
  };

  const add = () =>
    start(async () => {
      const r = await createMember({ name: newName, plan: newPlan });
      if (!r.ok) return toast.show(r.error);
      setAdding(false);
      setNewName("");
      router.push(`/online/${r.memberId}`);
    });

  return (
    <div>
      <SectionTitle
        en="Inbox"
        ja="受信箱 — 返信を待っている会員から順に並びます"
        right={
          <button className="rr-btn-ghost" onClick={() => setAdding((v) => !v)}>
            ＋ 会員を追加
          </button>
        }
      />

      {adding && (
        <div className="rr-card rr-pop mb-4 flex flex-wrap items-end gap-2 p-4">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-xs text-(--color-dim)">お名前</span>
            <input className="rr-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例: 山田 太郎" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-(--color-dim)">プラン</span>
            <select className="rr-input" value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
              <option value="regular">レギュラー</option>
              <option value="premium">プレミアム</option>
            </select>
          </label>
          <button className="rr-btn-ink" disabled={pending || !newName.trim()} onClick={add}>
            追加してひらく
          </button>
        </div>
      )}

      {/* 数字 */}
      <div className="mb-5 grid grid-cols-3 gap-2 md:gap-3">
        <Stat label="返信待ち" value={waitingCount} unit="人" tone={waitingCount ? "wait" : "ok"} />
        <Stat label="今月の返信" value={repliesThisMonth} unit="件" />
        <Stat label="会員" value={enriched.length} unit="人" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 会員一覧 */}
        <section className="order-2 lg:order-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "すべて"],
                ["waiting", `返信待ち${waitingCount ? ` ${waitingCount}` : ""}`],
                ["regular", "レギュラー"],
                ["premium", "プレミアム"],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button key={k} className="rr-chip" data-on={filter === k} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
            <input
              className="rr-input ml-auto !w-full !py-2 sm:!w-52"
              placeholder="名前で探す"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <ul className="space-y-2.5">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={`/online/${r.id}`} className="rr-card group flex gap-3 p-3.5 transition hover:border-(--rr-gold) md:p-4">
                  <div className="relative">
                    <Avatar name={r.name} size={44} />
                    {r.wait.waiting && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-(--rr-wait)" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.mark && <span className="text-sm">{r.mark}</span>}
                      <span className="text-[16px] font-semibold">{r.name}</span>
                      <PlanBadge plan={r.plan} />
                      {r.status === "paused" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">休会</span>}
                      <span className="ml-auto text-[11px] text-(--color-faint)">{fmtAgo(r.lastInAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-(--color-dim)">
                      {r.lastDirection === "out" && <span className="mr-1 text-(--rr-gold)">あなた:</span>}
                      {r.lastText ?? "（まだメッセージがありません）"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {r.wait.waiting ? (
                        <span className="rounded-full bg-(--rr-wait-soft) px-2.5 py-0.5 text-[11px] font-semibold text-(--rr-wait)">
                          返信待ち {waitLabel(r.wait.hours)}
                          {r.pendingMedia ? ` ・ 動画/写真 ${r.pendingMedia}` : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] text-emerald-700">返信済み</span>
                      )}
                      {r.focus.slice(0, 2).map((f) => (
                        <span key={f} className="rounded-full bg-(--rr-gold-soft) px-2 py-0.5 text-[11px] text-[#8a6d40]">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <svg className="mt-3 h-5 w-5 shrink-0 text-(--color-faint) transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </li>
            ))}
            {!list.length && (
              <li className="rr-card p-8 text-center text-sm text-(--color-dim)">
                {rows.length ? "条件に合う会員はいません" : "会員がまだいません。設定 → トーク履歴の取り込み から始められます"}
              </li>
            )}
          </ul>
        </section>

        {/* 貼って始める */}
        <aside className="order-1 lg:order-2">
          <div className="rr-card sticky top-20 overflow-hidden">
            <div className="bg-(--rr-ink) px-4 py-3 text-white">
              <div className="rr-en text-lg leading-none">Quick Reply</div>
              <div className="mt-1 text-[11px] text-white/60">LINEのメッセージを貼って、そのまま返信づくりへ</div>
            </div>
            <div className="space-y-3 p-4">
              <div className="relative">
                <textarea
                  className="rr-input min-h-[120px] resize-y"
                  placeholder="会員さんのメッセージをここに貼り付け"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
                <button
                  className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] text-(--color-dim) shadow-sm ring-1 ring-(--color-line)"
                  onClick={async () => {
                    const t = await pasteText();
                    if (t) setPaste(t);
                    else toast.show("長押しして「ペースト」を選んでください");
                  }}
                >
                  📋 貼り付け
                </button>
              </div>
              <div>
                <div className="mb-1 text-xs text-(--color-dim)">
                  誰からのメッセージ？{guessed.length === 1 && !pick && <span className="ml-1 text-(--rr-gold)">→ {guessed[0].name}さんと推定</span>}
                </div>
                <select className="rr-input" value={target} onChange={(e) => setPick(e.target.value)}>
                  <option value="">会員を選ぶ</option>
                  {enriched.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}（{r.plan === "premium" ? "プレミアム" : "レギュラー"}）{r.wait.waiting ? " ・返信待ち" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button className="rr-btn-ink w-full py-3" disabled={!target} onClick={go}>
                返信をつくる →
              </button>
            </div>
          </div>
        </aside>
      </div>
      <Toast msg={toast.msg} />
    </div>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: number; unit: string; tone?: "wait" | "ok" }) {
  return (
    <div className="rr-card px-3 py-3 md:px-4">
      <div className="text-[11px] text-(--color-dim)">{label}</div>
      <div className={"mt-0.5 flex items-baseline gap-1 " + (tone === "wait" ? "text-(--rr-wait)" : "text-(--rr-ink)")}>
        <span className="rr-en text-[32px] font-semibold leading-none">{value}</span>
        <span className="text-xs">{unit}</span>
      </div>
    </div>
  );
}
