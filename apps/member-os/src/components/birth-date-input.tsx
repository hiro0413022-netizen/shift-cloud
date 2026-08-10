"use client";

import { useMemo, useState } from "react";

/**
 * 生年月日の入力（年・月・日の3つのプルダウン）。
 * iPad/iOS の <input type="date"> はホイールUIで「日」が合わせにくいため、
 * タップだけで確実に選べる3分割に置き換える。値は hidden で YYYY-MM-DD として送る。
 */
export function BirthDateInput({
  name = "birth_date",
  defaultValue,
  inputClassName,
  labelClassName,
  label = "生年月日",
  minYear,
  maxYear,
  className = "",
}: {
  name?: string;
  defaultValue?: string | null;
  inputClassName: string;
  labelClassName: string;
  label?: string;
  minYear?: number;
  maxYear?: number;
  className?: string;
}) {
  const thisYear = new Date().getFullYear();
  const from = minYear ?? thisYear - 100;
  const to = maxYear ?? thisYear;

  const init = /^\d{4}-\d{2}-\d{2}$/.test(defaultValue ?? "") ? (defaultValue as string).split("-") : null;
  const [year, setYear] = useState(init ? String(Number(init[0])) : "");
  const [month, setMonth] = useState(init ? String(Number(init[1])) : "");
  const [day, setDay] = useState(init ? String(Number(init[2])) : "");

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = to; y >= from; y--) arr.push(y);
    return arr;
  }, [from, to]);

  const daysInMonth = useMemo(() => {
    const y = Number(year) || 2000; // 未選択時は閏年扱いで29日まで出す
    const m = Number(month);
    if (!m) return 31;
    return new Date(y, m, 0).getDate();
  }, [year, month]);

  // 月を変えて日が範囲外になったら詰める（3/31 → 2月 など）
  const safeDay = Number(day) > daysInMonth ? "" : day;
  const value = year && month && safeDay
    ? `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(safeDay)).padStart(2, "0")}`
    : "";

  const sel = `${inputClassName} appearance-none`;

  return (
    <div className={`block text-sm ${className}`}>
      <span className={labelClassName}>{label}</span>
      <div className="grid grid-cols-3 gap-2">
        <div className="relative">
          <select aria-label="年" className={sel} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">年</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <select aria-label="月" className={sel} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">月</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <select aria-label="日" className={sel} value={safeDay} onChange={(e) => setDay(e.target.value)}>
            <option value="">日</option>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
