import { Chip, Yen } from "@/components/ui";
import { calcDailyPay, type SlipItemInput } from "@yozan/core/night-payroll";
import {
  businessDate,
  castDaysForStore,
  daySummary,
  getActiveRules,
  resolveNightStore,
} from "@/lib/night";
import { applyPreset, saveFromForm } from "./actions";

export const dynamic = "force-dynamic";

function yesterday(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function BacksPage() {
  const store = await resolveNightStore();
  if (!store) return <main className="p-6 text-sm text-(--color-dim)">店舗が登録されていません。</main>;

  const { rules, businessType } = await getActiveRules(store.id);
  const simDate = yesterday(businessDate());
  const [days, summary] = await Promise.all([
    castDaysForStore(store.id, simDate, rules),
    daySummary(store.id, simDate, rules),
  ]);
  const top = days[0];

  // 誰も出ていない日は、設定の効き方が分かるようにサンプルで見せる
  const sample =
    top ??
    ({
      cast: { id: "", name: "（サンプル）", displayName: "サンプル", rankName: "A", hourlyWage: 3000, status: "active" },
      minutes: 360,
      broughtCustomer: true,
      pay: calcDailyPay(rules, {
        baseHourlyWage: 3000,
        minutes: 360,
        broughtCustomer: true,
        items: [
          { kind: "nomination", amount: rules.price.nomination * 2, qty: 2, castId: "x" },
          { kind: "cast_drink", amount: (rules.drinks[0]?.price ?? 0) * 4, qty: 4, castId: "x", drinkRuleId: rules.drinks[0]?.id },
          { kind: "bottle", amount: 28000, qty: 1, castId: "x" },
        ] as SlipItemInput[],
      }),
    } as const);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-bold">バック設定</h1>
        <span className="text-xs text-(--color-dim)">{store.name}</span>
        <div className="flex gap-1.5">
          {(
            [
              ["cabaret", "キャバクラ"],
              ["lounge", "ガールズバー / ラウンジ"],
            ] as const
          ).map(([k, label]) => (
            <form action={applyPreset} key={k}>
              <input type="hidden" name="businessType" value={k} />
              <button
                className={`min-h-9 rounded-full px-3 text-[11px] ${
                  businessType === k ? "bg-(--color-txt) text-white" : "border border-(--color-line) text-(--color-dim)"
                }`}
              >
                {label}
              </button>
            </form>
          ))}
        </div>
        <span className="text-[10px] text-(--color-mute)">プリセットを押すと、その業態の初期値に戻ります</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <form action={saveFromForm} className="grow">
          <section className="rounded-xl border border-(--color-line) bg-white p-4">
            <h2 className="mb-3 text-xs font-bold">お客様のお会計（税抜）</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field name="setPerGuest" label="セット料金（1名）" value={rules.price.setPerGuest} />
              <Field name="priceNomination" label="本指名" value={rules.price.nomination} />
              <Field name="priceInhouse" label="場内指名" value={rules.price.inhouseNomination} />
              <Field name="priceDouhan" label="同伴" value={rules.price.douhan} />
              <Field name="serviceRate" label="サービス料（%）" value={Math.round(rules.serviceRate * 100)} />
              <Field name="taxRate" label="消費税（%）" value={Math.round(rules.taxRate * 100)} />
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
            <h2 className="mb-3 text-xs font-bold">指名・同伴のバック（キャストに入る額）</h2>
            <div className="grid grid-cols-3 gap-3">
              <Field name="backNomination" label="本指名" value={rules.nominationBack.nomination} />
              <Field name="backInhouse" label="場内指名" value={rules.nominationBack.inhouseNomination} />
              <Field name="backDouhan" label="同伴" value={rules.nominationBack.douhan} />
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
            <h2 className="mb-3 text-xs font-bold">ドリンク</h2>
            <div className="flex flex-col gap-2">
              {rules.drinks.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-line) p-2.5">
                  <span className="w-36 text-[13px] font-medium">{d.label}</span>
                  <Field name={`drink_${d.id}_price`} label="お会計" value={d.price} compact />
                  <Field
                    name={`drink_${d.id}_back`}
                    label={d.backKind === "fixed" ? "バック（円）" : "バック（%）"}
                    value={d.backValue}
                    compact
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
            <h2 className="mb-1 text-xs font-bold">ボトル・シャンパンのバック率</h2>
            <p className="mb-3 text-[10px] text-(--color-mute)">境界は「その金額以上・上の段の金額未満」。同じ金額が2段に入ることはありません。</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {rules.bottleTiers.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-(--color-line) p-2.5">
                  <span className="grow text-[11px] text-(--color-dim)">{t.label}</span>
                  <Field name={`tier_${t.id}_percent`} label="%" value={t.percent} compact />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
            <h2 className="mb-1 text-xs font-bold">時給アップ・手当の条件</h2>
            <p className="mb-3 text-[10px] text-(--color-mute)">上から順に判定し、重なった場合は合算します（%を先に、円を後で足します）。</p>
            <div className="flex flex-col gap-2">
              {rules.upliftRules.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-line) p-2.5">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      name={`uplift_${r.id}_enabled`}
                      defaultChecked={r.enabled !== false}
                      className="h-4 w-4"
                    />
                    <span className="text-[13px] font-medium">{r.label}</span>
                  </label>
                  <Chip tone="plain">{conditionLabel(r.when)}</Chip>
                  <div className="grow" />
                  <Field
                    name={`uplift_${r.id}_value`}
                    label={
                      r.effect.kind === "hourly_percent"
                        ? "時給 +%"
                        : r.effect.kind === "hourly_yen"
                          ? "時給 +円"
                          : "手当（円/月）"
                    }
                    value={r.effect.value}
                    compact
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
            <h2 className="mb-3 text-xs font-bold">控除</h2>
            <div className="flex flex-col gap-2">
              {rules.deductions.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-line) p-2.5">
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" name={`ded_${d.id}_enabled`} defaultChecked={d.enabled !== false} className="h-4 w-4" />
                    <span className="text-[13px] font-medium">{d.label}</span>
                  </label>
                  <Chip tone="plain">
                    {d.kind === "per_day" ? "出勤1日あたり" : d.kind === "per_late_minute" ? "遅刻1分あたり" : "日払い1回あたり"}
                  </Chip>
                  <div className="grow" />
                  <Field name={`ded_${d.id}_value`} label="円" value={d.value} compact />
                </div>
              ))}
            </div>
          </section>

          <div className="sticky bottom-0 mt-3 flex items-center gap-3 rounded-xl border border-(--color-line) bg-white p-3">
            <p className="grow text-[10px] leading-relaxed text-(--color-mute)">
              保存すると新しい版として記録され、これ以降の計算に使われます。確定済みの月の給与は変わりません。
            </p>
            <button className="min-h-11 rounded-lg bg-(--color-accent) px-6 text-sm font-bold text-white">保存</button>
          </div>
        </form>

        {/* シミュレーション */}
        <aside className="w-full shrink-0 lg:w-[280px]">
          <div className="rounded-xl border border-(--color-line) bg-white p-4">
            <div className="text-xs font-bold">この設定で計算すると</div>
            <p className="mt-1 text-[10px] text-(--color-dim)">
              {top ? `${simDate} の実績にあてはめた金額です` : "まだ実績が無いので、サンプルの1日で表示しています"}
            </p>

            <div className="mt-3 rounded-lg border border-(--color-line) p-3">
              <div className="mb-2 text-[13px] font-medium">{sample.cast.name}</div>
              <div className="flex flex-col gap-1.5 text-[11px]">
                <Row label={`時給 ¥${sample.pay.hourly.base.toLocaleString()} × ${(sample.minutes / 60).toFixed(1)}h`} value={Math.floor((sample.pay.hourly.base * sample.minutes) / 60)} />
                {sample.pay.hourly.uplifts.map((u) => (
                  <Row key={u.id} label={u.label} value={sample.pay.hourlyPay - Math.floor((sample.pay.hourly.base * sample.minutes) / 60)} accent />
                ))}
                <Row label="バック" value={sample.pay.backTotal} />
                {sample.pay.deductions.map((d) => (
                  <Row key={d.id} label={d.label} value={-d.amount} />
                ))}
                <div className="mt-1 flex items-baseline justify-between border-t border-(--color-panel-2) pt-2">
                  <span className="text-[11px] font-bold">日当</span>
                  <span className="mn text-[22px] font-bold">
                    <Yen value={sample.pay.net} />
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-(--color-line) p-3">
              <div className="mb-2 text-[11px] font-bold">店側の負担（{simDate}）</div>
              <div className="flex flex-col gap-1.5 text-[11px]">
                <Row label="売上" value={summary.sales} />
                <Row label="キャスト日当 合計" value={summary.laborCost} />
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold">人件費率</span>
                  <span className="text-lg font-bold text-(--color-accent)">{summary.laborRate}%</span>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-(--color-panel-2)">
                <div className="h-full bg-(--color-accent)" style={{ width: `${Math.min(100, summary.laborRate)}%` }} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function conditionLabel(when: { type: string; metric?: string; gte?: number }): string {
  if (when.type === "brought_customer") return "お客様を連れてきた日";
  if (when.type === "daily_count") {
    const m: Record<string, string> = {
      nomination: "本指名",
      inhouse_nomination: "場内指名",
      douhan: "同伴",
      cast_drink: "ドリンク",
      bottle: "ボトル",
    };
    return `その日の${m[when.metric ?? ""] ?? when.metric} ${when.gte}以上`;
  }
  if (when.type === "monthly_work_days") return `その月の出勤 ${when.gte}日以上`;
  return when.type;
}

function Field({ name, label, value, compact }: { name: string; label: string; value: number; compact?: boolean }) {
  return (
    <label className={compact ? "flex items-center gap-1.5" : "block"}>
      <span className={`text-[10px] text-(--color-dim) ${compact ? "" : "mb-1 block"}`}>{label}</span>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        defaultValue={value}
        className={`min-h-11 rounded-lg border border-(--color-line) px-2.5 text-sm ${compact ? "w-24" : "w-full"}`}
      />
    </label>
  );
}

function Row({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={accent ? "text-(--color-accent)" : "text-(--color-dim)"}>{label}</span>
      <span className={`font-medium ${accent ? "text-(--color-accent)" : ""}`}>
        <Yen value={value} />
      </span>
    </div>
  );
}
