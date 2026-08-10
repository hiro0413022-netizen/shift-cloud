#!/usr/bin/env node
/**
 * FRANK GOLF Square初期設定スクリプト（#123）
 *
 * Squareアカウントに対して以下を「無ければ作る」（何度実行しても安全・既存は名前で判定してスキップ）:
 *   1. ロケーションIDの確認
 *   2. 消費税10%（内税）の税オブジェクト
 *   3. ドリンクメニュー3カテゴリ＋24商品（各商品「一般」「会員」の2価格・税込）
 *   4. 月会費サブスクプラン「FRANK GOLF 月会費」＋5バリエーション（税込・毎月）
 *   5. Webhook購読（payment/refund/subscription → yozan-genesis の /api/public/frank/pos/webhook）
 *
 * 使い方:
 *   SQUARE_ACCESS_TOKEN=EAAA... node scripts/frank-square-setup.mjs
 *
 * 終わりに、Vercelへ入れる環境変数と frunk_plans.square_variation_id 更新SQLを出力する。
 * （手順の正典: docs/genesis/OPERATIONS.md §14-1）
 */

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("SQUARE_ACCESS_TOKEN を環境変数で渡してください");
  process.exit(1);
}
const BASE = process.env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
const WEBHOOK_URL = process.env.SQUARE_WEBHOOK_URL || "https://yozan-genesis.vercel.app/api/public/frank/pos/webhook";

async function sq(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.errors ?? []).map((e) => `${e.code}: ${e.detail ?? ""}`).join("; ") || `HTTP ${res.status}`;
    throw new Error(`${method} ${path} → ${msg}`);
  }
  return json;
}
const uid = () => crypto.randomUUID();

// ---------------------------------------------------------------
// メニュー定義（価格は税込・円）
// ---------------------------------------------------------------
const CATEGORIES = ["DRINK", "FRANK SPECIAL", "NON-ALCOHOL"];
const DRINKS = [
  // [カテゴリ, 商品名, 一般価格, 会員価格]
  ["DRINK", "コーヒー", 400, 300],
  ["DRINK", "アイスコーヒー", 400, 300],
  ["DRINK", "カフェラテ", 500, 400],
  ["DRINK", "アイスカフェラテ", 500, 400],
  ["DRINK", "紅茶", 400, 300],
  ["DRINK", "アイスティー", 400, 300],
  ["DRINK", "コカ・コーラ", 400, 300],
  ["DRINK", "ジンジャーエール", 400, 300],
  ["DRINK", "オレンジジュース", 400, 300],
  ["DRINK", "アップルジュース", 400, 300],
  ["DRINK", "ウーロン茶", 400, 300],
  ["DRINK", "炭酸水", 350, 250],
  ["DRINK", "ポカリスエット", 400, 300],
  ["DRINK", "オロナミンC", 400, 300],
  ["DRINK", "レッドブル", 500, 450],
  ["DRINK", "プロテインドリンク", 500, 400],
  ["FRANK SPECIAL", "FRANK レモンスカッシュ", 500, 400],
  ["FRANK SPECIAL", "ゆずソーダ", 500, 400],
  ["FRANK SPECIAL", "マンゴーソーダ", 500, 400],
  ["FRANK SPECIAL", "ピーチソーダ", 500, 400],
  ["FRANK SPECIAL", "ノンアルモヒート", 550, 450],
  ["NON-ALCOHOL", "ノンアルコールビール", 500, 400],
  ["NON-ALCOHOL", "ノンアルレモンサワー", 500, 400],
  ["NON-ALCOHOL", "ノンアルハイボール", 500, 400],
];

// 月会費プラン（frunk_plans と同名・税抜→税込は round(×1.1)＝コード側 monthlyFeeTaxIncluded と同じ式）
const PLANS = [
  ["ライト会員", 9800],
  ["レギュラー会員", 13800],
  ["マスター会員", 19800],
  ["法人ライトプラン", 39800],
  ["法人プレミアムプラン", 59800],
];
const taxIncl = (exTax) => Math.round(exTax * 1.1);

