import type { CSSProperties } from "react";
import type { FullQuote } from "@/lib/craft";
import { jpDate, LETTERHEAD } from "@/components/paper";

// ---------------------------------------------------------------------------
// お礼状（A4縦・#262）— 組立データ記入後にお渡しする「ご購入ありがとうございました」の手紙＋クラブデータ
// ---------------------------------------------------------------------------

export function ThanksLetter({ full }: { full: Pick<FullQuote, "quote" | "work" | "specs" | "items"> }) {
  const { quote: q, work, specs, items } = full;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const dateYmd = work?.delivered_on ?? work?.assembled_on ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const v = (x: unknown, unit = "") => (x == null || x === "" ? "—" : `${x}${unit}`);
  const clubs = specs.map((s) => {
    const it = s.quote_item_id ? itemById.get(s.quote_item_id) : undefined;
    return {
      id: s.id,
      kind: it?.club_type ?? "",
      head: s.head_name ?? "",
      shaft: it ? `${it.manufacturer ? `${it.manufacturer} ` : ""}${it.product_name}${it.spec ? ` ${it.spec}` : ""}` : "",
      loft: s.actual_loft,
      lie: s.actual_lie,
      length: s.actual_length,
      weight: s.actual_weight,
      balance: s.actual_balance,
      cpm: s.actual_cpm,
      grip: s.grip_name ?? "",
    };
  });
  const th: CSSProperties = { border: "1px solid #000", background: "#DAEEF3", padding: "4px 3px", fontWeight: 700, fontSize: "8pt", whiteSpace: "nowrap" };
  const td: CSSProperties = { border: "1px solid #000", padding: "5px 5px", fontSize: "9pt", verticalAlign: "top" };

  return (
    <div className="text-[10.5pt] leading-[1.9]">
      <div className="flex items-start justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/golfwing-logo.png" alt="GOLF WING BIG DISTANCE" className="h-[64px] w-auto" />
        <div className="pt-2 text-right text-[10pt]">{jpDate(dateYmd)}</div>
      </div>
      <div className="mt-2 h-[4px]" style={{ background: "#E3852E" }} />

      <div className="mt-8 flex items-end gap-2">
        <span className="min-w-[12em] border-b border-black pb-0.5 text-[16pt] font-bold">{q.customer_name}</span>
        <span className="text-[13pt]">様</span>
      </div>

      <h1 className="mt-8 text-center text-[16pt] font-bold tracking-[0.12em]">ご購入いただき、誠にありがとうございます</h1>

      <div className="mt-6 space-y-3 px-2">
        <p>
          このたびは GOLF WING にてクラブをお仕立ていただき、誠にありがとうございました。
          フィッティングの結果をもとに、お客様のスイングに合わせて一本一本組み上げ、仕上がりを計測いたしました。
        </p>
        <p>
          下記に組み上がりのデータを記載しております。今後のクラブ選びや、調整・メンテナンスの際の記録としてお役立てください。
          新しいクラブとともに、ゴルフがより一層楽しいものになりますよう、スタッフ一同心より願っております。
        </p>
        {work?.thanks_note ? <p className="whitespace-pre-wrap">{work.thanks_note}</p> : null}
      </div>

      <h2 className="mt-8 mb-2 text-[11pt] font-bold">クラブデータ</h2>
      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th style={th}>種類</th>
            <th style={th}>ヘッド</th>
            <th style={th}>シャフト</th>
            <th style={th}>ロフト／ライ</th>
            <th style={th}>長さ</th>
            <th style={th}>総重量</th>
            <th style={th}>バランス</th>
            <th style={th}>振動数</th>
            <th style={th}>グリップ</th>
          </tr>
        </thead>
        <tbody>
          {clubs.length === 0 ? (
            <tr>
              <td style={{ ...td, textAlign: "center" }} colSpan={9}>
                —
              </td>
            </tr>
          ) : (
            clubs.map((c) => (
              <tr key={c.id}>
                <td style={{ ...td, textAlign: "center" }}>{c.kind}</td>
                <td style={td}>{c.head}</td>
                <td style={td}>{c.shaft}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  {c.loft == null && c.lie == null ? "—" : `${v(c.loft, "°")}／${v(c.lie, "°")}`}
                </td>
                <td style={{ ...td, textAlign: "center" }}>{v(c.length, "inch")}</td>
                <td style={{ ...td, textAlign: "center" }}>{v(c.weight, "g")}</td>
                <td style={{ ...td, textAlign: "center" }}>{v(c.balance)}</td>
                <td style={{ ...td, textAlign: "center" }}>{v(c.cpm, "cpm")}</td>
                <td style={td}>{c.grip}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-8 rounded border border-black p-3 text-[9.5pt] leading-[1.8]">
        <p className="font-bold">アフターサービスのご案内</p>
        <ul className="mt-1 list-disc pl-5">
          <li>長さ・重さ・グリップの調整、スリーブのポジション変更などはお気軽にご相談ください。</li>
          <li>グリップは使用頻度に応じて1年を目安に交換をおすすめしております。</li>
          <li>次回のクラブ選びの際は、このデータをお持ちいただくとスムーズにご提案できます。</li>
        </ul>
      </div>

      <div className="mt-10 flex items-end justify-between text-[10pt]">
        <div className="leading-[1.7]">
          <div className="font-bold">ゴルフウイング 宝塚店</div>
          <div>{LETTERHEAD.zip}　{LETTERHEAD.address}</div>
          <div>{LETTERHEAD.tel}</div>
          <div>https://www.golfwing.jp</div>
        </div>
        <div className="text-right leading-[1.9]">
          {q.staff_name ? <div>担当　{q.staff_name}</div> : null}
          {work?.assembled_by_name ? <div>組立　{work.assembled_by_name}</div> : null}
        </div>
      </div>
    </div>
  );
}
