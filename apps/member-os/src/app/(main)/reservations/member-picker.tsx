"use client";

import { useMemo, useRef, useState } from "react";
import { filterMembers, sortMembers, type FrunkMemberLike } from "@/lib/frunk-member-search";
import { memberDisplayName } from "@yozan/core/frank-corporate";

/**
 * 予約作成の会員指定（#189）
 *
 * これまでは「会員番号（会員時）」の入力欄だけで、**会員番号を覚えていないと予約が取れなかった**。
 * 電話で「山田です」と言われたら、別タブで会員管理を開いて番号を調べて戻る、という運用になっていた
 * （2026-09-01 ユーザー指摘）。
 *
 * 決めたこと:
 * - **当たり判定は増やさない** — /frunk（会員管理）と同じ `frunk-member-search`（純関数・テスト済み）を使う。
 *   ここで独自に ilike を書くと「会員管理では出るのに予約では出ない」が起きる。
 *   氏名・カナ（ひらがな⇔カタカナ）・会員番号・電話・メールのどれでも当たる。
 * - **候補はサーバーから全部もらって画面で絞る** — 電話を受けながら打つ速さに、問い合わせが追いつかない。
 * - **選んだ人は id で送る**（表示名ではなく `member_id`）。同姓同名でも取り違えない。
 *   サーバー側でも会社・店舗を確かめ直す（画面の値を信じない）。
 * - 会員を選ばずに名前だけ入れた予約は、従来どおり「都度利用」として登録される。
 */

export type PickerMember = FrunkMemberLike & { id: string; name?: string | null; company_name?: string | null };

export function MemberPicker({ members, inputCls }: { members: PickerMember[]; inputCls: string }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PickerMember | null>(null);
  const [openList, setOpenList] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hits = useMemo(() => {
    if (q.trim() === "") return [];
    return sortMembers(filterMembers(members, { q, status: "all" }), "member_no").slice(0, 8);
  }, [members, q]);

  const label = (m: PickerMember) =>
    `${memberDisplayName(m as never) || (m.name ?? "")}${m.member_no ? `（${m.member_no}）` : ""}${m.status === "suspended" ? " ・休会中" : ""}`;

  if (picked) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name="member_id" value={picked.id} />
        <span className="flex-1 truncate rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm font-semibold">
          {label(picked)}
        </span>
        <button
          type="button"
          onClick={() => {
            setPicked(null);
            setQ("");
          }}
          className="rounded-lg border border-(--color-line) px-2.5 py-2 text-xs text-(--color-dim)"
        >
          変更
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpenList(true);
        }}
        onFocus={() => setOpenList(true)}
        // 候補をクリックする前に blur が走るので、少し待ってから閉じる
        onBlur={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => setOpenList(false), 150);
        }}
        placeholder="山田 / やまだ / FR0001 / 090-…"
        autoComplete="off"
        className={inputCls}
      />
      {openList && q.trim() !== "" && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-(--color-line) bg-white shadow-lg">
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-xs text-(--color-dim)">
              該当する会員がいません（都度利用ならお名前欄にご記入ください）
            </li>
          ) : (
            hits.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPicked(m);
                    setOpenList(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-(--color-panel-2)"
                >
                  <span className="font-medium">{memberDisplayName(m as never) || m.name}</span>
                  <span className="ml-2 text-xs text-(--color-dim)">
                    {[m.member_no, m.name_kana, m.phone].filter(Boolean).join("　")}
                    {m.status === "suspended" ? "　休会中" : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
