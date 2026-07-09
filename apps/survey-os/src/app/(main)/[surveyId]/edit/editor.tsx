"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Question, QOption, QuestionType } from "@/lib/survey";
import { inputCls, btnCls, btnGhostCls, Panel, STATUS_LABEL } from "@/components/ui";
import { updateSurvey, saveQuestion, deleteQuestion, moveQuestion } from "./actions";

export type SurveyMeta = {
  title: string;
  description: string | null;
  purpose: string | null;
  slug: string;
  status: "draft" | "open" | "closed";
  is_anonymous: boolean;
  intro_text: string | null;
  thanks_text: string | null;
  est_minutes: number | null;
};

const TYPE_LABEL: Record<QuestionType, string> = {
  single: "単一選択",
  multi: "複数選択",
  text: "短文",
  textarea: "自由記述",
  ranking: "順位付け",
  scale: "段階",
};
const TYPES: QuestionType[] = ["single", "multi", "text", "textarea", "ranking", "scale"];

const labelCls = "mb-1 block text-xs font-medium text-[--color-dim]";
const rand = () => "opt_" + Math.random().toString(36).slice(2, 8);

// ============================================================
// 選択肢エディタ
// ============================================================
function OptionsEditor({ options, onChange }: { options: QOption[]; onChange: (o: QOption[]) => void }) {
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-right text-xs text-[--color-dim]">{i + 1}</span>
          <input
            className={inputCls}
            value={o.label}
            placeholder="選択肢の表示名"
            onChange={(e) => {
              const next = options.slice();
              next[i] = { ...next[i], label: e.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="shrink-0 rounded-lg border border-[--color-line] px-2 py-2 text-xs text-rose-500 hover:bg-rose-50"
          >
            削除
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...options, { value: rand(), label: "" }])} className={btnGhostCls}>
        ＋ 選択肢を追加
      </button>
    </div>
  );
}

