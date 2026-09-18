"use client";

import { useEffect, useRef, useState } from "react";
import { findGuests, type GuestHit } from "@/app/actions";
import { inputCls, labelCls } from "@/components/ui";

/**
 * お客様をお名前で選ぶ。
 *
 * 2026-09-14 作り直した理由（ユーザー報告「試打表紙が作れない」）：
 *   前の版は「探す」ボタンで検索 → 一覧から押す → 隠し欄に名前が入る、という3手順だった。
 *   検索欄に打っただけで「表紙をつくる」を押すと、隠し欄が空のまま送られ、
 *   サーバー側は名前が無いので何もせず戻していた（エラーも出ない）。
 *
 * 今の形：
 *   ・欄は1つ。打った文字がそのまま customer_name として送られる（選ばなくても作れる）
 *   ・打っている途中から候補が出る。押せば台帳の表記に揃い、guest_id と会員区分が入る
 *   ・受付台帳は受付1回ごとの行なので、同じ方が並ばないよう DB 側で束ねた「人」を出す
 *   ・電話は下4桁だけ出す（店頭で他の方の番号を出さない）
 *   ・2026-09-18: 会員名簿（member-os の mbr_members）にだけ居る会員も候補に出す。
 *     受付台帳から選んだ方は、ご連絡先が空ならサーバー側で台帳のお電話を入れる
 */
export function GuestPicker() {
  const [name, setName] = useState("");
  const [guestId, setGuestId] = useState("");
  const [hits, setHits] = useState<GuestHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      findGuests(name)
        .then((r) => { if (mine === seq.current) setHits(r); })
        .finally(() => { if (mine === seq.current) setLoading(false); });
    }, name ? 250 : 0);
    return () => clearTimeout(t);
  }, [name, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  function pick(h: GuestHit) {
    setName(h.name);
    setGuestId(h.guestId);
    setOpen(false);
    // 同じフォームの「お客様区分」も合わせる（在籍会員なら会員、それ以外はビジター）。あとから手で変えられる
    const kind = input.current?.form?.elements.namedItem("member_kind");
    if (kind instanceof HTMLSelectElement) kind.value = h.isMember ? "会員" : "ビジター";
  }

  return (
    <div ref={box} className="relative">
      <input type="hidden" name="guest_id" value={guestId} />
      <span className={labelCls}>お客様（お名前・フリガナ・お電話の下4桁で探せます）</span>
      <input
        ref={input}
        name="customer_name"
        value={name}
        onChange={(e) => { setName(e.target.value); setGuestId(""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // Enter で送信せず、いちばん上の候補を採る（候補が無ければ打った名前のまま）
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (hits[0]) pick(hits[0]); else setOpen(false);
          }
        }}
        placeholder="例: 山田 / やまだ / 1234"
        autoComplete="off"
        className={inputCls}
        required
      />
      {guestId ? (
        <p className="mt-1 text-xs text-(--color-dim)">受付台帳から選びました（ご連絡先が空なら台帳のお電話が入ります）</p>
      ) : name ? (
        <p className="mt-1 text-xs text-(--color-dim)">このお名前のまま作れます（台帳にあれば下から選ぶと表記が揃います）</p>
      ) : null}

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-(--color-line) bg-(--color-panel) shadow-xl">
          <ul className="max-h-64 overflow-y-auto">
            {hits.map((h) => (
              <li key={h.guestId || `m-${h.memberNo ?? h.name}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(h)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--color-panel-2)"
                >
                  <span className="font-medium">{h.name}</span>
                  {h.isMember && (
                    <span className="rounded bg-(--color-gold) px-1 text-[10px] font-bold text-black">会員</span>
                  )}
                  {h.nameKana && <span className="truncate text-xs text-(--color-dim)">{h.nameKana}</span>}
                  {!h.guestId && h.memberNo && (
                    <span className="shrink-0 text-[10px] text-(--color-dim)">会員名簿 No.{h.memberNo}</span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-(--color-dim)">
                    {h.phoneLast4 ? `…${h.phoneLast4}` : ""}
                    {h.visits > 1 ? `　受付${h.visits}回` : ""}
                  </span>
                </button>
              </li>
            ))}
            {!loading && hits.length === 0 && (
              <li className="px-3 py-3 text-xs text-(--color-dim)">
                台帳に見当たりません。このお名前のまま作れます。
              </li>
            )}
            {loading && hits.length === 0 && (
              <li className="px-3 py-3 text-xs text-(--color-dim)">探しています…</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
