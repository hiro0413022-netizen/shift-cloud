/**
 * ナレッジ候補の判定（純関数・DBにもAIにも触らない / 2026-09-03）
 *
 * 設計の芯は docs/modules/swing-cortex/VOICE_NOTE.md:
 *   音声メモから出てきた「知識になりそうな断片」を、
 *   **AIの自己採点ではなく回数で** ふるいにかける。
 *
 *   AIに「完成度が高いものだけ採用して」と言うと、自分の答案を自分で採点することになる。
 *   2026-08-28 の自律進化の検証で、進化したエージェントが減点していたログのほうを
 *   消して満点を取った実例を確認している。だから門は **AIが操作できない外側の事実**にする。
 *
 *   「別の日に3回以上、同じ趣旨で出た」＝この店で本当に繰り返し使われている言葉。
 *
 * 寄せ先の判定も AI ではなく jp-search のあいまい一致でやる。
 * AIに既存IDを選ばせると、無いIDを作って返してくる事故が起きうる（lesson-note-ai の教訓）。
 */

import { normalize, similarity, bestSimilarity } from "./jp-search.ts";

/** 昇格に必要な回数。これ未満は溜まるだけで画面に出ない */
export const PROMOTE_HITS = 3;
/** 症状に寄せられたとみなす下限。これを下回ったら「新しい症状」の候補にする */
export const SYMPTOM_MATCH_MIN = 0.42;
/** 既存の確認項目そのものだとみなす下限。下回ったら同じ症状の下に新しい確認項目を提案する */
export const CHECKPOINT_MATCH_MIN = 0.5;

/** AIが音声から拾ってきた「知識になりそうな断片」 */
export type RawCandidate = {
  /** 見出し（確認項目の言い方。例:「前傾キープで三角形同調」） */
  title: string;
  cause: string;
  fix: string;
  drill?: string | null;
  client?: string | null;
  /** そう判断した根拠になった会話の一節（原文） */
  quote?: string | null;
};

export type SymptomLite = { id: string; name: string; tags: string[] };
export type CheckpointLite = { id: string; symptomId: string; title: string };

export type PlacedCandidate = {
  kind: "append" | "new_symptom";
  symptomId: string | null;
  checkpointId: string | null;
  digest: string;
  title: string;
  proposed: { name?: string; title: string; cause: string; fix: string; drill: string | null; client: string | null };
  quote: string | null;
};

/**
 * 趣旨の指紋。
 * 同じことを違う言い回しで言っていても1行にまとめたいので、
 * 「寄せ先 ＋ 見出しと対処の正規化」で作る。表記ゆれ（かな/漢字/送り仮名）は normalize が吸収する。
 */
export function makeDigest(input: {
  kind: "append" | "new_symptom";
  symptomId: string | null;
  checkpointId: string | null;
  title: string;
  fix: string;
}): string {
  const head = input.checkpointId ?? input.symptomId ?? "new";
  // 見出しと対処の頭は、同じ趣旨なら似た語になる。長すぎると別物扱いになるので頭だけ使う
  const body = normalize(`${input.title} ${input.fix}`).slice(0, 24);
  return `${input.kind}:${head}:${body}`;
}

/** 候補1件を、既存の症状・確認項目のどこに置くか決める（AIには決めさせない） */
export function placeCandidate(
  c: RawCandidate,
  symptoms: SymptomLite[],
  checkpoints: CheckpointLite[]
): PlacedCandidate | null {
  const title = (c.title ?? "").trim();
  const fix = (c.fix ?? "").trim();
  const cause = (c.cause ?? "").trim();
  if (!title || !fix) return null;

  const probe = `${title} ${cause}`;

  // 1) いちばん近い症状を探す（症状名とタグの両方を見る）
  let bestSym: SymptomLite | null = null;
  let bestScore = 0;
  for (const s of symptoms) {
    const score = Math.max(similarity(probe, s.name), bestSimilarity(probe, s.tags) * 0.9);
    if (score > bestScore) {
      bestScore = score;
      bestSym = s;
    }
  }

  const proposed = {
    title,
    cause,
    fix,
    drill: (c.drill ?? "").trim() || null,
    client: (c.client ?? "").trim() || null,
  };
  const quote = (c.quote ?? "").trim() || null;

  // 2) どの症状にも寄せられない＝新しい症状の候補（いちばん慎重に扱うもの）
  if (!bestSym || bestScore < SYMPTOM_MATCH_MIN) {
    return {
      kind: "new_symptom",
      symptomId: null,
      checkpointId: null,
      digest: makeDigest({ kind: "new_symptom", symptomId: null, checkpointId: null, title, fix }),
      title,
      proposed: { name: title, ...proposed },
      quote,
    };
  }

  // 3) その症状の中に、同じ確認項目がすでにあるか
  // （let のままだとコールバックの中で null 判定が効かないので const に受け直す）
  const sym = bestSym;
  const mine = checkpoints.filter((cp) => cp.symptomId === sym.id);
  let bestCp: CheckpointLite | null = null;
  let cpScore = 0;
  for (const cp of mine) {
    const score = similarity(title, cp.title);
    if (score > cpScore) {
      cpScore = score;
      bestCp = cp;
    }
  }
  const checkpointId = bestCp && cpScore >= CHECKPOINT_MATCH_MIN ? bestCp.id : null;

  return {
    kind: "append",
    symptomId: sym.id,
    checkpointId,
    digest: makeDigest({ kind: "append", symptomId: sym.id, checkpointId, title, fix }),
    title,
    proposed,
    quote,
  };
}

/**
 * 提案キューに上げてよいか。
 * **別々の日に PROMOTE_HITS 回以上**。同じ日に何度言われても1日ぶんとしては数えない
 * （1回のレッスンで同じ話が繰り返されるのは普通なので、それでは門にならない）。
 */
export function shouldQueue(row: { hits: number; firstSeenOn: string; lastSeenOn: string; status: string }): boolean {
  if (row.status !== "collected") return false;
  return row.hits >= PROMOTE_HITS && row.firstSeenOn !== row.lastSeenOn;
}
