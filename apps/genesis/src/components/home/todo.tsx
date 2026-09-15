import Link from "next/link";
import type { ReactNode } from "react";
import type { TodoEntry } from "@/lib/todo";
import type { JudgmentItem } from "@/lib/judgment-feed";
import { Badge, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { decideApproval } from "@/app/(main)/approvals/actions";
import { approveActionForm, rejectActionForm, reviseActionAiForm, reviseActionEditForm } from "@/app/(main)/executions/actions";
import { reviewDeliverable } from "@/app/(main)/deliverables/actions";
import { approveInquiry } from "@/app/(main)/inbox/actions";
import { decideTrialRequest, decideJoinRequest, dismissHotLead, acknowledgeAlert } from "@/app/(main)/feed-actions";
import { approveJoinRequestsBulk, dismissProspect, clearAiBacklog } from "@/app/(main)/home-actions";
import { alertKey } from "@/lib/kernel";

/**
 * 今日やること（#244 ③）
 * - 一覧（TodoList）: 1行＝1判断。主ボタンはその場で押せる。行を押すと右パネル。
 * - 右パネル（TodoPanel）: 文面の全文・実行プラン・修正指示・まとめて承認。終わると次の件へ。
 * ボタンの中身（server action）は従来どおり各画面のものをそのまま使う＝ここで新しい書き込みを作らない。
 */

/** 主ボタン（Aキーで押される）と副ボタン */
function Actions({ e, next }: { e: TodoEntry; next: string | null }) {
  const f = e.feed;
  const nextInput = next ? <input type="hidden" name="next" value={next} /> : null;
  if (e.source === "approval" && e.approval) {
    return (
      <form action={decideApproval} className="flex gap-2">
        <input type="hidden" name="id" value={String(e.approval.id)} />
        {nextInput}
        <button name="decision" value="rejected" className="btn-sub">却下</button>
        <button name="decision" value="approved" className="btn-main" data-primary>承認</button>
      </form>
    );
  }
  if (e.source === "alert" && e.alert) {
    return (
      <form action={acknowledgeAlert} className="flex gap-2">
        <input type="hidden" name="key" value={alertKey(e.alert)} />
        <button className="btn-main" data-primary>確認した</button>
      </form>
    );
  }
  if (e.source === "suggestion") {
    return <Link href="/suggestions" className="btn-sub">工程にして指示 →</Link>;
  }
  if (!f) return null;
  if (f.source === "queue")
    return (
      <div className="flex gap-2">
        <form action={rejectActionForm}>
          <input type="hidden" name="id" value={f.id} />
          <button className="btn-sub">却下</button>
        </form>
        <form action={approveActionForm}>
          <input type="hidden" name="id" value={f.id} />
          <button className="btn-main" data-primary>承認して実行</button>
        </form>
      </div>
    );
  if (f.source === "deliverable")
    return (
      <form action={reviewDeliverable} className="flex gap-2">
        <input type="hidden" name="id" value={f.id} />
        <button name="decision" value="rejected" className="btn-sub">却下</button>
        <button name="decision" value="approved" className="btn-main" data-primary>承認</button>
      </form>
    );
  if (f.source === "inquiry")
    return f.hasDraft ? (
      <form action={approveInquiry}>
        <input type="hidden" name="id" value={f.id} />
        <button className="btn-main" data-primary>下書きを承認して送信</button>
      </form>
    ) : (
      <Link href="/inbox" className="btn-sub">下書きを作る</Link>
    );
  if (f.source === "trial")
    return (
      <form action={decideTrialRequest} className="flex gap-2">
        <input type="hidden" name="id" value={f.id} />
        <button name="decision" value="canceled" className="btn-sub">キャンセル</button>
        <button name="decision" value="confirmed" className="btn-main" data-primary>日程を確定</button>
      </form>
    );
  if (f.source === "join")
    return (
      <form action={decideJoinRequest} className="flex gap-2">
        <input type="hidden" name="id" value={f.id} />
        <button name="decision" value="rejected" className="btn-sub">却下</button>
        <button name="decision" value="approved" className="btn-main" data-primary>承認して会員番号発行</button>
      </form>
    );
  if (f.source === "hotlead")
    return (
      <div className="flex gap-2">
        <form action={dismissHotLead}>
          <input type="hidden" name="id" value={f.id} />
          <button className="btn-sub">対応した</button>
        </form>
        {f.href && (
          <a href={f.href} target="_blank" rel="noreferrer" className="btn-main">営業先を開いて架電 →</a>
        )}
      </div>
    );
  if (f.source === "prospect")
    return (
      <div className="flex gap-2">
        <form action={dismissProspect}>
          <input type="hidden" name="id" value={f.id} />
          <button className="btn-sub" title="営業先は残したまま、今日やることから外します">消す</button>
        </form>
        {f.href && (
          <a href={f.href} target="_blank" rel="noreferrer" className="btn-main">デモを確認する →</a>
        )}
      </div>
    );
  if (f.source === "reserve" && f.href)
    return <a href={f.href} target="_blank" rel="noreferrer" className="btn-sub">開いて対応 →</a>;
  return null;
}

const TONE: Record<string, "accent" | "warn" | "danger" | "default"> = {
  リスク: "danger",
  ブロッカー: "danger",
  確認: "warn",
  改善提案: "default",
};

/** #246 「AIが作ったものを全部消す」。お客様から来た件は消さない */
export function ClearAiButton({ todos }: { todos: TodoEntry[] }) {
  const n = todos.filter((t) => t.source === "queue" || t.source === "deliverable" || t.source === "prospect").length;
  if (n === 0) return null;
  return (
    <form action={clearAiBacklog}>
      <button className="btn-sub" title="承認待ちのAI実行・成果物レビュー・デモ完成をまとめて取り下げます（お客様の件は残ります）">
        AIが作ったもの {n}件 を全部消す
      </button>
    </form>
  );
}

export function TodoList({ todos, base = "/" }: { todos: TodoEntry[]; base?: string }) {
  if (todos.length === 0)
    return (
      <div className="py-8 text-center text-sm text-(--color-dim)">
        <p className="text-base">判断ゼロ — いい日です。</p>
      </div>
    );
  const panelHref = (i: number) => {
    const p = new URLSearchParams({ panel: todos[i].key });
    if (todos[i + 1]) p.set("next", todos[i + 1].key);
    return `${base}?${p.toString()}`;
  };
  return (
    <ul>
      {todos.map((e, i) => (
        <li
          key={e.key}
          data-todo-row
          data-panel-href={panelHref(i)}
          className={`todo-row flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-(--color-line) px-3 py-3 md:px-5 ${
            e.stale ? "bg-amber-400/5" : ""
          }`}
        >
          <Link href={panelHref(i)} className="flex min-w-0 flex-1 basis-56 items-center gap-3">
            <Badge tone={TONE[e.tag] ?? "accent"}>{e.tag}</Badge>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-snug">{e.title}</span>
              {e.detail && <span className="mt-0.5 line-clamp-2 block text-sm text-(--color-dim)">{e.detail}</span>}
              {e.stale && <span className="mt-0.5 block text-xs text-(--color-warn)">24時間以上たっています</span>}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Actions e={e} next={todos[i + 1]?.key ?? null} />
            <Link href={panelHref(i)} className="hidden h-9 w-9 items-center justify-center rounded-lg border border-(--color-line) text-(--color-dim) md:flex" aria-label="くわしく">
              <Icon name="arrow" size={16} />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------
   右パネル
------------------------------------------------------------ */
function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      <span className="text-(--color-faint)">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function QueueDetails({ f }: { f: JudgmentItem }) {
  return (
    <div className="space-y-3 text-sm">
      {f.plan && (
        <div className="space-y-1 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
          <Row k="実行内容" v={f.plan.what} />
          <Row k="宛先" v={f.plan.target} />
          <Row k="タイミング" v={f.plan.timing} />
          <p className={`pt-1 text-xs ${f.plan.irreversible ? "text-(--color-warn)" : "text-(--color-dim)"}`}>
            {f.plan.irreversible ? "⚠ 実行後の取り消しはできません（承認前ならここで修正・却下できます）" : "実行後も社内のみ・外部影響なし"}
          </p>
        </div>
      )}
      {f.body && (
        <div>
          <p className="mb-1 text-xs text-(--color-dim)">送信される文面（全文）</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 text-sm leading-relaxed">{f.body}</pre>
        </div>
      )}
      {f.revisable && (
        <details className="rounded-lg border border-(--color-line) p-3">
          <summary className="cursor-pointer text-sm text-(--color-accent)">文面を直す（AIに指示／自分で編集）</summary>
          <div className="mt-3 grid gap-3">
            <form action={reviseActionAiForm} className="space-y-1.5">
              <p className="text-xs text-(--color-dim)">AIに修正指示（例:「値上げの話は入れず、もっと柔らかく」）</p>
              <textarea name="instruction" rows={2} required className="w-full rounded-md border border-(--color-line) bg-(--color-panel-2) p-2 text-sm" placeholder="どこをどう直すか、一言で" />
              <input type="hidden" name="id" value={f.id} />
              <button className="btn-sub">AIに修正させる（指示は学習されます）</button>
            </form>
            <form action={reviseActionEditForm} className="space-y-1.5">
              <p className="text-xs text-(--color-dim)">自分で直接編集（差し替え後も承認するまで送信されません）</p>
              <textarea name="body" rows={5} required defaultValue={f.body ?? ""} className="w-full rounded-md border border-(--color-line) bg-(--color-panel-2) p-2 text-sm" />
              <input name="note" className="w-full rounded-md border border-(--color-line) bg-(--color-panel-2) p-2 text-sm" placeholder="（任意）なぜ直したか — 書くと次回から学習します" />
              <input type="hidden" name="id" value={f.id} />
              <button className="btn-sub">この文面に差し替える</button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}

export function TodoPanel({
  entry,
  index,
  total,
  next,
  closeHref,
  sameKind,
}: {
  entry: TodoEntry | null;
  index: number;
  total: number;
  /** 次の件のパネルURL（終わったら進む） */
  next: string | null;
  closeHref: string;
  /** まとめて承認できる同じ種類の件（Web入会） */
  sameKind: TodoEntry[];
}) {
  const f = entry?.feed;
  return (
    <div className="gn-panel" role="dialog" aria-label="今日やること">
      <Link href={closeHref} className="absolute inset-0 bg-black/55" aria-label="閉じる" />
      <div className="gn-panel-body">
        <div className="flex items-center gap-3 border-b border-(--color-line) px-4 py-3 md:px-6">
          <Link href={closeHref} className="flex h-10 w-10 items-center justify-center rounded-lg border border-(--color-line) text-(--color-dim)" aria-label="閉じる">
            <Icon name="back" size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            {entry ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[entry.tag] ?? "accent"}>{entry.tag}</Badge>
                  <span className="text-xs text-(--color-faint)">
                    {index + 1} / {total}
                  </span>
                </div>
                <p className="mt-1 text-lg font-bold leading-snug">{entry.title}</p>
              </>
            ) : (
              <p className="text-lg font-bold">処理しました</p>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:px-6">
          {!entry ? (
            <div className="space-y-3 text-sm">
              <p className="text-(--color-dim)">この件は終わっています。</p>
              {next ? (
                <Link href={next} className="btn-main inline-block">次の件へ →</Link>
              ) : (
                <Link href={closeHref} className="btn-main inline-block">ホームへ戻る</Link>
              )}
            </div>
          ) : (
            <>
              {entry.detail && <p className="text-[15px] leading-relaxed text-(--color-dim)">{entry.detail}</p>}
              {f && (f.plan || f.body) && <QueueDetails f={f} />}
              {f?.createdAt && <Row k="受け付け" v={fmtDate(f.createdAt)} />}
              {entry.source === "join" && f && (
                <div className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 text-sm">
                  <Row
                    k="決済"
                    v={
                      f.billingStatus === "active" ? (
                        <span className="text-(--color-ok)">入金確認済み（Square）</span>
                      ) : f.billingStatus === "checkout" ? (
                        <span className="text-(--color-warn)">決済ページへ案内済み・入金待ち</span>
                      ) : (
                        <span className="text-(--color-warn)">未入金（承認の前に入金を確認してください）</span>
                      )
                    }
                  />
                </div>
              )}
              {entry.href && (
                entry.href.startsWith("http") ? (
                  <a href={entry.href} target="_blank" rel="noreferrer" className="text-sm text-(--color-accent) hover:underline">
                    元の画面で開く →
                  </a>
                ) : (
                  <Link href={entry.href} className="text-sm text-(--color-accent) hover:underline">
                    元の画面で開く →
                  </Link>
                )
              )}
              {entry.source === "join" && sameKind.length > 1 && (
                <form action={approveJoinRequestsBulk} className="rounded-lg border border-dashed border-(--color-line) p-3">
                  {sameKind
                    .filter((s) => s.feed?.billingStatus === "active")
                    .map((s) => (
                      <input key={s.key} type="hidden" name="ids" value={s.feed?.id ?? ""} />
                    ))}
                  <p className="mb-2 text-sm text-(--color-dim)">
                    同じ種類の入会申込があと {sameKind.length - 1} 件あります。入金確認済みのものだけ、まとめて承認できます。
                  </p>
                  <button className="btn-sub">
                    {sameKind.filter((s) => s.feed?.billingStatus === "active").length}件（入金確認済み）をまとめて承認
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {entry && (
          <div className="flex flex-wrap items-center gap-2 border-t border-(--color-line) px-4 py-3 md:px-6">
            <Actions e={entry} next={next} />
            {next && (
              <Link href={next} className="btn-sub ml-auto">
                次の件へ →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
