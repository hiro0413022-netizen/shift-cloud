"use client";

// 受付フォームの共通パーツ。
// 「初めての方」と「2回目以降の方」で見た目・アンケートの出し分けを1か所にする
// （画面ごとに書くと、体験とフィッティングの設問がいつか片方だけズレる）。

import {
  VISIT_TYPES, REFERRAL_SOURCES,
  TRIAL_REASONS, FITTING_REASONS, SCHOOL_GOALS, JOIN_INTEREST,
} from "@/lib/walkin";

export const field =
  "w-full rounded-xl border border-(--color-line) bg-white px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
export const labelCls = "mb-1 block text-sm font-medium text-(--color-dim)";
export const cardCls = "rounded-2xl border border-(--color-line) bg-(--color-panel) p-5 shadow-sm";

export function CheckGroup({ name, options }: { name: string; options: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 rounded-lg border border-(--color-line) bg-white px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
          <input type="checkbox" name={name} value={o} className="h-5 w-5 accent-(--color-accent)" />
          {o}
        </label>
      ))}
    </div>
  );
}

/** 本日のご利用（利用区分の選択） */
export function VisitTypePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={`${cardCls} space-y-3`}>
      <p className="text-sm font-semibold text-(--color-txt)">本日のご利用 <span className="text-rose-500">*</span></p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {VISIT_TYPES.map((v) => (
          <label
            key={v.value}
            className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-3.5 text-sm font-medium transition-colors ${
              value === v.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-(--color-line) bg-white text-(--color-dim)"
            }`}
          >
            <input
              type="radio" name="visit_type" value={v.value} className="sr-only"
              checked={value === v.value} onChange={() => onChange(v.value)}
            />
            {v.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * アンケート。設問は**今日の利用区分**で出し分ける
 * （フィッティングはフィッティングの設問、体験は体験の設問 — ユーザー指示 2026-09-06）。
 * 再来の方にも毎回おうかがいする: 目的は来店のたびに変わるため。
 * `askReferral` は「当店を何で知りましたか」の有無。2回目以降の方には出さない。
 */
export function SurveyFields({
  visitType,
  askReferral = true,
}: {
  visitType: string;
  askReferral?: boolean;
}) {
  return (
    <div className={`${cardCls} space-y-4`}>
      <p className="text-sm font-semibold text-(--color-txt)">アンケート（任意）</p>

      {askReferral && (
        <>
          <div>
            <label className={labelCls}>当店を何で知りましたか</label>
            <select name="referral_source" defaultValue="" className={field}>
              <option value="">選択</option>
              {REFERRAL_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>（紹介・その他の場合）詳細</label>
            <input name="referral_source_other" placeholder="紹介者名など" className={field} />
          </div>
        </>
      )}

      {visitType === "fitting" ? (
        <div>
          <label className={labelCls}>フィッティングでご興味のある点</label>
          <CheckGroup name="fitting_reasons" options={FITTING_REASONS} />
        </div>
      ) : (
        <div>
          <label className={labelCls}>ご利用の目的・ご興味</label>
          <CheckGroup name="trial_reasons" options={TRIAL_REASONS} />
        </div>
      )}

      <div>
        <label className={labelCls}>ゴルフスクールに通う目的</label>
        <CheckGroup name="school_goals" options={SCHOOL_GOALS} />
      </div>
      <div>
        <label className={labelCls}>入会へのご興味</label>
        <select name="join_interest" defaultValue="" className={field}>
          <option value="">選択</option>
          {JOIN_INTEREST.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>ご要望・ご質問</label>
        <input name="comment" placeholder="自由記述" className={field} />
      </div>
    </div>
  );
}

/** 個人情報の同意（どちらの入口でも必須） */
export function ConsentField() {
  return (
    <div className={`${cardCls} space-y-3`}>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
        <span>個人情報をサービス提供・入会手続きの目的で利用することに同意します。<span className="text-rose-500">*</span></span>
      </label>
    </div>
  );
}

/** 受付完了 */
export function ReceptionDone({ onAgain }: { onAgain?: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">✓</div>
      <p className="mt-3 text-lg font-semibold">ご記入ありがとうございました</p>
      <p className="mt-2 text-sm text-(--color-dim)">受付が完了しました。タブレットをスタッフにお渡しください。</p>
      {onAgain && (
        <button
          type="button"
          onClick={onAgain}
          className="mt-6 w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90"
        >
          最初の画面に戻る（次の方へ）
        </button>
      )}
    </div>
  );
}

/** 入力内容の確認（送信前のオーバーレイ） */
export function ConfirmSheet({
  rows,
  pending,
  onCancel,
  onSubmit,
  title = "この内容で受付しますか？",
}: {
  rows: Record<string, string>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  title?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-lg font-semibold text-(--color-txt)">{title}</p>
        <dl className="mt-4 divide-y divide-(--color-line)">
          {Object.entries(rows).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2 text-sm">
              <dt className="shrink-0 text-(--color-dim)">{k}</dt>
              <dd className="text-right font-medium text-(--color-txt)">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-(--color-line) bg-white py-3.5 text-base font-semibold text-(--color-dim) transition-colors hover:bg-(--color-panel-2)"
          >
            修正する
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onSubmit}
            className="rounded-xl bg-accent py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {pending ? "送信中..." : "この内容で受付する"}
          </button>
        </div>
      </div>
    </div>
  );
}
