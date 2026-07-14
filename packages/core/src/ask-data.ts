import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================
   Ask Data — 実データに接地したチャット（0053 / DECISIONS #56）

   なぜ作るか:
     日次レポートは「押し出し」で、聞きたいことを聞けない。
     店長は Cowork を使えないので、数字を知るには本部に聞くしかなかった。

   ハルシネーション対策（最重要）:
     LLMは「答え」を書かない。LLMが書くのは SQL だけ。
     数字は必ず Postgres が計算し、生成SQLと件数を画面に出す（出典表示）。
     行が0件なら「データがありません」と答え、推測は絶対にしない。

   権限:
     scope='hq'    … Genesis（view_hq）。全ビュー。
     scope='store' … staff-portal。gnv_payroll/gnv_finance/gnv_expenses/
                     gnv_bank_txn/gnv_inquiries/gnv_contracts/gnv_caddy は
                     DB側（gn_ctx_is_hq()）で0行になる。storeId で自店舗に限定。
     ※アプリ側の値ではなくDBが強制する。ここが安全性の要。
   ============================================================ */

export type AskScope = "hq" | "store";

export type AskDataInput = {
  question: string;
  companyId: string;
  staffId: string;
  scope: AskScope;
  storeId?: string | null;
  admin: SupabaseClient;
};

export type AskDataResult = {
  answer: string;
  sql: string | null;
  rows: Record<string, unknown>[];
  rowCount: number;
  error: string | null;
  elapsedMs: number;
};

const MODEL = process.env.ASK_DATA_MODEL || "claude-haiku-4-5-20251001";
const MAX_ROWS = 200;

/* ------------------------------------------------------------
   スキーマカタログ（LLMに見せる唯一の世界）
   ここに書いていないビュー・列は存在しないものとして扱われる。
   ビューを増やしたら必ずここも追記する。
------------------------------------------------------------ */
const CATALOG_COMMON = `
gnv_sales — 店頭売上（1行=1決済/月次取込）
  sold_on(date), category(text), member_kind(text), amount(numeric:税抜), tax_included(numeric:税込),
  pay_method(text), customer_name(text), store_name(text), segment_name(text)
gnv_sales_lines — 物販/フィッティング明細（1行=1商品）
  sold_on(date), item_category, item_type, maker, product_name, list_price, discount, sale_price,
  qty, amount(税抜), tax_included, pay_method, member_kind, pro, store_name
gnv_members — 会員（スナップショット）
  member_no, member_name, gender, age, join_date(date), leave_date(date), leave_reason,
  member_type, class_name, store_name, campaign, payment_method, monthly_visits, last_visit_date,
  is_active(bool: leave_date が null なら true = 在籍中)
gnv_trials — 体験レッスン予約
  booking_seq, program, lesson_date(date), start_time, status, joined(bool:入会したか),
  joined_at(date), decline_reason, source, created_at, store_name
gnv_shifts — シフト（予定）
  date, start_time, end_time, is_day_off(bool), status, store_name, staff_name
gnv_attendance — 勤怠実績（すべて分単位）
  date, clock_in, clock_out, break_minutes, work_minutes, overtime_minutes, late_minutes,
  early_leave_minutes, is_missing_clock(bool), status, store_name, staff_name
gnv_kpi — KPI
  code, name, area, unit, current_value, target_value, period, notes
  ※主要コード: monthly_sales / members / trial_bookings / churn_rate / labor_cost_ratio
gnv_stores — 店舗マスタ: store_name, store_code, brand_name, status
gnv_staff — スタッフ: staff_name, position, employment_type, status（金額情報は無い）
`.trim();

