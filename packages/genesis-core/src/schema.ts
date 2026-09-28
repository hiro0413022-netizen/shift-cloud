/**
 * JSON Schema のサブセット検証（Genesis Core・P0）
 *
 * Tool の input/output・Event の payload・Block の data はすべてこの形で宣言する。
 * zod ではなく JSON Schema にした理由:
 *   - MCP の tools/list はそのまま JSON Schema を要求する（変換ロジックを持たない）
 *   - node --test（依存なし）でそのまま検証できる
 *   - 宣言が DB（gn_tool_policies 等）や画面にそのまま置ける
 * 対応する語彙は意図的に小さい。足りなくなったら増やす（先回りしない）。
 */

export type JsonSchema = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: Array<string | number | boolean | null>;
  format?: "date" | "time" | "date-time" | "uuid" | "email";
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  nullable?: boolean;
  additionalProperties?: boolean;
};

export type ValidationResult<T = unknown> =
  | { ok: true; value: T; errors: [] }
  | { ok: false; value: unknown; errors: string[] };

const FORMATS: Record<NonNullable<JsonSchema["format"]>, RegExp> = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}(:\d{2})?$/,
  "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * 値を検証し、default を埋めた値を返す。入力は変更しない（コピーを返す）。
 * エラーは「path: 理由」の配列。最初の1件で止めず、全部集める（AIが直しやすい）。
 */
export function validate<T = unknown>(schema: JsonSchema, value: unknown, path = "$"): ValidationResult<T> {
  const errors: string[] = [];
  const out = walk(schema, value, path, errors);
  return errors.length ? { ok: false, value: out, errors } : { ok: true, value: out as T, errors: [] };
}

function walk(schema: JsonSchema, value: unknown, path: string, errors: string[]): unknown {
  if (value === undefined && schema.default !== undefined) value = structuredClone(schema.default);
  if (value === null || value === undefined) {
    if (schema.nullable || schema.type === "null") return value ?? null;
    if (value === undefined) return undefined; // required は object 側で見る
    errors.push(`${path}: null は許可されていません`);
    return value;
  }
  if (schema.enum && !schema.enum.includes(value as never)) {
    errors.push(`${path}: ${JSON.stringify(value)} は候補 [${schema.enum.map((e) => JSON.stringify(e)).join(", ")}] にありません`);
    return value;
  }
  const t = schema.type;
  if (!t) return value;
  const actual = typeOf(value);
  if (t === "integer") {
    if (actual !== "number" || !Number.isInteger(value)) {
      errors.push(`${path}: 整数が必要です（${actual}）`);
      return value;
    }
  } else if (t !== actual) {
    errors.push(`${path}: ${t} が必要です（${actual}）`);
    return value;
  }
  if (t === "string") {
    const s = value as string;
    if (schema.minLength !== undefined && s.length < schema.minLength) errors.push(`${path}: ${schema.minLength}文字以上`);
    if (schema.maxLength !== undefined && s.length > schema.maxLength) errors.push(`${path}: ${schema.maxLength}文字以下`);
    if (schema.pattern && !new RegExp(schema.pattern).test(s)) errors.push(`${path}: 形式が違います（${schema.pattern}）`);
    if (schema.format && !FORMATS[schema.format].test(s)) errors.push(`${path}: ${schema.format} の形式ではありません`);
    return s;
  }
  if (t === "number" || t === "integer") {
    const n = value as number;
    if (schema.minimum !== undefined && n < schema.minimum) errors.push(`${path}: ${schema.minimum} 以上`);
    if (schema.maximum !== undefined && n > schema.maximum) errors.push(`${path}: ${schema.maximum} 以下`);
    return n;
  }
  if (t === "array") {
    const arr = value as unknown[];
    return schema.items ? arr.map((v, i) => walk(schema.items!, v, `${path}[${i}]`, errors)) : arr.slice();
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const props = schema.properties ?? {};
    for (const key of Object.keys(props)) {
      const v = walk(props[key], obj[key], `${path}.${key}`, errors);
      if (v !== undefined) out[key] = v;
    }
    for (const key of schema.required ?? []) {
      if (out[key] === undefined || out[key] === null || out[key] === "") errors.push(`${path}.${key}: 必須です`);
    }
    if (schema.additionalProperties !== false) {
      for (const key of Object.keys(obj)) if (!(key in props)) out[key] = obj[key];
    }
    return out;
  }
  return value;
}

/** MCP へ出すときの JSON Schema（そのまま。将来 $schema を付ける場合はここ） */
export function toMcpSchema(schema: JsonSchema): Record<string, unknown> {
  return structuredClone(schema) as Record<string, unknown>;
}
