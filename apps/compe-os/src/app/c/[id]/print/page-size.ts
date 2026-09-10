/** 用紙サイズ（mm）。@page に流し込む */
const DIMS: Record<string, [number, number]> = {
  a4: [210, 297],
  a3: [297, 420],
  a2: [420, 594],
  a1: [594, 841],
};

export function pageCss(size = "a4", orient = "portrait"): string {
  const [w, h] = DIMS[size] ?? DIMS.a4;
  const [pw, ph] = orient === "landscape" ? [h, w] : [w, h];
  const font = size === "a1" ? "16pt" : size === "a2" ? "13pt" : size === "a3" ? "11pt" : "10pt";
  return `@page { size: ${pw}mm ${ph}mm; margin: 10mm; }
  .print-sheet { width: ${pw - 20}mm; font-size: ${font}; }
  @media screen { .print-sheet { background:#fff; margin:0 auto 16px; padding:8mm; box-shadow:0 2px 12px rgba(0,0,0,.08); } }`;
}

export const THEMES: Record<string, { bg: string; sub: string; accent: string; row: string }> = {
  green: { bg: "#1a6b3c", sub: "#2d9158", accent: "#f0a500", row: "#f0fff4" },
  navy: { bg: "#1a365d", sub: "#2c5282", accent: "#f6ad55", row: "#ebf4ff" },
  black: { bg: "#1a1a2e", sub: "#16213e", accent: "#e2b96f", row: "#f7f7f7" },
};
