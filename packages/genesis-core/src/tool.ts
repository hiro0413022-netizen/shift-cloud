/**
 * Tool Contract（Genesis Core の中核Contract・Final Architecture §3）
 *
 * UI / Agent / Skill / Workflow / MCP / LINE / Voice はすべてこの Contract を通る。
 * Tool は「既存アプリの関数を、権限・リスク・取り消し・検証・イベント・描画の宣言で包んだもの」。
 * 中身（impl）は既存ロジックのラップであって、新しい業務ロジックをここに書かない。
 */
import type { JsonSchema } from "./schema.ts";
import type { GenesisContext } from "./context.ts";

export type Domain = "ops" | "customer" | "finance" | "growth" | "dev";
export const DOMAINS: readonly Domain[] = ["ops", "customer", "finance", "growth", "dev"];

/** Action Risk Level（Final Architecture §7）。5 は「AIは提案と根拠だけ」なので Tool にできない */
export type RiskLevel = 0 | 1 | 2 | 3 | 4;

export type Scope = "company" | "store" | "self";

/** 数字の出どころ（Source of Truth の表示に使う） */
export type SourceRef = { table: string; updatedAt?: string | null; verified?: boolean; note?: string };

/** AI推測とDBの事実を分ける印。Block の meta.kind に乗る */
export type FactKind = "fact" | "calculated" | "inference" | "suggestion";

/** Supabase service_role クライアントの最小形（@supabase/supabase-js に型で縛らない） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminLike = any;

/** ctx.call の戻り。Skill が Step の結果をそのまま Block にできるよう、描画に要る情報も返す */
export type CallResult = {
  status: string;
  output?: unknown;
  error?: string | null;
  executionId?: string | null;
  tool?: string;
  renders?: string | null;
  sources?: SourceRef[];
  kind?: FactKind;
  rowCount?: number | null;
  policy?: { decision: string; reason?: string } | null;
};

export type ToolCtx = {
  admin: AdminLike;
  context: GenesisContext;
  /** 他 Tool を同じ Actor・同じ Policy で呼ぶ（Skill の中で使う）。実装は execute.ts が差し込む */
  call: (ref: string, input: Record<string, unknown>) => Promise<CallResult>;
  /** イベント発行（Event Contract §6）。実装は execute.ts が差し込む */
  emit: (type: string, version: number, payload: Record<string, unknown>, entity?: { kind: string; id: string }) => Promise<void>;
  /** 実行ログに1行添える（デバッグ・根拠） */
  log: (message: string, data?: Record<string, unknown>) => void;
};

export type ToolOutput = {
  /** Tool の出力本体（output schema に従う） */
  data: Record<string, unknown>;
  /** 数字の出どころ。読み Tool は必ず付ける */
  sources?: SourceRef[];
  kind?: FactKind;
  /** 読み Tool の「黙って0件」検知。期待下限を下回ったら Dashboard の Silent Zero に数える */
  rowCount?: number;
};

export type ToolContract<I extends Record<string, unknown> = Record<string, unknown>, O extends Record<string, unknown> = Record<string, unknown>> = {
  name: string; // 'booking.create'（entity.verb・小文字・ドット区切り）
  version: number; // 1 から。互換を壊す変更は version を上げて並存させる
  domain: Domain;
  description: string;
  input: JsonSchema;
  output: JsonSchema;
  /** いずれかを持つ Actor だけ（オーナー manage_company は常に可）。空配列＝ログイン済みなら誰でも */
  permission: string[];
  scope: Scope;
  risk: RiskLevel;
  /** 金額を伴う Tool は返す（Policy の max_amount 判定）。無関係なら省略 */
  amount?: (input: I) => number | null;
  /** 二重実行防止の鍵。同じ鍵の2回目は実行せず前回の出力を返す。null を返すと毎回実行 */
  idempotency: (input: I, ctx: GenesisContext) => string | null;
  rateLimit: { perMinute: number };
  /** risk>=2 は必須。out を受け取り元に戻す */
  undo?: (out: O, ctx: ToolCtx) => Promise<void>;
  /** risk>=2 は必須。「成功した前提」にしない（Final Architecture §1 Action Engine） */
  verify?: (out: O, ctx: ToolCtx) => Promise<boolean>;
  /** 発行するイベント 'reservation.created@1' */
  emits: string[];
  /** 結果を描く Block 名（Block Registry に登録済みであること） */
  renders: string;
  /** 読み Tool の期待下限行数（下回ると silent_zero として記録。省略=判定しない） */
  minRows?: number;
  impl: (input: I, ctx: ToolCtx) => Promise<ToolOutput | O>;
};

export type ToolRef = { name: string; version: number | null };

/** 'booking.create@2' → {name, version}。version 無しは「最新」 */
export function parseToolRef(ref: string): ToolRef {
  const m = /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)(?:@(\d+))?$/.exec(ref.trim());
  if (!m) throw new Error(`Tool 参照の形式が違います: ${ref}（例: booking.create@1）`);
  return { name: m[1], version: m[2] ? Number(m[2]) : null };
}

export function toolKey(name: string, version: number): string {
  return `${name}@${version}`;
}

/** 宣言の静的検証。ここで落ちる Tool は登録できない＝実行時に「積んだが実行されない」を作らない */
export function validateContract(t: ToolContract): string[] {
  const errors: string[] = [];
  try {
    parseToolRef(t.name);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  if (!Number.isInteger(t.version) || t.version < 1) errors.push(`${t.name}: version は 1 以上の整数`);
  if (!DOMAINS.includes(t.domain)) errors.push(`${t.name}: domain が不正 (${t.domain})`);
  if (!t.description?.trim()) errors.push(`${t.name}: description は必須`);
  if (!t.input || t.input.type !== "object") errors.push(`${t.name}: input は object schema`);
  if (!t.output || t.output.type !== "object") errors.push(`${t.name}: output は object schema`);
  if (!Array.isArray(t.permission)) errors.push(`${t.name}: permission は配列`);
  if (!["company", "store", "self"].includes(t.scope)) errors.push(`${t.name}: scope が不正`);
  if (![0, 1, 2, 3, 4].includes(t.risk)) errors.push(`${t.name}: risk は 0〜4（5 は Tool にできない）`);
  if (typeof t.idempotency !== "function") errors.push(`${t.name}: idempotency は必須`);
  if (!t.rateLimit || !(t.rateLimit.perMinute > 0)) errors.push(`${t.name}: rateLimit.perMinute は必須`);
  if (t.risk >= 2 && typeof t.undo !== "function") errors.push(`${t.name}: risk>=2 は undo が必須`);
  if (t.risk >= 2 && typeof t.verify !== "function") errors.push(`${t.name}: risk>=2 は verify が必須`);
  if (!Array.isArray(t.emits)) errors.push(`${t.name}: emits は配列`);
  for (const e of t.emits ?? []) if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*@\d+$/.test(e)) errors.push(`${t.name}: emits の形式は entity.verb@version（${e}）`);
  if (!t.renders?.trim()) errors.push(`${t.name}: renders は必須`);
  if (typeof t.impl !== "function") errors.push(`${t.name}: impl は必須`);
  return errors;
}

/** 型推論のためだけの薄い関数。検証は Registry.register で行う */
export function defineTool<I extends Record<string, unknown>, O extends Record<string, unknown>>(t: ToolContract<I, O>): ToolContract<I, O> {
  return t;
}
