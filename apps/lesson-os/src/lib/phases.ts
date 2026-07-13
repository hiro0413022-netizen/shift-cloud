/**
 * スイングフェーズ（DECISIONS #51）
 * 動画の「アドレス / テークバック / トップ / 切り返し / インパクト / フォロー / フィニッシュ」の
 * 位置を秒数で保持し、再生画面からワンタップで移動できるようにする。
 *
 * 決め方は「自動推定＋手動微調整」:
 *   1. インパクト = 打球音（音声の鋭いピーク）を検出 ← 一番確実な基準点
 *   2. 他の6点はインパクトからの相対時間で導出（一般的なスイングテンポ 3:1 に基づく）
 *   3. コーチが再生画面でズレを直せる（手動が常に優先・_method="manual"）
 * 音声が無い/デコードできない動画は尺の比率で仮置き（_method="ratio"）。
 */

export type PhaseKey = "address" | "takeback" | "top" | "downswing" | "impact" | "follow" | "finish";

export const PHASES: { key: PhaseKey; label: string; short: string }[] = [
  { key: "address", label: "アドレス", short: "AD" },
  { key: "takeback", label: "テークバック", short: "TB" },
  { key: "top", label: "トップ", short: "TOP" },
  { key: "downswing", label: "切り返し", short: "DS" },
  { key: "impact", label: "インパクト", short: "IMP" },
  { key: "follow", label: "フォロー", short: "FL" },
  { key: "finish", label: "フィニッシュ", short: "FIN" },
];

export type Phases = Partial<Record<PhaseKey, number>> & {
  _method?: "audio" | "ratio" | "manual";
  _at?: string;
};

/** インパクト基準の相対秒（バックスイング約0.8秒 / 切り返し〜インパクト約0.28秒） */
const OFFSET: Record<PhaseKey, number> = {
  address: -1.15,
  takeback: -0.72,
  top: -0.28,
  downswing: -0.12,
  impact: 0,
  follow: 0.18,
  finish: 0.8,
};

/** 音声が使えないときの尺比率フォールバック */
const RATIO: Record<PhaseKey, number> = {
  address: 0.1,
  takeback: 0.35,
  top: 0.5,
  downswing: 0.56,
  impact: 0.62,
  follow: 0.69,
  finish: 0.88,
};

export const hasPhases = (p?: Phases | null) => !!p && PHASES.some((f) => typeof p[f.key] === "number");

const clamp = (t: number, dur: number) => Math.max(0, Math.min(dur > 0 ? dur - 0.02 : t, Number(t.toFixed(3))));

/** インパクト秒＋尺から7点を導出 */
export function derive(impact: number, duration: number): Phases {
  const out: Phases = { _method: "audio", _at: new Date().toISOString() };
  for (const { key } of PHASES) out[key] = clamp(impact + OFFSET[key], duration);
  return out;
}

/** 尺だけから仮置き */
export function fromRatio(duration: number): Phases {
  const out: Phases = { _method: "ratio", _at: new Date().toISOString() };
  for (const { key } of PHASES) out[key] = clamp(duration * RATIO[key], duration);
  return out;
}

/**
 * 打球音の検出（ブラウザ専用）。
 * 5msごとのエネルギーを取り、直前100msの平均に対する「立ち上がりの鋭さ」が最大の点をインパクトとみなす。
 * ボールを打つ音はスイング中で最も鋭い破裂音なので、これで実用上ほぼ当たる。
 */
export async function detectImpact(source: Blob | string): Promise<{ impact: number; duration: number } | null> {
  try {
    const buf =
      source instanceof Blob
        ? await source.arrayBuffer()
        : await (await fetch(source)).arrayBuffer();
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf);
    void ctx.close();

    const sr = audio.sampleRate;
    const ch = audio.getChannelData(0);
    const duration = audio.duration;
    const win = Math.max(1, Math.round(sr * 0.005)); // 5ms
    const n = Math.floor(ch.length / win);
    if (n < 20) return null;

    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = i * win; j < (i + 1) * win; j++) s += ch[j] * ch[j];
      energy[i] = s / win;
    }

    const back = 20; // 直前100ms
    const from = Math.max(back, Math.floor((0.4 * sr) / win)); // 先頭0.4秒は無視（撮り始めの物音）
    const to = Math.max(from + 1, n - Math.floor((0.15 * sr) / win));
    let best = -1;
    let bestScore = 0;
    for (let i = from; i < to; i++) {
      let base = 0;
      for (let j = i - back; j < i; j++) base += energy[j];
      base = base / back + 1e-7;
      const score = (energy[i] / base) * Math.sqrt(energy[i]); // 鋭さ × 絶対音量
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || bestScore < 1e-4) return null; // 無音・ピークなし
    return { impact: (best * win) / sr, duration };
  } catch {
    return null; // 音声トラック無し / デコード非対応
  }
}

/** 自動推定（音声→だめなら尺比率）。durationHint は <video>.duration など */
export async function estimatePhases(source: Blob | string, durationHint?: number): Promise<Phases | null> {
  const hit = await detectImpact(source);
  if (hit && hit.duration > 0.5) return derive(hit.impact, hit.duration);
  const d = durationHint && isFinite(durationHint) && durationHint > 0.5 ? durationHint : null;
  return d ? fromRatio(d) : null;
}

/** DBに入れる前の正規化（数値7点＋_methodのみ通す） */
export function sanitizePhases(input: unknown, duration?: number): Phases {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: Phases = {};
  for (const { key } of PHASES) {
    const v = src[key];
    if (typeof v === "number" && isFinite(v) && v >= 0 && v < 3600) {
      out[key] = duration && duration > 0 ? clamp(v, duration) : Number(v.toFixed(3));
    }
  }
  const m = src._method;
  out._method = m === "audio" || m === "ratio" || m === "manual" ? m : "manual";
  out._at = new Date().toISOString();
  return out;
}

export const fmt = (t: number) => `${t.toFixed(2)}s`;
