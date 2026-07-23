"use client";

import { useMemo, useRef, useState } from "react";
import type { DiagnosisResult } from "@/lib/coaching";
import { matchSymptoms } from "@/lib/coaching";
import { draftComment, saveKarteDraft, type DraftResult } from "./ai-actions";
import { saveNote, createStudent } from "./student-actions";
import type { Student } from "@/lib/data";

function Icon({ d, cls = "h-6 w-6" }: { d: string; cls?: string }) {
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
const I = {
  search: "M21 21l-4.3-4.3M17 10a7 7 0 11-14 0 7 7 0 0114 0z",
  chevron: "M9 6l6 6-6 6",
  line: "M4 5h16v10H12l-4 3v-3H4z",
  dots: "M6 12h.01M12 12h.01M18 12h.01",
  check: "M5 13l4 4L19 7",
  copy: "M9 9h9v11H9zM6 15H4V4h11v2",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  mic: "M12 4a3 3 0 013 3v4a3 3 0 01-6 0V7a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4M8 21h8",
  spark: "M12 3l1.8 4.9L18 9.7l-4.2 1.8L12 16l-1.8-4.5L6 9.7l4.2-1.8z",
  user: "M16 14a4 4 0 10-8 0M12 7a3 3 0 100 6 3 3 0 000-6M4 20a8 8 0 0116 0",
  plus: "M12 5v14M5 12h14",
};

function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2">
      <div className="fade flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
        <Icon d={I.check} cls="h-4 w-4 text-emerald-400" />
        {msg}
      </div>
    </div>
  );
}

const toneMap: Record<string, string> = {
  rose: "bg-rose-50 text-rose-500",
  teal: "bg-teal-50 text-teal-600",
  indigo: "bg-indigo-50 text-indigo-500",
};
function Block({ label, text, tone, highlight }: { label: string; text: string; tone?: string; highlight?: boolean }) {
  if (!text) return null;
  return (
    <div className={"rounded-2xl p-4 " + (highlight ? "bg-slate-900 text-white" : "bg-slate-50")}>
      <div
        className={
          "mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold " +
          (highlight ? "bg-white/15 text-white" : toneMap[tone ?? "teal"])
        }
      >
        {label}
      </div>
      <p className={"text-sm leading-relaxed " + (highlight ? "text-slate-100" : "text-slate-700")}>{text}</p>
    </div>
  );
}