// ---------------------------------------------------------------
// 既存カタログの取得（名前→id）
// ---------------------------------------------------------------
async function listCatalog(types) {
  const objects = [];
  let cursor;
  do {
    const q = new URLSearchParams({ types });
    if (cursor) q.set("cursor", cursor);
    const json = await sq("GET", `/v2/catalog/list?${q}`);
    objects.push(...(json.objects ?? []));
    cursor = json.cursor;
  } while (cursor);
  return objects;
}

async function main() {
  // 1. ロケーション
  const loc = await sq("GET", "/v2/locations");
  const active = (loc.locations ?? []).filter((l) => l.status === "ACTIVE");
  if (active.length === 0) throw new Error("有効なロケーションがありません");
  const location = active[0];
  console.log(`✔ ロケーション: ${location.name}（${location.id}）通貨=${location.currency}`);

  // 2. 税（内税10%）
  const taxes = await listCatalog("TAX");
  let tax = taxes.find((t) => t.tax_data?.name === "消費税10%");
  if (!tax) {
    const r = await sq("POST", "/v2/catalog/object", {
      idempotency_key: uid(),
      object: {
        type: "TAX",
        id: "#tax10",
        present_at_all_locations: true,
        tax_data: { name: "消費税10%", calculation_phase: "TAX_SUBTOTAL_PHASE", inclusion_type: "INCLUSIVE", percentage: "10.0", enabled: true },
      },
    });
    tax = r.catalog_object;
    console.log(`✔ 税を作成: 消費税10%（内税・${tax.id}）`);
  } else {
    console.log(`・税は既存: 消費税10%（${tax.id}）`);
  }

  // 3. カテゴリ
  const cats = await listCatalog("CATEGORY");
  const catIds = {};
  for (const name of CATEGORIES) {
    const found = cats.find((c) => c.category_data?.name === name);
    if (found) {
      catIds[name] = found.id;
      console.log(`・カテゴリ既存: ${name}`);
      continue;
    }
    const r = await sq("POST", "/v2/catalog/object", {
      idempotency_key: uid(),
      object: { type: "CATEGORY", id: "#cat", present_at_all_locations: true, category_data: { name } },
    });
    catIds[name] = r.catalog_object.id;
    console.log(`✔ カテゴリ作成: ${name}`);
  }

  // 4. ドリンク24品（一般/会員の2価格）
  const items = await listCatalog("ITEM");
  const existingNames = new Set(items.map((i) => i.item_data?.name));
  let created = 0;
  for (const [cat, name, general, member] of DRINKS) {
    if (existingNames.has(name)) {
      console.log(`・商品既存: ${name}`);
      continue;
    }
    const object = {
      type: "ITEM",
      id: "#item",
      present_at_all_locations: true,
      item_data: {
        name,
        tax_ids: [tax.id],
        categories: [{ id: catIds[cat] }],
        reporting_category: { id: catIds[cat] },
        variations: [
          {
            type: "ITEM_VARIATION",
            id: "#v1",
            present_at_all_locations: true,
            item_variation_data: { item_id: "#item", name: "一般", ordinal: 0, pricing_type: "FIXED_PRICING", price_money: { amount: general, currency: "JPY" } },
          },
          {
            type: "ITEM_VARIATION",
            id: "#v2",
            present_at_all_locations: true,
            item_variation_data: { item_id: "#item", name: "会員", ordinal: 1, pricing_type: "FIXED_PRICING", price_money: { amount: member, currency: "JPY" } },
          },
        ],
      },
    };
    try {
      await sq("POST", "/v2/catalog/object", { idempotency_key: uid(), object });
    } catch (e) {
      // 古いAPIバージョンのアカウントでは categories 未対応 → category_id で再試行
      if (String(e).includes("categories")) {
        delete object.item_data.categories;
        delete object.item_data.reporting_category;
        object.item_data.category_id = catIds[cat];
        await sq("POST", "/v2/catalog/object", { idempotency_key: uid(), object });
      } else throw e;
    }
    created++;
    console.log(`✔ 商品作成: ${name}（一般¥${general}/会員¥${member}）`);
  }
  console.log(`✔ ドリンク: 新規${created}件 / 全${DRINKS.length}件`);

  // 5. 月会費サブスクプラン
  const plans = await listCatalog("SUBSCRIPTION_PLAN");
  let plan = plans.find((p) => p.subscription_plan_data?.name === "FRANK GOLF 月会費");
  if (!plan) {
    const r = await sq("POST", "/v2/catalog/object", {
      idempotency_key: uid(),
      object: { type: "SUBSCRIPTION_PLAN", id: "#plan", present_at_all_locations: true, subscription_plan_data: { name: "FRANK GOLF 月会費" } },
    });
    plan = r.catalog_object;
    console.log(`✔ サブスクプラン作成: FRANK GOLF 月会費（${plan.id}）`);
  } else {
    console.log(`・サブスクプラン既存: FRANK GOLF 月会費（${plan.id}）`);
  }
  const existingVars = plan.subscription_plan_data?.subscription_plan_variations ?? [];
  const varIds = {}; // プラン名 → variation id
  for (const [name, exTax] of PLANS) {
    const found = existingVars.find((v) => v.subscription_plan_variation_data?.name === name);
    if (found) {
      varIds[name] = found.id;
      console.log(`・バリエーション既存: ${name}（${found.id}）`);
      continue;
    }
    const r = await sq("POST", "/v2/catalog/object", {
      idempotency_key: uid(),
      object: {
        type: "SUBSCRIPTION_PLAN_VARIATION",
        id: "#var",
        present_at_all_locations: true,
        subscription_plan_variation_data: {
          name,
          subscription_plan_id: plan.id,
          phases: [{ cadence: "MONTHLY", ordinal: 0, pricing: { type: "STATIC", price: { amount: taxIncl(exTax), currency: "JPY" } } }],
        },
      },
    });
    varIds[name] = r.catalog_object.id;
    console.log(`✔ バリエーション作成: ${name} ¥${taxIncl(exTax).toLocaleString()}/月・税込（${varIds[name]}）`);
  }

  // 6. Webhook購読
  const EVENTS = ["payment.created", "payment.updated", "refund.created", "refund.updated", "subscription.created", "subscription.updated"];
  const subs = await sq("GET", "/v2/webhooks/subscriptions");
  let hook = (subs.subscriptions ?? []).find((s) => s.notification_url === WEBHOOK_URL);
  let signatureKey = null;
  if (!hook) {
    const r = await sq("POST", "/v2/webhooks/subscriptions", {
      idempotency_key: uid(),
      subscription: { name: "YOZAN Genesis（FRANK 月会費＋店頭POS）", notification_url: WEBHOOK_URL, event_types: EVENTS, enabled: true },
    });
    hook = r.subscription;
    signatureKey = hook.signature_key ?? null;
    console.log(`✔ Webhook購読を作成: ${WEBHOOK_URL}`);
  } else {
    // イベント不足なら追記
    const missing = EVENTS.filter((e) => !(hook.event_types ?? []).includes(e));
    if (missing.length > 0) {
      await sq("PUT", `/v2/webhooks/subscriptions/${hook.id}`, {
        subscription: { event_types: [...new Set([...(hook.event_types ?? []), ...EVENTS])], enabled: true },
      });
      console.log(`✔ Webhook購読にイベント追加: ${missing.join(", ")}`);
    } else {
      console.log(`・Webhook購読は既存: ${WEBHOOK_URL}`);
    }
    signatureKey = hook.signature_key ?? null;
  }

  // ---------------- まとめ ----------------
  console.log("\n================ 仕上げ（この値を設定してください） ================");
  console.log("\n■ Vercel（yozan-genesis）の環境変数:");
  console.log(`  SQUARE_ACCESS_TOKEN          … 実行時に使ったトークン`);
  console.log(`  SQUARE_LOCATION_ID           = ${location.id}`);
  console.log(`  SQUARE_WEBHOOK_SIGNATURE_KEY = ${signatureKey ?? "（既存購読のためダッシュボードで確認）"}`);
  console.log(`  SQUARE_WEBHOOK_URL           = ${WEBHOOK_URL}`);
  console.log("\n■ Supabase（frunk_plans.square_variation_id）:");
  for (const [name] of PLANS) {
    if (varIds[name]) console.log(`  update frunk_plans set square_variation_id='${varIds[name]}' where name='${name}' and deleted_at is null;`);
  }
  console.log("\n完了。");
}

main().catch((e) => {
  console.error("✖ 失敗:", e.message ?? e);
  process.exit(1);
});
