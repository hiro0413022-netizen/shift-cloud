// 一覧ページをAIに読ませて営業先を構造化する（DECISIONS #117）。
//
// なぜAIを使うのか:
// 正規表現での抽出は、サイトごとのHTML構造に依存する。実際 #114 では
// 「詳細ページに見出しが無くtitleが全ページ共通」という構造で全滅した。
// 任意のHTMLから項目を取り出すのはLLMの得意分野なので、**読み取りだけ**を任せる。
//
// **AIに「探させ」てはいけない**（この境界がこのファイルの肝）:
// 「伊丹市の美容室を100件挙げて」と頼むと、LLMは実在しない店を作る。営業リストに
// 架空の宛先が混ざれば、メールは届かず電話も繋がらず、こちらの信用が損なわれる。
// だから **渡したHTMLに書かれていることだけを写させ**、書かれていない情報は null にさせる。
// さらに verifyAgainstSource() で「本当にHTMLに含まれる文字列か」を機械的に検算する。

import type { DirectoryRow } from "./parse";

export interface AiExtractOptions {
  apiKey?: string;
  model?: string;
  /** 1回に渡すHTMLの上限。長すぎると費用と失敗率が上がる */
  maxChars?: number;
}

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/**
 * 一覧ページのHTMLを、営業先の行の配列にする。
 * AIが使えない・失敗したときは null を返す（呼び出し側が正規表現の結果を使う）。
 */
export async function aiExtractRows(
  html: string,
  baseUrl: string,
  opts: AiExtractOptions = {},
): Promise<{ rows: DirectoryRow[] | null; error?: string; usedChars: number }> {
  const apiKey = opts.apiKey;
  if (!apiKey) return { rows: null, error: "ANTHROPIC_API_KEY 未設定", usedChars: 0 };

  const source = compactHtml(html, opts.maxChars ?? 120_000);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: 8000,
        system:
          "あなたは与えられたHTMLから事業所の一覧を書き写す作業者です。" +
          "HTMLに書かれていることだけを写してください。書かれていない項目は必ず null にしてください。" +
          "推測・補完・新しい事業所を作ることは禁止です。",
        messages: [
          {
            role: "user",
            content:
              `次のHTMLは事業所の一覧ページです（元URL: ${baseUrl}）。\n` +
              `掲載されている事業所を JSON 配列で書き出してください。\n\n` +
              `形式: [{"name":"屋号","href":"詳細ページのhref（無ければnull）","address":"住所またはnull","phone":"電話番号またはnull","hint":"業種・診療科など行に書かれた説明"}]\n\n` +
              `守ること:\n` +
              `- HTMLに実際に書かれている事業所だけ。1件も創作しない\n` +
              `- 屋号はリンクや見出しの文字をそのまま写す（ページ全体のタイトルやサイト名は屋号ではない）\n` +
              `- ナビゲーション・広告・「お問い合わせ」等のリンクは事業所ではないので除く\n` +
              `- JSON配列だけを出力し、説明文は書かない\n\n` +
              `HTML:\n${source}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { rows: null, error: `AI ${res.status}: ${(await res.text()).slice(0, 160)}`, usedChars: source.length };
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const parsed = parseJsonArray(text);
    if (!parsed) return { rows: null, error: "AIの出力をJSONとして読めませんでした", usedChars: source.length };

    return { rows: toRows(parsed, baseUrl), usedChars: source.length };
  } catch (e) {
    return { rows: null, error: String(e).slice(0, 160), usedChars: source.length };
  }
}

/**
 * AIに渡す前にHTMLを削る。
 * script/style/コメント/SVGは事業所の情報を含まないので落とす。費用は入力の長さに比例するため、
 * ここを削るほど安く・速く・正確になる（余計な文字はAIの注意も逸らす）。
 */
export function compactHtml(html: string, maxChars: number): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) : cleaned;
}

/** AIの出力からJSON配列を取り出す（```json で囲まれていても読む） */
export function parseJsonArray(text: string): unknown[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function toRows(items: unknown[], baseUrl: string): DirectoryRow[] {
  const out: DirectoryRow[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    const name = str(it.name);
    if (!name || name.length < 2 || name.length > 60) continue;

    // 詳細ページが無い名簿もあるので、href が無ければ「一覧URL＋屋号」を鍵にする。
    // 鍵が無いと同じ先を毎回拾い直してしまう
    let refKey = `${baseUrl}#${name}`;
    const href = str(it.href);
    if (href) {
      try {
        refKey = new URL(href, baseUrl).toString().split("#")[0];
      } catch {
        /* 壊れたURLは屋号の鍵のまま */
      }
    }
    if (seen.has(refKey)) continue;
    seen.add(refKey);

    const address = str(it.address);
    out.push({
      refKey,
      name,
      address,
      city: address ? (address.match(/([^\s,、]{1,6}?[市区町村])/)?.[1] ?? null) : null,
      phone: str(it.phone),
      hint: str(it.hint) ?? "",
    });
  }
  return out;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.toLowerCase() !== "null" ? s : null;
}

/**
 * AIが書いた屋号が、本当に元のHTMLに存在するかを検算する。
 *
 * **創作を防ぐ最後の砦**。LLMは指示に反して補完することがあるので、
 * 「元の文書に無い文字列」は落とす。ここを通らない行は営業先にしない。
 */
export function verifyAgainstSource<T extends { name: string }>(rows: T[], html: string): { kept: T[]; dropped: T[] } {
  const haystack = html.replace(/\s+/g, "");
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const r of rows) {
    if (haystack.includes(r.name.replace(/\s+/g, ""))) kept.push(r);
    else dropped.push(r);
  }
  return { kept, dropped };
}