// ============================================================
// 設問カード
// ============================================================
function QuestionCard({
  surveyId,
  question,
  multiCodes,
  isNew,
  onDone,
  onCancel,
}: {
  surveyId: string;
  question: Question | null;
  multiCodes: { code: string; title: string }[];
  isNew?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [section, setSection] = useState(question?.section ?? "");
  const [code, setCode] = useState(question?.code ?? "");
  const [type, setType] = useState<QuestionType>(question?.type ?? "single");
  const [title, setTitle] = useState(question?.title ?? "");
  const [help, setHelp] = useState(question?.help_text ?? "");
  const [required, setRequired] = useState(question?.required ?? false);
  const [options, setOptions] = useState<QOption[]>(question?.config?.pool ?? question?.options ?? []);
  const [allowOther, setAllowOther] = useState(!!question?.config?.allow_other);
  const [isRankingSource, setIsRankingSource] = useState(!!question?.config?.is_ranking_source);
  const [sourceCode, setSourceCode] = useState(question?.config?.source_code ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const needsOptions = ["single", "multi", "scale", "ranking"].includes(type);

  function save() {
    setErr(null);
    start(async () => {
      const res = await saveQuestion(surveyId, {
        id: question?.id,
        section,
        code,
        type,
        title,
        help_text: help,
        required,
        options: needsOptions ? options : [],
        config: {
          ...(type === "multi" ? { allow_other: allowOther, is_ranking_source: isRankingSource } : {}),
          ...(type === "ranking" && sourceCode ? { source_code: sourceCode } : {}),
        },
      });
      if (res.error) setErr(res.error);
      else onDone();
    });
  }

  function remove() {
    const q = question;
    if (!q?.id) return;
    if (!confirm(`設問「${q.code}」を削除しますか？（回答データは残りますが集計対象から外れます）`)) return;
    start(async () => {
      const res = await deleteQuestion(surveyId, q.id);
      if (res.error) setErr(res.error);
      else onDone();
    });
  }

  function move(dir: "up" | "down") {
    const q = question;
    if (!q?.id) return;
    start(async () => {
      await moveQuestion(surveyId, q.id, dir);
      onDone();
    });
  }

  return (
    <div className="rounded-2xl border border-[--color-line] bg-[--color-panel] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-24`} value={code} placeholder="コード" onChange={(e) => setCode(e.target.value)} />
        <select className={`${inputCls} w-32`} value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-[--color-dim]">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 accent-[--color-accent]" />
          必須
        </label>
        {!isNew && question?.id && (
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={() => move("up")} disabled={pending} className="rounded border border-[--color-line] px-2 py-1 text-xs disabled:opacity-40">▲</button>
            <button type="button" onClick={() => move("down")} disabled={pending} className="rounded border border-[--color-line] px-2 py-1 text-xs disabled:opacity-40">▼</button>
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>セクション見出し（任意）</label>
          <input className={inputCls} value={section} placeholder="例: セクション1 回答者情報" onChange={(e) => setSection(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>補足説明（任意）</label>
          <input className={inputCls} value={help} placeholder="例: 複数選択可" onChange={(e) => setHelp(e.target.value)} />
        </div>
      </div>

      <div className="mt-3">
        <label className={labelCls}>設問文 <span className="text-rose-500">*</span></label>
        <input className={inputCls} value={title} placeholder="設問の本文" onChange={(e) => setTitle(e.target.value)} />
      </div>

      {needsOptions && (
        <div className="mt-3">
          <label className={labelCls}>{type === "ranking" ? "順位付けの候補" : type === "scale" ? "段階の選択肢" : "選択肢"}</label>
          <OptionsEditor options={options} onChange={setOptions} />
        </div>
      )}

      {type === "multi" && (
        <div className="mt-3 flex flex-wrap gap-4 rounded-lg bg-[--color-panel-2] p-3">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={allowOther} onChange={(e) => setAllowOther(e.target.checked)} className="h-4 w-4 accent-[--color-accent]" />
            「その他」自由記述を許可
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isRankingSource} onChange={(e) => setIsRankingSource(e.target.checked)} className="h-4 w-4 accent-[--color-accent]" />
            順位付けの母集団にする（受講コーチ選択など）
          </label>
        </div>
      )}

      {type === "ranking" && (
        <div className="mt-3 rounded-lg bg-[--color-panel-2] p-3">
          <label className={labelCls}>連動する選択設問（任意）</label>
          <select className={inputCls} value={sourceCode} onChange={(e) => setSourceCode(e.target.value)}>
            <option value="">連動しない（候補を全員表示）</option>
            {multiCodes.map((m) => <option key={m.code} value={m.code}>{m.code}: {m.title}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-[--color-dim]">指定すると、その複数選択設問で選ばれた項目だけを並び替え対象にします。</p>
        </div>
      )}

      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={save} disabled={pending} className={btnCls}>
          {pending ? "保存中..." : isNew ? "この設問を追加" : "保存"}
        </button>
        {isNew && onCancel && (
          <button type="button" onClick={onCancel} className={btnGhostCls}>キャンセル</button>
        )}
        {!isNew && question?.id && (
          <button type="button" onClick={remove} disabled={pending} className="ml-auto rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
            削除
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// メタ編集 + 設問リスト
// ============================================================
export function Editor({ surveyId, meta, questions }: { surveyId: string; meta: SurveyMeta; questions: Question[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const [m, setM] = useState<SurveyMeta>(meta);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  const multiCodes = questions.filter((q) => q.type === "multi").map((q) => ({ code: q.code, title: q.title }));

  function saveMeta() {
    setMetaErr(null);
    setMetaMsg(null);
    start(async () => {
      const res = await updateSurvey(surveyId, {
        title: m.title,
        description: m.description ?? "",
        purpose: m.purpose ?? "",
        slug: m.slug,
        status: m.status,
        is_anonymous: m.is_anonymous,
        intro_text: m.intro_text ?? "",
        thanks_text: m.thanks_text ?? "",
        est_minutes: m.est_minutes,
      });
      if (res.error) setMetaErr(res.error);
      else {
        setMetaMsg("保存しました。");
        refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* アンケート設定 */}
      <Panel title="アンケート設定">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>タイトル <span className="text-rose-500">*</span></label>
            <input className={inputCls} value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>公開状態</label>
            <select className={inputCls} value={m.status} onChange={(e) => setM({ ...m, status: e.target.value as SurveyMeta["status"] })}>
              {(["draft", "open", "closed"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>公開URLスラッグ（英小文字・数字・ハイフン）</label>
            <input className={inputCls} value={m.slug} onChange={(e) => setM({ ...m, slug: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>説明（任意）</label>
            <input className={inputCls} value={m.description ?? ""} onChange={(e) => setM({ ...m, description: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>想定回答時間（分・任意）</label>
            <input
              type="number"
              className={inputCls}
              value={m.est_minutes ?? ""}
              onChange={(e) => setM({ ...m, est_minutes: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>冒頭文（回答者向け）</label>
            <textarea rows={2} className={inputCls} value={m.intro_text ?? ""} onChange={(e) => setM({ ...m, intro_text: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>送信後のお礼文</label>
            <textarea rows={2} className={inputCls} value={m.thanks_text ?? ""} onChange={(e) => setM({ ...m, thanks_text: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={m.is_anonymous} onChange={(e) => setM({ ...m, is_anonymous: e.target.checked })} className="h-4 w-4 accent-[--color-accent]" />
            匿名回答
          </label>
        </div>
        {metaErr && <p className="mt-3 text-sm text-rose-600">{metaErr}</p>}
        {metaMsg && <p className="mt-3 text-sm text-emerald-600">{metaMsg}</p>}
        <div className="mt-4">
          <button type="button" onClick={saveMeta} disabled={pending} className={btnCls}>{pending ? "保存中..." : "設定を保存"}</button>
        </div>
      </Panel>

      {/* 設問 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">設問（{questions.length}）</h2>
        {!adding && <button type="button" onClick={() => setAdding(true)} className={btnCls}>＋ 設問を追加</button>}
      </div>

      <div className="space-y-3">
        {questions.map((q) => (
          <QuestionCard key={q.id} surveyId={surveyId} question={q} multiCodes={multiCodes} onDone={refresh} />
        ))}

        {adding && (
          <QuestionCard
            surveyId={surveyId}
            question={null}
            multiCodes={multiCodes}
            isNew
            onDone={() => { setAdding(false); refresh(); }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}
