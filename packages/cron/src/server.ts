// @yozan/cron/server — Vercel Cronルートの共通形。
// 切り出し元: apps/genesis/src/app/api/cron/daily/route.ts と
// apps/demo-sales/src/app/api/cron/prospect/route.ts（認可＋会社ループが完全に同型）。
//
// ハマりどころの再発防止（このパッケージが存在する理由）:
//  - CRON_SECRET未設定 → 全リクエスト401。Vercelの環境変数設定が必須（#110で実障害）
//  - middlewareが/api/cronを拾うと307でcronが空振り → 公開プレフィックス登録必須（報告パイプライン停止の主因）
//  - maxDuration不足で後工程が丸ごと欠落（2026-07-15〜17）→ ルート側で maxDuration を必ず宣言
//  - 「今日」はUTC禁止 → @yozan/core/jst を使う（#73）
//
// 使い方（route.ts）:
//   export const dynamic = "force-dynamic";
//   export const maxDuration = 300;
//   export const GET = createCronHandler({
//     listCompanies: async () => { ... admin.from("companies")... },
//     run: (companyId) => doWork(companyId),
//   });

/**
 * Authorization: Bearer ${CRON_SECRET} の検査。
 * 通れば null、弾くなら 401 Response を返す（genesis/demo-salesと同一ロジック）。
 */
export function requireCronAuth(
  req: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): Response | null {
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export type CronHandlerOptions = {
  /** 対象会社ID一覧（通常: companies where deleted_at is null）。Supabaseクライアントはアプリ側で持つ */
  listCompanies: () => Promise<string[]>;
  /** 1社ぶんの処理。throwしてもループは止めず、結果に error として残す */
  run: (companyId: string) => Promise<unknown>;
  /** 既定: process.env.CRON_SECRET */
  secret?: () => string | undefined;
};

/** 認可→会社ごとにrun→ {ok, results} を返すGETハンドラを作る */
export function createCronHandler(opts: CronHandlerOptions): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const denied = requireCronAuth(req, (opts.secret ?? (() => process.env.CRON_SECRET))());
    if (denied) return denied;

    const results: Array<Record<string, unknown>> = [];
    let companies: string[] = [];
    try {
      companies = await opts.listCompanies();
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 500 });
    }
    for (const companyId of companies) {
      try {
        const r = await opts.run(companyId);
        results.push({ company: companyId, ...(typeof r === "object" && r !== null ? (r as Record<string, unknown>) : { result: r }) });
      } catch (e) {
        // 1社の失敗で他社を巻き込まない（genesis dailyと同じ方針）
        results.push({ company: companyId, error: String(e) });
      }
    }
    return Response.json({ ok: true, results });
  };
}
