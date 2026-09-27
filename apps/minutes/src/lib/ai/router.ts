import "server-only";
import { providerFor, type Level } from "../levels";
import { geminiJson, geminiTranscribe } from "./gemini";
import { localJson, localTranscribe } from "./local";

/**
 * AIの切り替え口（議事録システムでAIを呼ぶ場所はここだけ）
 *
 * 画面やAPIは「この会議のレベル」を渡すだけで、どのAIに行くかを知らない。
 * 行き先は levels.ts の providerFor が決める（L3 は YOZANサーバー以外に行かない・テストで固定）。
 * フェーズ3でサーバーを足すときは、ここに手を入れずに環境変数を足すだけで済む。
 */
export type Ai = {
  name: "gemini" | "local";
  transcribe(audio: ArrayBuffer, mime: string, opts: { participants?: string; prevTail?: string; segmentLabel?: string }): Promise<{ text: string; truncated: boolean }>;
  json(system: string, user: string, maxTokens?: number): Promise<unknown>;
};

export function aiFor(level: Level): Ai {
  const kind = providerFor(level, process.env);
  if (kind === "local") {
    return { name: "local", transcribe: (a, m) => localTranscribe(a, m), json: localJson };
  }
  return { name: "gemini", transcribe: geminiTranscribe, json: geminiJson };
}
