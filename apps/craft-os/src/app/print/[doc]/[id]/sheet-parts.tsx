import { yenPlain } from "@/lib/format";

/**
 * 紙の帳票そのもの。00_雛形1.xlsm / 01_試打シャフト表紙.xlsm の
 * セル・結合・罫線・列幅をそのまま写したパーツ。
 *
 * ★ 列幅は Excel の実測値（文字幅）をそのまま比率にしてある。数字を勝手に丸めない。
 * ★ 文字は メイリオ。Excelがそれで組まれているので、同じ字面・同じ改行位置になる。
 * ★ 罫線は Excel の TBLR をそのまま。表の外周だけ太い、という描き方はしていない。
 */

/** 見積書・注文書の20列（A〜T）。Excelの列幅そのまま */
export const QUOTE_COLS = [
  { key: "A", w: 7.125 },
  { key: "B", w: 5.625 },
  { key: "CtoG", w: 8.38 * 4 + 17.625 },
  { key: "HtoI", w: 5.625 + 14.125 },
  { key: "JtoL", w: 4.125 + 8.38 * 2 },
  { key: "MtoO", w: 8.38 * 3 },
  { key: "PtoQ", w: 4.625 + 8.38 },
  { key: "RtoT", w: 4.125 + 8.38 * 2 },
];

/** 表紙（A4横）の列。A〜N */
export const COVER_COLS = [
  { key: "A", w: 1.5546875 },
  { key: "B", w: 5.5546875 },
  { key: "C", w: 11.0 },
  { key: "DtoG", w: 8.38 * 3 + 13.21875 },
  { key: "HtoI", w: 10.6640625 + 13.0 },
  { key: "J", w: 13.77734375 },
  { key: "KtoM", w: 6.0 + 7.6640625 + 7.0 },
  { key: "N", w: 1.6640625 },
];

export function ColGroup({ cols }: { cols: { key: string; w: number }[] }) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  return (
    <colgroup>
      {cols.map((c) => (
        <col key={c.key} style={{ width: `${(c.w / total) * 100}%` }} />
      ))}
    </colgroup>
  );
}

/** Excelの罫線をそのまま。t/b/l/r を指定した辺だけ引く */
export function bd(spec: string) {
  const has = (ch: string) => spec.includes(ch);
  return {
    borderTop: has("t") ? "1px solid #000" : undefined,
    borderBottom: has("b") ? "1px solid #000" : undefined,
    borderLeft: has("l") ? "1px solid #000" : undefined,
    borderRight: has("r") ? "1px solid #000" : undefined,
  } as const;
}

/** 会社の連絡先。Excelでは M10:M12（ロゴは M4 あたりに貼ってある画像） */
export const LETTERHEAD = {
  zip: "〒665-0882",
  address: "兵庫県宝塚市山本南１－２６－２５",
  tel: "TEL／FAX　：　0797-82-0833",
  bank: "三菱UFJ銀行　信濃橋支店　（普通）0235311",
  bankName: "口座名義　株式会社ファイン",
};

export function Letterhead({ staffName }: { staffName: string }) {
  return (
    <div className="text-[11px] leading-[1.9]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/golfwing-logo.png" alt="GOLF WING" className="mb-1 h-[42px] w-auto" />
      <div>{LETTERHEAD.zip}</div>
      <div>{LETTERHEAD.address}</div>
      <div>{LETTERHEAD.tel}</div>
      <div className="mt-1">担当：{staffName}</div>
    </div>
  );
}

/** 金額セル。Excelの書式は ¥#,##0 で、0や空は空欄のまま */
export function Money({ v }: { v: number | null | undefined }) {
  if (v == null || v === 0) return <>{""}</>;
  return <>{yenPlain(v)}</>;
}
