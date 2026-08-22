import Link from "next/link";

/**
 * 月の切り替え帯（#144b）
 *
 * 派遣台帳もシフトカレンダーも「表示中の1か月」しか出さない。月がずれているだけなのに
 * 「過去の分が消えた」「登録したのに出ない」と見えるのが実際に起きた（2026-08-22 小川さん報告）ので、
 * どの月に何件あるかを常に見せて、1タップで移動できるようにする。
 */
export function MonthNav({
  base,
  ym,
  counts,
}: {
  /** 遷移先のパス（例: "/dispatches" / "/calendar"） */
  base: string;
  /** 表示中の年月 YYYY-MM */
  ym: string;
  /** 月ごとの件数（新しい順） */
  counts: Array<{ ym: string; count: number }>;
}) {
  if (counts.length === 0) return null;
  const shown = counts.slice(0, 14);
  const current = counts.find((c) => c.ym === ym);
  const latest = counts[0];

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-(--color-dim)">登録のある月:</span>
        {shown.map((c) => (
          <Link
            key={c.ym}
            href={`${base}?ym=${c.ym}`}
            className={`rounded border px-2 py-0.5 text-xs tabular-nums ${
              c.ym === ym
                ? "border-(--color-accent) bg-(--color-accent) font-medium text-white"
                : "border-(--color-line) bg-white text-(--color-dim) hover:text-(--color-txt)"
            }`}
          >
            {c.ym.replace("-", "/")}
            <span className="ml-1 opacity-80">{c.count}</span>
          </Link>
        ))}
        {counts.length > shown.length ? (
          <span className="text-xs text-(--color-dim)">ほか{counts.length - shown.length}か月</span>
        ) : null}
      </div>
      {!current ? (
        <p className="text-xs text-amber-700">
          {ym.replace("-", "/")} の派遣は0件です（消えたわけではありません）。直近で登録があるのは{" "}
          <Link href={`${base}?ym=${latest.ym}`} className="font-medium underline">
            {latest.ym.replace("-", "/")}（{latest.count}件）
          </Link>
          です。
        </p>
      ) : null}
    </div>
  );
}
