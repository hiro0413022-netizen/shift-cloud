"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { searchReturningGuests, submitReception, type ReceptionState } from "./actions";
import { VISIT_TYPES } from "@/lib/walkin";
import {
  field, cardCls,
  VisitTypePicker, SurveyFields, ConsentField, ReceptionDone, ConfirmSheet,
} from "./reception-ui";
import { candidateHint, isSearchable, type ReceptionCandidate } from "@/lib/reception-search-pure";

/**
 * 2回目以降のご来店（DECISIONS #226・ユーザー指示 2026-09-06）。
 *
 * 「常連の方に毎回同じことを書かせるのは申し訳ない」——なので、お名前で引いて
 * 選んでいただくだけにする。前回の氏名・生年月日・住所・電話はサーバー側で
 * guest_id からたどるので、**この画面には最後まで出さない**。
 * 出すのは氏名・カナ・電話の下4桁・前回来店日だけ（ご自身を見分けていただく分）。
 *
 * アンケートは今日の利用区分のぶんを毎回いただく（目的は来店ごとに変わる）。
 * 「何で知りましたか」だけは初回で伺い済みなので出さない。
 */
export function ReturningForm({
  token,
  storeName,
  onBack,
  onNotFound,
}: {
  token: string;
  storeName: string | null;
  onBack: () => void;
  /** 見つからなかった方を「初めてのご来店」の入力へ送る */
  onNotFound: () => void;
}) {
  const [state, action, pending] = useActionState<ReceptionState, FormData>(submitReception, {});
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<ReceptionCandidate[] | null>(null);
  const [picked, setPicked] = useState<ReceptionCandidate | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  const [visitType, setVisitType] = useState("trial");
  const [confirm, setConfirm] = useState<Record<string, string> | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function runSearch() {
    setSearchError(null);
    if (!isSearchable(q)) {
      setCandidates(null);
      return setSearchError("お名前を2文字以上入れてください");
    }
    startSearch(async () => {
      const res = await searchReturningGuests(token, q);
      setCandidates(res.candidates);
      setSearchError(res.error ?? null);
    });
  }

  function openConfirm() {
    setLocalError(null);
    const el = formRef.current;
    if (!el) return;
    const fd = new FormData(el);
    if (fd.get("consent") !== "1") return setLocalError("個人情報の取扱いへの同意が必要です");
    setConfirm({
      お名前: picked?.name ?? "",
      フリガナ: picked?.name_kana ?? "",
      本日のご利用: VISIT_TYPES.find((v) => v.value === fd.get("visit_type"))?.label ?? "",
    });
  }

  if (state.ok) return <ReceptionDone onAgain={() => window.location.reload()} />;

  /* ---------------- ① お名前で探す ---------------- */
  if (!picked) {
    return (
      <div className="space-y-4 pb-10">
        {storeName && (
          <div className="rounded-xl border border-(--color-line) bg-white p-3 text-center text-sm font-medium text-(--color-dim) shadow-sm">
            {storeName}
          </div>
        )}

        <div className={`${cardCls} space-y-3`}>
          <p className="text-sm font-semibold text-(--color-txt)">お名前で探す</p>
          <p className="text-xs text-(--color-dim)">
            姓だけ・フリガナでもかまいません（例: やまだ）。前回いただいたお名前で探します。
          </p>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="山田 / やまだ"
              autoComplete="off"
              className={field}
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching}
              className="shrink-0 rounded-xl bg-accent px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {searching ? "検索中" : "検索"}
            </button>
          </div>
          {searchError && <p className="text-sm text-rose-600">{searchError}</p>}
        </div>

        {candidates !== null && !searchError && (
          <div className={`${cardCls} space-y-2`}>
            {candidates.length === 0 ? (
              <p className="py-2 text-center text-sm text-(--color-dim)">
                そのお名前は見つかりませんでした。
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold text-(--color-txt)">ご本人を選んでください</p>
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPicked(c)}
                    className="w-full rounded-xl border border-(--color-line) bg-white px-4 py-4 text-left transition-colors hover:border-accent hover:bg-accent/5"
                  >
                    <span className="block text-base font-semibold text-(--color-txt)">{c.name} 様</span>
                    {c.name_kana && <span className="block text-xs text-(--color-dim)">{c.name_kana}</span>}
                    <span className="mt-1 block text-xs text-(--color-dim)">{candidateHint(c)}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onNotFound}
          className="w-full rounded-xl border border-(--color-line) bg-white py-4 text-base font-medium text-(--color-txt)"
        >
          見つからない・初めての方はこちら
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-xl py-3 text-sm font-medium text-(--color-dim)"
        >
          ← 最初の画面に戻る
        </button>
      </div>
    );
  }

  /* ---------------- ② 本日のご利用とアンケート ---------------- */
  return (
    <>
      <form ref={formRef} action={action} className="space-y-4 pb-10">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="guest_id" value={picked.id} />

        <div className="rounded-2xl border border-accent bg-accent/5 p-5 shadow-sm">
          <p className="text-xs text-(--color-dim)">いつもありがとうございます</p>
          <p className="mt-1 text-xl font-bold text-(--color-txt)">{picked.name} 様</p>
          {picked.name_kana && <p className="text-xs text-(--color-dim)">{picked.name_kana}</p>}
          <p className="mt-2 text-xs text-(--color-dim)">{candidateHint(picked)}</p>
          <p className="mt-3 text-xs text-(--color-dim)">
            ご住所・お電話などは前回のご登録をそのまま使います。ご変更があればスタッフにお申しつけください。
          </p>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="mt-3 text-xs font-medium text-accent underline"
          >
            別の方を選び直す
          </button>
        </div>

        <VisitTypePicker value={visitType} onChange={setVisitType} />
        <SurveyFields visitType={visitType} askReferral={false} />
        <ConsentField />

        {(localError || state.error) && (
          <p className="text-center text-sm text-rose-600">{localError ?? state.error}</p>
        )}

        <button
          type="button"
          onClick={openConfirm}
          className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90"
        >
          入力内容を確認する
        </button>
      </form>

      {confirm && (
        <ConfirmSheet
          rows={confirm}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onSubmit={() => {
            setConfirm(null);
            formRef.current?.requestSubmit();
          }}
        />
      )}
    </>
  );
}