const CATALOG_HQ_ONLY = `
gnv_finance — 月次収支（事業別）
  target_month(date:月初), segment_name, category_name, category_kind('income'|'expense'),
  amount(numeric), memo, source
gnv_payroll — 給与明細（個人別）
  target_month(date), period_status, staff_name, position, employment_type,
  work_minutes, overtime_minutes, base_amount, overtime_amount, commute_amount,
  allowance_amount, deduction_amount, total_amount(支給合計)
gnv_expenses — 経費: spent_on(date), item, payee, amount, method, category, memo, segment_name, store_name
gnv_bank_txn — 銀行/カード取引: txn_date, description, amount, balance, category, status, memo, source_name, segment_name
  ※ status が未分類のものが仕訳待ち
gnv_inquiries — 問い合わせ: received_at, source, inquiry_type, priority, from_name, subject, status, ai_summary, reply_sent_at
gnv_contracts — 契約書: doc_type, title, counterparty, status, effective_date, expiry_date,
  auto_renew, renewal_notice_days, next_action_date, amount, risk_level, summary, segment_name
gnv_caddy — キャディ派遣（1行=1派遣）: seq, dispatch_date, kind, client_name, unit_price, sales_amount,
  partner_name, staff_name, fee_amount, transport_amount, special_amount, gross_profit
`.trim();

function catalog(scope: AskScope): string {
  return scope === "hq" ? `${CATALOG_COMMON}\n${CATALOG_HQ_ONLY}` : CATALOG_COMMON;
}

/* ------------------------------------------------------------
   1) 質問 → SQL
------------------------------------------------------------ */
function sqlSystemPrompt(scope: AskScope, today: string): string {
  const scopeNote =
    scope === "hq"
      ? "利用者は経営陣（本部）。全社の全店舗が見える。"
      : "利用者は店舗スタッフ。自店舗のデータしか返らない（DB側で強制済み）。給与・経理・契約は参照できない。";

  return [
    "あなたは株式会社YOZANの社内データに対するSQL生成器です。日本語の質問を PostgreSQL の SELECT 文1本に変換します。",
    "",
    `今日の日付: ${today}`,
    scopeNote,
    "",
    "参照できるビューはこれだけです（実体テーブルには一切アクセスできません）:",
    catalog(scope),
    "",
    "厳守事項:",
    "- 出力は SQL のみ。説明・コードフェンス・セミコロンを付けない。",
    "- SELECT または WITH で始まる単一文のみ。書き込み・DDLは不可。",
    "- 上記ビュー以外の名前（実体テーブル、システムカタログ）を FROM/JOIN に書かない。",
    "- company_id や店舗の絞り込みは書かなくてよい（DBが自動で適用する）。",
    "- 金額は原則 amount（税抜）。税込を聞かれたら tax_included を使う。",
    "- 「先月」「今月」は今日の日付から計算し、日付リテラルで書く。",
    "- 件数は count(*)、金額合計は sum(...) を使い、必要なら group by で内訳を出す。",
    `- 明細を返すときは最大 ${MAX_ROWS} 行に収まるよう order by と limit を付ける。`,
    "- 質問が上記ビューのデータで答えられない場合は、SQLではなく `CANNOT_ANSWER: 理由` とだけ出力する。",
  ].join("\n");
}

/* ------------------------------------------------------------
   2) 行 → 日本語の答え（数字はSQL結果からのみ。推測禁止）
------------------------------------------------------------ */
const ANSWER_SYSTEM = [
  "あなたは株式会社YOZANの社内データアシスタントです。SQLの実行結果だけを根拠に、日本語で簡潔に答えます。",
  "",
  "厳守事項:",
  "- 結果に無い数字を書かない。推測・補間・一般論を一切しない。",
  "- 結果が0件なら「該当するデータはありませんでした」と答え、理由の可能性（未取込など）を1文だけ添える。",
  "- 金額は3桁区切り＋「円」。件数は「件」「名」。",
  "- 2〜4文、または短い箇条書き。前置き・挨拶は不要。",
  "- 行数が多い場合は上位のみ挙げ、全体の合計や傾向を述べる。",
].join("\n");

