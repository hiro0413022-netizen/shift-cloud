"use client";

import { useState } from "react";

/**
 * 架電台本（DECISIONS #59）。
 * 予約確定は「スタッフがお客様へ折り返し電話」で行う運用。
 * 申込ごとに、この画面でそのまま読み上げられる台本を組み立てて表示する
 * （＝台本の見せ方＝スタッフが対応する申込詳細画面にそのまま出す）。
 */
export function CallScript({
  seq,
  name,
  nameKana,
  menu,
  phone,
  prefs,
}: {
  seq: string;
  name: string;
  nameKana: string | null;
  menu: string;
  phone: string | null;
  prefs: string[];
}) {
  const [open, setOpen] = useState(true);

  const lines: string[] = [
    "① 名乗る・本人確認",
    `「お世話になっております。GOLF WING（ゴルフウィング）でございます。`,
    `${name} 様のお電話でお間違いないでしょうか？」`,
    "",
    "② 申込のお礼と用件",
    `「先ほどは ${menu} のご予約をお申し込みいただき、ありがとうございます。`,
    "ご希望日時の確認と、ご予約の確定でお電話いたしました。今、お時間よろしいでしょうか？」",
    "",
    "③ 希望日時をこちらから読み上げて確認",
    ...(prefs.length
      ? prefs.map((p, i) => `「第${i + 1}希望が ${p} ですね。」`)
      : ["（希望日時の記載がありません。ご都合のよい日時をお伺いしてください）"]),
    "→ 空き状況と照らして、確定できる日時を1つに決める。",
    "（3つとも埋まっている場合）「あいにくご希望のお日にちが埋まっておりまして、◯月◯日◯時はいかがでしょうか？」",
    "",
    "④ 確定内容の復唱",
    "「それでは、下記の内容で確定いたします。",
    `　・お名前：${name} 様`,
    `　・メニュー：${menu}`,
    "　・日時：◯月◯日（◯）◯◯時◯◯分",
    "　・場所：GOLF WING 宝塚　当日は受付でお名前をお伝えください。」",
    "",
    "⑤ ご案内・締め",
    "「当日は、普段お使いのクラブ（お持ちであれば）とゴルフグローブをお持ちください。手ぶらでも大丈夫です。",
    "ご不明点やご都合の変更がございましたら、このお電話番号までご連絡ください。",
    "本日はありがとうございました。当日お待ちしております。」",
    "",
    "⑥ 電話のあと（システム操作）",
    "・下の「予約を確定する」で、決まった日時を選んで確定する",
    "・つながらなかった場合：社内メモに「不在・再架電」と残す（ステータスはそのまま）",
  ];

  const scriptText = lines.join("\n");

  return (
    <div className="hud rounded-2xl border border-(--color-accent)/40 bg-(--color-panel) p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-(--color-accent)">📞 折り返し電話の台本</h2>
        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(scriptText)}
            className="rounded-lg border border-(--color-line) bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-(--color-panel-2)"
          >
            台本をコピー
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-(--color-line) bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-(--color-panel-2)"
          >
            {open ? "閉じる" : "開く"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-(--color-panel-2) px-4 py-3 text-sm">
        <span className="text-(--color-dim)">お電話先</span>
        {phone ? (
          <a href={`tel:${phone}`} className="text-lg font-bold text-(--color-accent)">☎ {phone}</a>
        ) : (
          <span className="font-medium">電話番号の記載なし</span>
        )}
        <span className="text-(--color-dim)">／ {seq}・{nameKana ? `${nameKana}／` : ""}{menu}</span>
      </div>

      {open && (
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-4 text-[13px] leading-relaxed text-(--color-txt) ring-1 ring-(--color-line)">
          {scriptText}
        </pre>
      )}
    </div>
  );
}
