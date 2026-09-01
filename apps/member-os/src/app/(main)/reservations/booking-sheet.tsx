"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { createBooking, createTrialByStaff, type BookingFormState } from "./actions";
import { MemberPicker, type PickerMember } from "./member-picker";
import { NameFields } from "@/components/name-fields";
import { BirthDateInput } from "@/components/birth-date-input";
import { TRIAL_EXPERIENCE } from "@/lib/trial";

/**
 * カレンダーのマスをタップして、その場で予約を入れる（#192）
 *
 * ★ なぜ作ったか（2026-09-01 ユーザー指摘）
 *   電話で体験の予約を受けたとき、スタッフには入口が無かった。
 *   公式サイトの体験予約ページを自分で開いてお客様のふりをして入力するしかなく、
 *   会員の追加予約も「打席を選び、開始時刻を選び、区分を選び…」と項目を上から埋める作りだった。
 *   店頭でやりたいのは逆で、**カレンダーの空いているところを指で押す**のが最初の動作。
 *
 * ★ 作り
 *   カレンダー（BayTimeline）の空きマスは `data-book-bay` / `data-book-slot` を持つボタンになる。
 *   ここはその外側を包んで、押されたマスを拾って入力パネルを開くだけ。
 *   カレンダーそのものはサーバーコンポーネントのまま＝表の描画にJSを持ち込まない。
 *
 * ★ 体験と会員で入口を分けない
 *   1枚のパネルの中でタブを切り替える。押した場所（日・時刻・打席）は両方に引き継ぐ。
 */

const inputCls =
  "mt-1 w-full rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-txt) focus:border-accent focus:outline-none";
const labelCls = "text-xs font-medium text-(--color-dim)";
const btnCls =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50";
const btnGhostCls =
  "inline-flex items-center justify-center rounded-lg border border-(--color-line) bg-white px-4 py-2.5 text-sm text-(--color-dim) transition-colors hover:text-(--color-txt)";

export type SheetBay = { id: string; name: string };

type Picked = { bayId: string; slot: string } | null;

/** "10:30" → 直前の毎時00分 "10:00"（体験は毎時00分スタートのみ） */
function toHourStart(slot: string): string {
  return `${slot.slice(0, 2)}:00`;
}

