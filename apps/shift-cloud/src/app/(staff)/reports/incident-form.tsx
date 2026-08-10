"use client";

import { useState, useTransition } from "react";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_HINTS,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_HINT,
  INCIDENT_SEVERITY_LABEL,
  type IncidentSeverity,
} from "@yozan/core/incidents";
import { submitIncident } from "./actions";

type Store = { id: string; name: string };

/**
 * イレギュラー報告フォーム（スタッフ携帯・DECISIONS #123）
 *
 * 設計: まずカテゴリーを選ぶ → そこで初めて残りの入力欄が開く。
 * 一度に全部見せるとスマホでは長すぎて書く気が失せるため、選択を1手はさんで短く見せる。
 * 日時は「今」を初期値にする（あとから書くときだけ直せばよい）。
 */
export function IncidentForm({ stores, defaultStoreId, nowDate, nowTime }: {
  stores: Store[];
  defaultStoreId: string | null;
  nowDate: string;
  nowTime: string;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [severity, setSeverity] = useState<IncidentSeverity>("mid");
  const [occurredDate, setOccurredDate] = useState(nowDate);
  const [occurredTime, setOccurredTime] = useState(nowTime);
  const [storeId, setStoreId] = useState<string>(defaultStoreId ?? stores[0]?.id ?? "");
  const [place, setPlace] = useState("");
  const [involved, setInvolved] = useState("");
  const [body, setBody] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setCategory(null);
    setSeverity("mid");
    setOccurredDate(nowDate);
    setOccurredTime(nowTime);
    setPlace("");
    setInvolved("");
    setBody("");
    setActionTaken("");
  };

  const field = "w-full rounded-md border border-zinc-200 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      {/* 1. カテゴリー選択 */}
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-500">何があった？（分類を選んでください）</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(INCIDENT_CATEGORIES).map(([key, label]) => {
            const on = category === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setCategory(key); setMsg(null); }}
                className={`min-h-16 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-brand bg-brand-light text-brand" : "border-zinc-200 bg-white text-zinc-700 active:bg-zinc-50"
                }`}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className={`mt-0.5 block text-[10px] leading-tight ${on ? "text-brand/70" : "text-zinc-400"}`}>
                  {INCIDENT_CATEGORY_HINTS[key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. カテゴリーを選ぶと詳細が開く */}
      {category && (
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
          {/* 重大度 */}
          <div>
            <label className="text-xs font-medium text-zinc-500">重大度</label>
            <div className="mt-1.5 flex gap-2">
              {INCIDENT_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`flex-1 rounded-lg border py-2 text-sm transition-colors ${
                    severity === s
                      ? s === "high"
                        ? "border-red-400 bg-red-50 font-medium text-red-600"
                        : "border-brand bg-brand-light font-medium text-brand"
                      : "border-zinc-200 bg-white text-zinc-500"
                  }`}
                >
                  {INCIDENT_SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">{INCIDENT_SEVERITY_HINT[severity]}</p>
          </div>

          {/* いつ */}
          <div>
            <label className="text-xs font-medium text-zinc-500">いつ</label>
            <div className="mt-1.5 flex gap-2">
              <input type="date" value={occurredDate} onChange={(e) => setOccurredDate(e.target.value)} className={field} />
              <input type="time" value={occurredTime} onChange={(e) => setOccurredTime(e.target.value)} className={field} />
            </div>
          </div>

          {/* どこ */}
          <div>
            <label className="text-xs font-medium text-zinc-500">どこで</label>
            <div className="mt-1.5 space-y-2">
              {stores.length > 1 && (
                <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={field}>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="場所（例: 1番打席 / レジ / 受付）"
                className={field}
              />
            </div>
          </div>

          {/* だれが */}
          <div>
            <label className="text-xs font-medium text-zinc-500">だれが（分かる範囲で）</label>
            <input
              value={involved}
              onChange={(e) => setInvolved(e.target.value)}
              placeholder="お客様名・スタッフ名など"
              className={`mt-1.5 ${field}`}
            />
          </div>

          {/* なにがあったか */}
          <div>
            <label className="text-xs font-medium text-zinc-500">なにがあったか <span className="text-red-500">*</span></label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="事実をそのまま書いてください（推測や反省はいりません）"
              className={`mt-1.5 ${field}`}
            />
          </div>

          {/* 対応 */}
          <div>
            <label className="text-xs font-medium text-zinc-500">その場でどう対応したか</label>
            <textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              rows={2}
              placeholder="対応していなければ空のままでOK"
              className={`mt-1.5 ${field}`}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={pending || !body.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await submitIncident({
                    category,
                    severity,
                    occurredDate,
                    occurredTime,
                    storeId: storeId || null,
                    place,
                    involved,
                    body,
                    actionTaken,
                  });
                  if (r.error) { setMsg({ kind: "err", text: r.error }); return; }
                  setMsg({ kind: "ok", text: r.notice ?? "報告しました" });
                  reset();
                })
              }
              className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? "送信中…" : "報告する"}
            </button>
            <button type="button" onClick={reset} className="text-sm text-zinc-400">やめる</button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-brand" : "text-red-500"}`}>{msg.text}</p>
      )}
    </div>
  );
}
