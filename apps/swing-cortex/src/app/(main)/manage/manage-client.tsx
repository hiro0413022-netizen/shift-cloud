"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ManageSymptom, ManageCheckpoint } from "@/lib/data";
import { createSymptom, updateSymptom, deleteSymptom, saveCheckpoint, deleteCheckpoint } from "./manage-actions";

const labelCls = "mb-1 block text-[11px] font-semibold text-slate-500";

/** 確認項目（チェック＋知識）の編集フォーム */
function CheckpointForm({
  symptomId,
  initial,
  onDone,
}: {
  symptomId: string;
  initial?: ManageCheckpoint;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [priority, setPriority] = useState(String(initial?.priority ?? 1));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [cause, setCause] = useState(initial?.cause ?? "");
  const [fix, setFix] = useState(initial?.fix ?? "");
  const [drill, setDrill] = useState(initial?.drill ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [err, setErr] = useState("");

  const submit = () =>
    start(async () => {
      const r = await saveCheckpoint({
        id: initial?.id ?? null,
        knowledgeId: initial?.knowledgeId ?? null,
        symptomId,
        priority: Number(priority) || 1,
        title,
        cause,
        fix,
        drill,
        client,
      });
      if (r && "error" in r) {
        setErr(r.error);
        return;
      }
      router.refresh();
      onDone();
    });

  return (
    <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
      <div className="flex gap-2">
        <div className="w-20">
          <label className={labelCls}>優先度</label>
          <input value={priority} onChange={(e) => setPriority(e.target.value)} className="input-lite" inputMode="numeric" />
        </div>
        <div className="flex-1">
          <label className={labelCls}>チェック項目</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-lite" placeholder="例: スイング軌道" />
        </div>
      </div>
      <div>
        <label className={labelCls}>原因</label>
        <textarea value={cause} onChange={(e) => setCause(e.target.value)} rows={2} className="input-lite" />
      </div>
      <div>
        <label className={labelCls}>改善・対処法</label>
        <textarea value={fix} onChange={(e) => setFix(e.target.value)} rows={2} className="input-lite" />
      </div>
      <div>
        <label className={labelCls}>おすすめドリル</label>
        <textarea value={drill} onChange={(e) => setDrill(e.target.value)} rows={2} className="input-lite" />
      </div>
      <div>
        <label className={labelCls}>お客様への説明</label>
        <textarea value={client} onChange={(e) => setClient(e.target.value)} rows={3} className="input-lite" />
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600">キャンセル</button>
        <button onClick={submit} disabled={pending} className="flex-1 rounded-xl bg-teal-600 py-2 text-sm font-bold text-white disabled:opacity-40">
          {pending ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

/** 症状カード（開閉・症状編集・確認項目CRUD） */
function SymptomCard({ s }: { s: ManageSymptom }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [editSym, setEditSym] = useState(false);
  const [cat, setCat] = useState(s.category);
  const [name, setName] = useState(s.name);
  const [tags, setTags] = useState(s.tags.join("/"));
  const [addingCp, setAddingCp] = useState(false);
  const [editCpId, setEditCpId] = useState<string | null>(null);

  const saveSym = () =>
    start(async () => {
      await updateSymptom({ id: s.id, category: cat, name, tags, active: s.active });
      router.refresh();
      setEditSym(false);
    });
  const removeSym = () =>
    start(async () => {
      if (!confirm(`「${s.name}」を削除しますか？（確認項目も消えます）`)) return;
      await deleteSymptom(s.id);
      router.refresh();
    });
  const removeCp = (id: string, title: string) =>
    start(async () => {
      if (!confirm(`確認項目「${title}」を削除しますか？`)) return;
      await deleteCheckpoint(id);
      router.refresh();
    });

  return (
    <div className="rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between p-3">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left">
          <span className="text-slate-300">{open ? "▾" : "▸"}</span>
          <span>
            <span className="font-semibold text-slate-800">{s.name}</span>
            <span className="ml-2 text-[11px] text-slate-400">{s.checkpoints.length}項目</span>
          </span>
        </button>
        <div className="flex gap-1">
          <button onClick={() => setEditSym((v) => !v)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">編集</button>
          <button onClick={removeSym} className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-500">削除</button>
        </div>
      </div>

      {editSym && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          <div>
            <label className={labelCls}>大分類</label>
            <input value={cat} onChange={(e) => setCat(e.target.value)} className="input-lite" />
          </div>
          <div>
            <label className={labelCls}>症状名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-lite" />
          </div>
          <div>
            <label className={labelCls}>別名・言い換え（/区切り・検索用）</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-lite" placeholder="右に曲がる/こすり球" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditSym(false)} className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600">キャンセル</button>
            <button onClick={saveSym} className="flex-1 rounded-xl bg-teal-600 py-2 text-sm font-bold text-white">保存</button>
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          {s.checkpoints.map((cp) =>
            editCpId === cp.id ? (
              <CheckpointForm key={cp.id} symptomId={s.id} initial={cp} onDone={() => setEditCpId(null)} />
            ) : (
              <div key={cp.id} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="mr-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">No.{cp.priority}</span>
                    <span className="font-semibold text-slate-800">{cp.title}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditCpId(cp.id)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">編集</button>
                    <button onClick={() => removeCp(cp.id, cp.title)} className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-500">削除</button>
                  </div>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] text-slate-400">{cp.cause}</div>
              </div>
            )
          )}
          {addingCp ? (
            <CheckpointForm symptomId={s.id} onDone={() => setAddingCp(false)} />
          ) : (
            <button onClick={() => setAddingCp(true)} className="w-full rounded-xl border border-dashed border-slate-200 py-2 text-sm font-bold text-slate-500">
              ＋ 確認項目を追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManageClient({ tree }: { tree: ManageSymptom[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [err, setErr] = useState("");

  const cats = [...new Set(tree.map((s) => s.category))];

  const add = () =>
    start(async () => {
      const r = await createSymptom({ category: cat, name, tags });
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setAdding(false);
      setCat("");
      setName("");
      setTags("");
      setErr("");
      router.refresh();
    });

  return (
    <div className="p-5 pb-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">項目マスタを編集</h1>
        <Link href="/settings" className="text-sm text-slate-400 underline underline-offset-2">設定へ</Link>
      </div>
      <p className="mb-4 text-xs text-slate-400">データの正はこのシステム（DB）です。ここで直接、症状・確認項目を追加/編集/削除できます。</p>

      {adding ? (
        <div className="mb-4 space-y-2 rounded-2xl border border-teal-100 bg-teal-50/50 p-3">
          <div>
            <label className={labelCls}>大分類</label>
            <input value={cat} onChange={(e) => setCat(e.target.value)} className="input-lite" list="catlist" placeholder="例: A. 球筋・ミス" />
            <datalist id="catlist">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>症状名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-lite" placeholder="例: スライス" />
          </div>
          <div>
            <label className={labelCls}>別名・言い換え（/区切り・検索用）</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-lite" placeholder="右に曲がる/こすり球" />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600">キャンセル</button>
            <button onClick={add} className="flex-1 rounded-xl bg-teal-600 py-2 text-sm font-bold text-white">追加</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mb-4 w-full rounded-2xl bg-teal-600 py-3 text-sm font-bold text-white">
          ＋ 症状を追加
        </button>
      )}

      {cats.map((c) => (
        <div key={c} className="mb-5">
          <div className="mb-2 text-xs font-semibold text-teal-700">{c}</div>
          <div className="space-y-2">
            {tree.filter((s) => s.category === c).map((s) => (
              <SymptomCard key={s.id} s={s} />
            ))}
          </div>
        </div>
      ))}
      {tree.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          まだ項目がありません。「＋症状を追加」か、設定→Excel/seedで投入してください。
        </div>
      )}
    </div>
  );
}