async function callClaude(system: string, user: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

function cleanSql(raw: string): string {
  return raw
    .replace(/^```(?:sql)?/i, "")
    .replace(/```$/,'')
    .replace(/;\s*$/, "")
    .trim();
}

async function runSql(
  admin: SupabaseClient,
  sql: string,
  input: AskDataInput
): Promise<{ rows: Record<string, unknown>[] } | { error: string }> {
  const { data, error } = await admin.rpc("gn_chat_query", {
    p_sql: sql,
    p_company_id: input.companyId,
    p_scope: input.scope,
    p_store_id: input.storeId ?? null,
    p_limit: MAX_ROWS,
  });
  if (error) return { error: error.message };
  return { rows: (data ?? []) as Record<string, unknown>[] };
}

/* ------------------------------------------------------------
   本体
------------------------------------------------------------ */
export async function askData(input: AskDataInput): Promise<AskDataResult> {
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const base: Omit<AskDataResult, "answer" | "elapsedMs"> = {
    sql: null,
    rows: [],
    rowCount: 0,
    error: null,
  };

  const finish = async (
    r: Omit<AskDataResult, "elapsedMs">,
    engine: "claude" | "error" | "refused"
  ): Promise<AskDataResult> => {
    const elapsedMs = Date.now() - started;
    // 履歴は必ず残す（出典表示・監査）。失敗しても回答は返す
    try {
      await input.admin.from("gn_chat_messages").insert({
        company_id: input.companyId,
        staff_id: input.staffId,
        scope: input.scope,
        store_id: input.storeId ?? null,
        question: input.question,
        generated_sql: r.sql,
        answer: r.answer,
        row_count: r.rowCount,
        engine,
        error: r.error,
        elapsed_ms: elapsedMs,
      });
    } catch {
      /* ログ失敗で回答を落とさない */
    }
    return { ...r, elapsedMs };
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return finish(
      { ...base, answer: "AI接続が未設定です（ANTHROPIC_API_KEY）。管理者に連絡してください。", error: "no_api_key" },
      "error"
    );
  }

  // 1) SQL生成
  const raw = await callClaude(sqlSystemPrompt(input.scope, today), input.question, 700);
  if (!raw) {
    return finish({ ...base, answer: "AIの応答に失敗しました。少し待ってもう一度お試しください。", error: "llm_failed" }, "error");
  }
  if (raw.startsWith("CANNOT_ANSWER")) {
    const reason = raw.replace(/^CANNOT_ANSWER:?\s*/, "");
    return finish(
      { ...base, answer: `この質問はGENESISが持っているデータでは答えられません。${reason}`, error: "cannot_answer" },
      "refused"
    );
  }

  let sql = cleanSql(raw);
  let run = await runSql(input.admin, sql, input);

  // 2) 失敗したら一度だけ、エラーを見せて直させる
  if ("error" in run) {
    const retry = await callClaude(
      sqlSystemPrompt(input.scope, today),
      `質問: ${input.question}\n\n直前のSQLはエラーになりました。修正したSQLだけを出力してください。\nSQL: ${sql}\nエラー: ${run.error}`,
      700
    );
    if (retry && !retry.startsWith("CANNOT_ANSWER")) {
      sql = cleanSql(retry);
      run = await runSql(input.admin, sql, input);
    }
  }

  if ("error" in run) {
    return finish(
      { ...base, sql, answer: `データの取得に失敗しました（${run.error}）。質問を言い換えてみてください。`, error: run.error },
      "error"
    );
  }

  const rows = run.rows;

  // 3) 行を根拠に日本語化（0件でも必ずここで正直に答える）
  const answer =
    (await callClaude(
      ANSWER_SYSTEM,
      [
        `質問: ${input.question}`,
        `実行したSQL:\n${sql}`,
        `結果（${rows.length}行）:\n${JSON.stringify(rows).slice(0, 12000)}`,
      ].join("\n\n"),
      600
    )) ?? (rows.length === 0 ? "該当するデータはありませんでした。" : "結果は下の表のとおりです。");

  return finish({ sql, rows, rowCount: rows.length, error: null, answer }, "claude");
}

/** 履歴（直近） */
export async function recentAsks(
  admin: SupabaseClient,
  companyId: string,
  staffId: string,
  limit = 20
) {
  const { data } = await admin
    .from("gn_chat_messages")
    .select("id, question, answer, generated_sql, row_count, error, created_at")
    .eq("company_id", companyId)
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