function Composer({
  symptom,
  cp,
  student,
  onClose,
  toast,
}: {
  symptom: DiagnosisResult;
  cp: DiagnosisResult["checkpoints"][number];
  student?: Student | null;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [structured, setStructured] = useState("");
  const [natural, setNatural] = useState("");

  const generate = async () => {
    setLoading(true);
    try {
      const r = await draftComment({
        symptomId: symptom.symptomId,
        symptomName: symptom.symptomName,
        category: symptom.category,
        checkpointTitle: cp.title,
        cause: cp.cause,
        fix: cp.fix,
        drill: cp.drill,
        client: cp.client,
        coachMemo: memo,
        symptomKey: symptom.symptomName,
        tags: symptom.tags,
        studentId: student?.id ?? null,
      });
      setDraft(r);
      setStructured(r.structured);
      setNatural(r.natural);
    } catch {
      toast("下書きの生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const copyField = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* クリップボード不可の環境は無視 */
    }
    // 記録（フライホイール用）— バックグラウンドで診断ログに残す
    saveKarteDraft({
      symptomId: symptom.symptomId,
      symptomName: symptom.symptomName,
      coachMemo: memo,
      structured,
      natural,
    }).catch(() => {});
    toast("コピーしました");
  };

  const [saved, setSaved] = useState(false);
  const saveToKarte = async () => {
    if (!student) return;
    await saveNote({
      studentId: student.id,
      symptomId: symptom.symptomId,
      symptomName: symptom.symptomName,
      coachMemo: memo,
      structured,
      natural,
    });
    setSaved(true);
    toast(`${student.name} さんのカルテに保存しました`);
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-t-3xl bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="text-sm font-bold text-slate-800">
          コメント作成 — {symptom.symptomName}
          {student && <span className="ml-1 text-teal-600">/ {student.name}</span>}
        </div>
        <button onClick={onClose} className="text-sm text-slate-400">閉じる</button>
      </div>
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto p-5">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-slate-500">今日見たこと・やったドリル（口語でOK）</div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            placeholder="例: テイクバックで頭が動く、8-4ドリルやった、右手が強い"
            className="input-lite"
          />
          <button
            onClick={generate}
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {loading ? "生成中..." : draft ? "もう一度AIで下書き" : "AIで下書き"}
          </button>
          <p className="mt-1 text-[10px] text-slate-400">
            この学校の過去コメントを参照し、文体・ドリル名を踏襲して書きます。
          </p>
        </div>

        {draft && (
          <div className="space-y-3 fade">
            <div className="flex items-center gap-2 text-[10px]">
              <span className={"rounded-full px-2 py-0.5 font-bold " + (draft.engine === "claude" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500")}>
                {draft.engine === "claude" ? "AI生成" : "テンプレ生成"}
              </span>
              <span className="text-slate-400">参照した過去コメント {draft.examplesUsed}件</span>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">整形（問題点・修正点・ドリル）</span>
                <button onClick={() => copyField(structured)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  コピー
                </button>
              </div>
              <textarea value={structured} onChange={(e) => setStructured(e.target.value)} rows={5} className="input-lite" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">自然な文章（そのまま貼れる）</span>
                <button onClick={() => copyField(natural)} className="rounded-lg bg-teal-100 px-2.5 py-1 text-[11px] font-bold text-teal-700">
                  コピー
                </button>
              </div>
              <textarea value={natural} onChange={(e) => setNatural(e.target.value)} rows={4} className="input-lite" />
            </div>
            {student && (
              <button
                onClick={saveToKarte}
                disabled={saved}
                className="w-full rounded-2xl bg-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                {saved ? "保存しました" : `${student.name} さんのカルテに保存`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Sheet({
  symptom,
  student,
  onClose,
  toast,
}: {
  symptom: DiagnosisResult;
  student?: Student | null;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const [open, setOpen] = useState(0);
  const [composing, setComposing] = useState(false);
  const cp = symptom.checkpoints[open];

  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[480px]">
      <div className="fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-up absolute bottom-0 left-0 right-0 flex max-h-[88%] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-start justify-between px-5 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{symptom.category}</span>
              {symptom.flightDir && <span className="text-xs text-slate-400">{symptom.flightDir}</span>}
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">{symptom.symptomName}</h2>
          </div>
          <button onClick={onClose} className="px-2 text-2xl leading-none text-slate-400">
            ×
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5">
          {symptom.checkpoints.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-3">
              {symptom.checkpoints.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setOpen(i)}
                  className={
                    "shrink-0 rounded-xl border px-3 py-2 text-left transition " +
                    (open === i ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-500")
                  }
                >
                  <div className="text-[10px] opacity-70">No.{c.priority}</div>
                  <div className="text-xs font-semibold">{c.title}</div>
                </button>
              ))}
            </div>
          )}
          {cp && (
            <div key={open} className="fade space-y-3 pb-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-bold text-white">確認優先度 {cp.priority}</span>
                <h3 className="font-bold text-slate-800">{cp.title}</h3>
              </div>
              <Block label="原因" tone="rose" text={cp.cause} />
              <Block label="改善・対処法" tone="teal" text={cp.fix} />
              {cp.drill && <Block label="おすすめドリル" tone="indigo" text={cp.drill} />}
              <Block label="お客様への説明" text={cp.client} highlight />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white px-5 pt-3">
          <button
            onClick={() => setComposing(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 py-2.5 text-sm font-bold text-teal-700"
          >
            <Icon d={I.spark} cls="h-4 w-4" />
            この内容でレッスンコメントを作成
          </button>
        </div>
        <div className="border-t-0 bg-white px-5 py-3">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(cp?.client ?? "");
              } catch {
                /* クリップボード不可の環境は無視 */
              }
              toast("お客様への説明をコピーしました");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600"
          >
            <Icon d={I.copy} cls="h-4 w-4" />
            お客様への説明をコピー
          </button>
        </div>
        {composing && cp && (
          <Composer symptom={symptom} cp={cp} student={student} onClose={() => setComposing(false)} toast={toast} />
        )}
      </div>
    </div>
  );
}

function StudentPicker({
  students,
  onPick,
  onClose,
  toast,
}: {
  students: Student[];
  onPick: (s: Student) => void;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = q
    ? students.filter((s) => s.name.includes(q) || (s.nameKana ?? "").includes(q))
    : students;

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const r = await createStudent({ name: name.trim() });
    setBusy(false);
    if ("error" in r) {
      toast(r.error);
      return;
    }
    onPick({ id: r.id, name: name.trim(), nameKana: null, memberCode: null });
  };

  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[480px]">
      <div className="fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-up absolute bottom-0 left-0 right-0 flex max-h-[80%] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="text-sm font-bold text-slate-800">生徒を選ぶ</div>
          <button onClick={onClose} className="text-sm text-slate-400">閉じる</button>
        </div>
        {adding ? (
          <div className="space-y-2 px-5 pb-5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="氏名" className="input-lite" />
            <div className="flex gap-2">
              <button onClick={() => setAdding(false)} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600">戻る</button>
              <button onClick={add} disabled={busy || !name.trim()} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {busy ? "登録中..." : "登録して選ぶ"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 pb-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="氏名で検索" className="input-lite" />
            </div>
            <div className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-5 pb-3">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onPick(s)}
                  className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-3 text-left text-sm"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                    {s.name.slice(0, 1)}
                  </span>
                  <span className="font-semibold text-slate-800">{s.name}</span>
                  {s.nameKana && <span className="text-[11px] text-slate-400">{s.nameKana}</span>}
                </button>
              ))}
              {filtered.length === 0 && <div className="py-6 text-center text-sm text-slate-400">該当なし</div>}
            </div>
            <div className="border-t border-slate-100 px-5 py-3">
              <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700">
                <Icon d={I.plus} cls="h-4 w-4" />
                新しい生徒を登録
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DiagnosisClient({
  coachName,
  tree,
  chips,
  students,
  studentCrm = false,
}: {
  coachName: string;
  tree: DiagnosisResult[];
  chips: string[];
  students: Student[];
  studentCrm?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<DiagnosisResult | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(""), 1900);
  };
  const byName = useMemo(() => new Map(tree.map((s) => [s.symptomName, s])), [tree]);
  // 症状名を知らなくても「見たまま」で当てる（同義語＋タグ＋球筋方向でスコア照合）
  const results = useMemo(() => matchSymptoms(q, tree), [q, tree]);

  // 音声入力（Web Speech API・対応ブラウザのみ）
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop?: () => void } | null>(null);
  const voiceSupported =
    typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const toggleVoice = () => {
    if (!voiceSupported) return;
    if (listening) {
      recRef.current?.stop?.();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => unknown;
      SpeechRecognition?: new () => unknown;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor() as {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setQ(text);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div className="p-5 pb-8">
      <div className="mb-3">
        <div className="text-xs text-slate-400">こんにちは、{coachName}</div>
        <h1 className="text-xl font-bold text-slate-900">今、何に困っていますか？</h1>
      </div>

      {/* 生徒コンテキスト（proのみ。選ぶと過去カルテを踏まえてパーソナライズ＋保存できる） */}
      {studentCrm &&
        (student ? (
        <div className="mb-3 flex items-center justify-between rounded-2xl bg-teal-600 px-4 py-2.5 text-white">
          <div className="flex items-center gap-2">
            <Icon d={I.user} cls="h-4 w-4" />
            <div>
              <div className="text-sm font-bold">{student.name}</div>
              <div className="text-[11px] opacity-80">カルテ連携中・提案がパーソナライズされます</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a href={`/students/${student.id}`} className="rounded-lg bg-white/20 px-2 py-1 text-[11px]">カルテ</a>
            <button onClick={() => setStudent(null)} className="rounded-lg bg-white/20 px-2 py-1 text-[11px]">解除</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPickerOpen(true)}
          className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-400"
        >
          <Icon d={I.user} cls="h-4 w-4" />
          生徒を選ぶ（任意・カルテ連携でパーソナライズ）
        </button>
        ))}

      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
          <Icon d={I.search} cls="h-5 w-5" />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="見たままでOK（例: 右に曲がる、猫背）"
          className={"input-lite pl-12 " + (voiceSupported ? "pr-12" : "")}
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label="音声入力"
            className={
              "absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl " +
              (listening ? "animate-pulse bg-red-500 text-white" : "bg-slate-100 text-slate-500")
            }
          >
            <Icon d={I.mic} cls="h-5 w-5" />
          </button>
        )}
      </div>
      <p className="mt-2 px-1 text-[11px] text-slate-400">
        症状名がわからなくても大丈夫。「右に曲がる」「回らない」など話し言葉で入力できます
        {voiceSupported ? "（マイクで音声も）" : ""}。
      </p>

      {q ? (
        <div className="mt-3 space-y-2">
          {results.length ? (
            results.map((s) => (
              <button
                key={s.symptomId}
                onClick={() => setSel(s)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="text-left">
                  <div className="font-semibold text-slate-800">{s.symptomName}</div>
                  <div className="text-xs text-slate-400">
                    {s.category}
                    {s.flightDir ? `・${s.flightDir}` : ""}
                  </div>
                </div>
                <Icon d={I.chevron} cls="h-5 w-5 text-slate-300" />
              </button>
            ))
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">
              近い症状が見つかりませんでした。言い方を変えるか、ライブラリから探せます。
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <div className="mb-2 text-xs font-semibold text-slate-400">よく使う症状</div>
          <div className="flex flex-wrap gap-2">
            {chips.map((name) => {
              const s = byName.get(name);
              if (!s) return null;
              return (
                <button
                  key={name}
                  onClick={() => setSel(s)}
                  className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm"
                >
                  {name}
                </button>
              );
            })}
          </div>
          {tree.length === 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
              まだ症状データがありません。設定 → Excel取込 で知識ベースを読み込んでください。
            </div>
          )}
        </div>
      )}

      {sel && <Sheet symptom={sel} student={student} onClose={() => setSel(null)} toast={toast} />}
      {studentCrm && pickerOpen && (
        <StudentPicker
          students={students}
          onPick={(s) => {
            setStudent(s);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
          toast={toast}
        />
      )}
      <Toast msg={toastMsg} />
    </div>
  );
}