export function BookingSheet({
  date,
  dateLabel,
  bays,
  slots,
  minutesOptions,
  members,
  trialSlots,
  children,
}: {
  date: string;
  dateLabel: string;
  bays: SheetBay[];
  /** 予約を作れる開始時刻（スタッフの刻み・HH:MM） */
  slots: string[];
  minutesOptions: number[];
  members: PickerMember[];
  /** 体験を入れられる開始時刻（毎時00分・HH:MM） */
  trialSlots: string[];
  children: ReactNode;
}) {
  const [picked, setPicked] = useState<Picked>(null);
  const [open, setOpen] = useState(false);

  const openAt = (p: Picked) => {
    setPicked(p);
    setOpen(true);
  };

  return (
    <div className="space-y-2">
      {/* カレンダーの空きマス（data-book-*）を拾う。表そのものはサーバー側の描画のまま */}
      <div
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>("[data-book-bay]");
          if (!el) return;
          e.preventDefault();
          openAt({ bayId: el.dataset.bookBay ?? "", slot: el.dataset.bookSlot ?? "" });
        }}
      >
        {children}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => openAt(null)} className={btnCls}>
          ＋ 予約を追加
        </button>
        <span className="text-xs text-(--color-dim)">
          カレンダーの空いているマスを押しても、その時間で入力できます
        </span>
      </div>

      {open && (
        <SheetDialog
          date={date}
          dateLabel={dateLabel}
          bays={bays}
          slots={slots}
          minutesOptions={minutesOptions}
          members={members}
          trialSlots={trialSlots}
          picked={picked}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function SheetDialog({
  date,
  dateLabel,
  bays,
  slots,
  minutesOptions,
  members,
  trialSlots,
  picked,
  onClose,
}: {
  date: string;
  dateLabel: string;
  bays: SheetBay[];
  slots: string[];
  minutesOptions: number[];
  members: PickerMember[];
  trialSlots: string[];
  picked: Picked;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"member" | "trial">("member");
  const cardRef = useRef<HTMLDivElement>(null);

  // Escで閉じる（店頭PCのキーボード操作）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const defaultSlot = picked && slots.includes(picked.slot) ? picked.slot : (slots[0] ?? "");
  const defaultBay = picked && bays.some((b) => b.id === picked.bayId) ? picked.bayId : (bays[0]?.id ?? "");
  const wantHour = picked ? toHourStart(picked.slot) : "";
  const defaultTrialSlot = trialSlots.includes(wantHour) ? wantHour : (trialSlots[0] ?? "");
  const pickedBayName = bays.find((b) => b.id === defaultBay)?.name ?? "";

  const tabCls = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors ${
      active ? "bg-accent text-white" : "text-(--color-dim) hover:bg-(--color-panel-2)"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (!cardRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-(--color-line) bg-(--color-panel) p-4 shadow-2xl sm:rounded-2xl sm:p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">予約を入れる</h2>
            <p className="mt-0.5 text-sm text-(--color-dim) tabular-nums">
              {dateLabel}
              {picked ? `　${picked.slot.slice(0, 5)}　${pickedBayName}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-(--color-dim)">
            ×
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl bg-(--color-panel-2) p-1">
          <button type="button" onClick={() => setTab("member")} className={tabCls(tab === "member")}>
            会員・都度利用
          </button>
          <button type="button" onClick={() => setTab("trial")} className={tabCls(tab === "trial")}>
            体験（初めての方）
          </button>
        </div>

        {tab === "member" ? (
          <MemberForm
            date={date}
            bays={bays}
            slots={slots}
            minutesOptions={minutesOptions}
            members={members}
            defaultBay={defaultBay}
            defaultSlot={defaultSlot}
            onDone={onClose}
          />
        ) : (
          <TrialForm date={date} trialSlots={trialSlots} defaultSlot={defaultTrialSlot} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

/** 送信結果の表示（成功したら親を閉じる） */
function Result({ state, onDone }: { state: BookingFormState; onDone: () => void }) {
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  if (!state.error) return null;
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
  );
}

// ------------------------------------------------------------------
// 会員・都度利用
// ------------------------------------------------------------------

function MemberForm({
  date,
  bays,
  slots,
  minutesOptions,
  members,
  defaultBay,
  defaultSlot,
  onDone,
}: {
  date: string;
  bays: SheetBay[];
  slots: string[];
  minutesOptions: number[];
  members: PickerMember[];
  defaultBay: string;
  defaultSlot: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createBooking, {} as BookingFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="booking_date" value={date} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className={labelCls}>打席</span>
          <select name="bay_id" defaultValue={defaultBay} className={inputCls}>
            {bays.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className={labelCls}>開始時刻</span>
          <select name="start_time" defaultValue={defaultSlot} className={inputCls}>
            {slots.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className={labelCls}>利用時間</span>
          <select name="minutes" defaultValue="60" className={inputCls}>
            {minutesOptions.map((m) => (
              <option key={m} value={m}>{m}分</option>
            ))}
          </select>
        </label>
      </div>

      {/* 会員はお名前でも会員番号でも引ける（#189）。選ぶと自動で「会員」の予約になる。
          区分の選択欄は置かない＝選び忘れて会員が都度利用として登録される事故を無くす */}
      <label className="block text-sm">
        <span className={labelCls}>会員（お名前・カナ・会員番号・電話で検索）</span>
        <div className="mt-1">
          <MemberPicker members={members} inputCls={inputCls.replace("mt-1 ", "")} />
        </div>
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className={labelCls}>お名前（会員でない方）</span>
          <input name="guest_name" placeholder="山田 太郎" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className={labelCls}>電話番号</span>
          <input name="guest_phone" inputMode="tel" placeholder="090-…" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className={labelCls}>料金（請求額）</span>
          <input name="amount" inputMode="numeric" placeholder="0" className={inputCls} />
        </label>
      </div>

      <Result state={state} onDone={onDone} />

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className={btnGhostCls}>やめる</button>
        <button disabled={pending} className={btnCls}>{pending ? "登録中…" : "＋ 予約を登録"}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------
// 体験（初めての方）
// ------------------------------------------------------------------

function TrialForm({
  date,
  trialSlots,
  defaultSlot,
  onDone,
}: {
  date: string;
  trialSlots: string[];
  defaultSlot: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createTrialByStaff, {} as BookingFormState);

  if (trialSlots.length === 0) {
    return (
      <p className="rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-4 text-sm text-(--color-dim)">
        この日は体験をお受けできる時間がありません（体験は毎時00分スタート・約55分です）。
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="booking_date" value={date} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className={labelCls}>開始時刻（毎時00分・約55分）</span>
          <select name="start_time" defaultValue={defaultSlot} className={inputCls}>
            {trialSlots.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="block text-sm">
          <span className={labelCls}>打席</span>
          <p className="mt-1 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-dim)">
            空いている打席に自動で割り当てます
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NameFields inputClassName={inputCls} labelClassName={labelCls} />
      </div>

      <BirthDateInput inputClassName={inputCls} labelClassName={labelCls} label="生年月日（必須）" />

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className={labelCls}>電話番号</span>
          <input name="guest_phone" inputMode="tel" placeholder="090-…" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className={labelCls}>メールアドレス（あれば）</span>
          <input name="email" type="email" inputMode="email" placeholder="example@…" className={inputCls} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className={labelCls}>ゴルフ経験</span>
          <select name="experience" defaultValue="" className={inputCls}>
            <option value="">選択してください</option>
            {TRIAL_EXPERIENCE.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className={labelCls}>ご要望・メモ</span>
          <input name="message" placeholder="クラブを借りたい など" className={inputCls} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-(--color-txt)">
        <input type="checkbox" name="lefty" value="1" className="h-4 w-4" />
        レフティ（左打ち）— 左右打席をお取りします
      </label>

      {/* 電話で受けたときは口頭で確認する。チェックが無いと登録できない（Web申込と同じ扱い） */}
      <label className="flex items-start gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-dim)">
        <input type="checkbox" name="consent_privacy" value="1" className="mt-0.5 h-4 w-4" />
        <span>個人情報の取扱いについて、お客様にご説明のうえ同意をいただきました</span>
      </label>

      <Result state={state} onDone={onDone} />

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className={btnGhostCls}>やめる</button>
        <button disabled={pending} className={btnCls}>{pending ? "登録中…" : "＋ 体験を確定する"}</button>
      </div>
    </form>
  );
}
