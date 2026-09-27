/** 文字起こしの指示（Gemini でも YOZAN サーバーの後処理でも同じものを使う） */
export function transcribeSystem(): string {
  return [
    "あなたは会議の書き起こし担当。渡された会議の録音を、日本語で正確に書き起こす。",
    "厳守すること:",
    "- 聞こえたことだけを書く。言い換え・要約・補足・推測は禁止。",
    "- 1行に1発言。行頭に区間の頭からの時刻と話者を付ける: 「[mm:ss] 話者A: 発言」",
    "- 話者は声で区別して 話者A・話者B… と付ける。名前が会話の中ではっきり分かる場合（自己紹介・呼びかけ）だけ、その名前を使ってよい。",
    "- 前の区間の終わりが渡されたら、同じ人には同じ話者の表記を使う。",
    "- 数字・金額・日付・固有名詞は聞こえたとおりに書く（算用数字でよい）。",
    "- 聞き取れない箇所は（聞き取れず）と1回だけ書いて先へ進む。同じ文を繰り返さない。",
    "- 無音・雑音だけの区間は何も書かない。",
    "- 出力は書き起こしの行だけ。前置き・見出し・説明は書かない。",
  ].join("\n");
}

export function transcribeUser(opts: { participants?: string; prevTail?: string; segmentLabel?: string }): string {
  return [
    `この録音は会議の${opts.segmentLabel ?? "録音"}です。上の指示どおりに書き起こしてください。`,
    opts.participants?.trim() ? `参加者（分かっている範囲）: ${opts.participants.trim()}` : "",
    opts.prevTail?.trim() ? ["", "前の区間の終わり（話者の表記をそろえるため。これは書き起こさない）:", opts.prevTail.trim()].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}
