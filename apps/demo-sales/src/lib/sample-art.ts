// サンプル画像（インラインSVGイラスト）— 写真未アップロード時のプレースホルダ。
// 方針:
//  - 素材ルール（#54）: 既存サイトの写真・フリー素材DLは使わず、自前のSVGイラストで「完成イメージ」を見せる
//  - テンプレートの配色（palette）を受け取り、業種の雰囲気に自動で馴染む
//  - data URI で埋め込むため単一ファイルHTML・オフライン成立を維持
//  - すべてに「※仮画像」ラベルを入れ、正式制作時に実写真へ差し替える前提を隠さない
//  - 実写真（brief.heroImage 等）があれば常にそちらが優先される（render-demo側で制御）

export interface Palette {
  primary: string;
  dark: string;
  soft: string;
  accent: string;
}

const uri = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\s+/g, " ").trim());

// 右下の「※仮画像」ラベル
const stamp = (w: number, h: number, fs = 18) =>
  `<g opacity="0.75"><rect x="${w - fs * 8.2}" y="${h - fs * 2.2}" width="${fs * 7.6}" height="${fs * 1.7}" rx="${fs * 0.5}" fill="#ffffff" opacity="0.85"/><text x="${w - fs * 4.4}" y="${h - fs * 1}" font-family="sans-serif" font-size="${fs}" fill="#6b7280" text-anchor="middle">※仮画像（サンプル）</text></g>`;

// 観葉植物
const plant = (x: number, y: number, s: number, p: Palette) =>
  `<g transform="translate(${x},${y}) scale(${s})">
    <rect x="-16" y="0" width="32" height="26" rx="4" fill="${p.dark}" opacity="0.55"/>
    <path d="M0 2 C -6 -26 -26 -30 -30 -18 C -18 -20 -8 -12 0 2" fill="${p.accent}"/>
    <path d="M0 2 C 6 -30 28 -34 32 -20 C 20 -22 8 -12 0 2" fill="${p.primary}" opacity="0.8"/>
    <path d="M0 2 C -2 -34 4 -44 12 -44 C 8 -32 6 -16 0 2" fill="${p.accent}" opacity="0.9"/>
  </g>`;

// 十字マーク（医療サイン）
const crossSign = (x: number, y: number, s: number, color: string) =>
  `<g transform="translate(${x},${y}) scale(${s})"><circle r="20" fill="#ffffff"/><rect x="-11" y="-4" width="22" height="8" rx="2" fill="${color}"/><rect x="-4" y="-11" width="8" height="22" rx="2" fill="${color}"/></g>`;

/** ヒーロー背景（1600x900）— 明るい院内イメージ。文字は render 側で上に載せる（lightスタイル前提） */
export function sampleHero(p: Palette, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="${p.soft}"/>
    <rect y="620" width="1600" height="280" fill="#ffffff" opacity="0.65"/>
    <rect x="960" y="120" width="520" height="500" rx="14" fill="#ffffff" opacity="0.9"/>
    <rect x="985" y="145" width="220" height="210" fill="${p.accent}" opacity="0.35"/>
    <rect x="1235" y="145" width="220" height="210" fill="${p.accent}" opacity="0.25"/>
    <rect x="985" y="385" width="220" height="210" fill="${p.accent}" opacity="0.2"/>
    <rect x="1235" y="385" width="220" height="210" fill="${p.accent}" opacity="0.3"/>
    <circle cx="1105" cy="230" r="52" fill="#ffffff" opacity="0.85"/>
    <rect x="180" y="480" width="560" height="190" rx="16" fill="${p.primary}" opacity="0.85"/>
    <rect x="180" y="452" width="560" height="34" rx="10" fill="${p.dark}" opacity="0.9"/>
    ${crossSign(250, 380, 1.6, p.primary)}
    <text x="460" y="400" font-family="sans-serif" font-size="46" fill="${p.dark}" opacity="0.8">${emoji}</text>
    <circle cx="330" cy="180" r="10" fill="${p.accent}" opacity="0.5"/>
    <circle cx="620" cy="140" r="16" fill="${p.accent}" opacity="0.35"/>
    <circle cx="840" cy="220" r="8" fill="${p.primary}" opacity="0.4"/>
    ${plant(880, 660, 2.2, p)}
    ${plant(120, 690, 1.7, p)}
    <rect x="0" y="860" width="1600" height="40" fill="${p.dark}" opacity="0.08"/>
    ${stamp(1600, 900, 26)}
  </svg>`;
  return uri(svg);
}

/** 院長・スタッフ写真の代替（600x600）— 顔を描かない抽象シルエット */
export function samplePortrait(p: Palette): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
    <rect width="600" height="600" fill="${p.soft}"/>
    <circle cx="300" cy="240" r="110" fill="${p.accent}" opacity="0.9"/>
    <path d="M110 600 C 120 430 210 380 300 380 C 390 380 480 430 490 600 Z" fill="#ffffff"/>
    <path d="M300 380 L 240 600 L 360 600 Z" fill="${p.primary}" opacity="0.35"/>
    <path d="M150 600 C 165 460 230 405 300 400 L 300 600 Z" fill="#ffffff" stroke="${p.accent}" stroke-width="3" opacity="0.9"/>
    <path d="M450 600 C 435 460 370 405 300 400 L 300 600 Z" fill="#ffffff" stroke="${p.accent}" stroke-width="3" opacity="0.9"/>
    <circle cx="300" cy="470" r="12" fill="${p.primary}" opacity="0.7"/>
    ${stamp(600, 600, 20)}
  </svg>`;
  return uri(svg);
}

/** アクセス地図の代替（800x600） */
export function sampleMap(p: Palette): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="#f2f4f0"/>
    <rect x="40" y="40" width="300" height="200" rx="8" fill="${p.soft}"/>
    <rect x="420" y="60" width="330" height="160" rx="8" fill="${p.soft}"/>
    <rect x="60" y="330" width="260" height="220" rx="8" fill="${p.soft}"/>
    <rect x="430" y="320" width="320" height="230" rx="8" fill="${p.soft}"/>
    <rect x="0" y="255" width="800" height="46" fill="#ffffff"/>
    <rect x="360" y="0" width="44" height="600" fill="#ffffff"/>
    <rect x="0" y="268" width="800" height="6" fill="#e5e7eb"/>
    <rect x="379" y="0" width="6" height="600" fill="#e5e7eb"/>
    <rect x="540" y="240" width="140" height="76" rx="10" fill="${p.dark}" opacity="0.85"/>
    <text x="610" y="288" font-family="sans-serif" font-size="30" fill="#ffffff" text-anchor="middle">駅</text>
    <g transform="translate(200,250)">
      <path d="M0 60 C -46 6 -30 -52 0 -52 C 30 -52 46 6 0 60" fill="${p.primary}"/>
      <circle cy="-16" r="16" fill="#ffffff"/>
    </g>
    <text x="200" y="345" font-family="sans-serif" font-size="24" fill="${p.dark}" text-anchor="middle" font-weight="bold">当院（※仮の位置）</text>
    <text x="400" y="580" font-family="sans-serif" font-size="20" fill="#6b7280" text-anchor="middle">正式制作時にGoogleマップを掲載します</text>
    ${stamp(800, 600, 20)}
  </svg>`;
  return uri(svg);
}

// ---- ギャラリー用シーン（800x600）----

function sceneReception(p: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${p.soft}"/>
    <rect y="430" width="800" height="170" fill="#ffffff" opacity="0.7"/>
    <rect x="120" y="300" width="560" height="150" rx="12" fill="${p.primary}" opacity="0.9"/>
    <rect x="120" y="276" width="560" height="30" rx="8" fill="${p.dark}"/>
    <rect x="330" y="180" width="140" height="70" rx="10" fill="#ffffff"/>
    <text x="400" y="226" font-family="sans-serif" font-size="30" fill="${p.dark}" text-anchor="middle" font-weight="bold">受付</text>
    <rect x="180" y="330" width="90" height="56" rx="6" fill="#ffffff" opacity="0.35"/>
    <rect x="530" y="330" width="90" height="56" rx="6" fill="#ffffff" opacity="0.35"/>
    ${crossSign(400, 110, 1.3, p.primary)}
    ${plant(720, 520, 1.8, p)}
    ${stamp(800, 600, 20)}
  </svg>`;
}

function sceneWaiting(p: Palette): string {
  const chair = (x: number) =>
    `<g transform="translate(${x},390)"><rect x="-38" y="-64" width="76" height="60" rx="10" fill="${p.primary}"/><rect x="-38" y="-4" width="76" height="16" rx="6" fill="${p.dark}"/><rect x="-32" y="12" width="10" height="46" fill="${p.dark}" opacity="0.7"/><rect x="22" y="12" width="10" height="46" fill="${p.dark}" opacity="0.7"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${p.soft}"/>
    <rect y="450" width="800" height="150" fill="#ffffff" opacity="0.7"/>
    <rect x="80" y="90" width="280" height="200" rx="10" fill="#ffffff" opacity="0.9"/>
    <rect x="100" y="110" width="115" height="160" fill="${p.accent}" opacity="0.35"/>
    <rect x="230" y="110" width="115" height="160" fill="${p.accent}" opacity="0.25"/>
    <circle cx="160" cy="160" r="26" fill="#ffffff" opacity="0.9"/>
    ${chair(480)}${chair(580)}${chair(680)}
    <rect x="470" y="120" width="240" height="110" rx="10" fill="#ffffff" opacity="0.85"/>
    <text x="590" y="165" font-family="sans-serif" font-size="24" fill="${p.dark}" text-anchor="middle" font-weight="bold">ご案内</text>
    <rect x="500" y="185" width="180" height="10" rx="5" fill="${p.accent}" opacity="0.5"/>
    <rect x="500" y="203" width="140" height="10" rx="5" fill="${p.accent}" opacity="0.35"/>
    ${plant(150, 520, 2, p)}
    ${stamp(800, 600, 20)}
  </svg>`;
}

function sceneExam(p: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${p.soft}"/>
    <rect y="440" width="800" height="160" fill="#ffffff" opacity="0.7"/>
    <rect x="90" y="330" width="330" height="46" rx="14" fill="${p.accent}"/>
    <rect x="110" y="376" width="16" height="90" fill="${p.dark}" opacity="0.7"/>
    <rect x="384" y="376" width="16" height="90" fill="${p.dark}" opacity="0.7"/>
    <rect x="96" y="300" width="90" height="34" rx="10" fill="#ffffff"/>
    <rect x="520" y="250" width="190" height="126" rx="10" fill="${p.primary}" opacity="0.9"/>
    <rect x="545" y="272" width="140" height="60" rx="6" fill="#ffffff" opacity="0.9"/>
    <polyline points="555,302 575,302 585,282 600,322 615,292 630,302 675,302" fill="none" stroke="${p.primary}" stroke-width="5"/>
    <rect x="560" y="376" width="110" height="90" fill="${p.dark}" opacity="0.35"/>
    <circle cx="470" cy="420" r="30" fill="${p.dark}" opacity="0.5"/>
    <rect x="464" y="450" width="12" height="34" fill="${p.dark}" opacity="0.5"/>
    ${crossSign(180, 130, 1.1, p.primary)}
    <rect x="300" y="100" width="200" height="12" rx="6" fill="${p.accent}" opacity="0.4"/>
    ${stamp(800, 600, 20)}
  </svg>`;
}

function sceneEquipment(p: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${p.soft}"/>
    <rect y="460" width="800" height="140" fill="#ffffff" opacity="0.7"/>
    <rect x="250" y="140" width="300" height="330" rx="16" fill="#ffffff"/>
    <rect x="280" y="170" width="240" height="150" rx="8" fill="${p.dark}" opacity="0.85"/>
    <polyline points="300,245 340,245 355,205 375,285 395,225 410,245 500,245" fill="none" stroke="${p.accent}" stroke-width="6"/>
    <circle cx="310" cy="360" r="14" fill="${p.primary}"/>
    <circle cx="350" cy="360" r="14" fill="${p.accent}"/>
    <rect x="390" y="348" width="110" height="24" rx="8" fill="${p.soft}"/>
    <rect x="280" y="400" width="240" height="14" rx="7" fill="${p.soft}"/>
    <rect x="600" y="300" width="120" height="170" rx="10" fill="${p.primary}" opacity="0.5"/>
    <rect x="615" y="320" width="90" height="30" rx="6" fill="#ffffff" opacity="0.8"/>
    <rect x="615" y="360" width="90" height="30" rx="6" fill="#ffffff" opacity="0.6"/>
    ${plant(120, 520, 2, p)}
    ${stamp(800, 600, 20)}
  </svg>`;
}

function sceneCorridor(p: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${p.soft}"/>
    <rect y="470" width="800" height="130" fill="#ffffff" opacity="0.75"/>
    <rect x="110" y="170" width="150" height="300" rx="8" fill="#ffffff"/>
    <rect x="118" y="178" width="134" height="284" rx="6" fill="${p.accent}" opacity="0.25"/>
    <circle cx="238" cy="320" r="7" fill="${p.dark}"/>
    <rect x="330" y="170" width="150" height="300" rx="8" fill="#ffffff"/>
    <rect x="338" y="178" width="134" height="284" rx="6" fill="${p.accent}" opacity="0.35"/>
    <circle cx="458" cy="320" r="7" fill="${p.dark}"/>
    <rect x="140" y="120" width="90" height="34" rx="8" fill="${p.primary}"/>
    <text x="185" y="144" font-family="sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">診察室1</text>
    <rect x="360" y="120" width="90" height="34" rx="8" fill="${p.primary}"/>
    <text x="405" y="144" font-family="sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">診察室2</text>
    <rect x="560" y="140" width="170" height="240" rx="10" fill="#ffffff" opacity="0.9"/>
    <rect x="575" y="155" width="65" height="100" fill="${p.accent}" opacity="0.3"/>
    <rect x="650" y="155" width="65" height="100" fill="${p.accent}" opacity="0.2"/>
    ${plant(690, 520, 1.9, p)}
    <circle cx="270" cy="70" r="12" fill="#ffffff" opacity="0.9"/>
    <circle cx="500" cy="70" r="12" fill="#ffffff" opacity="0.9"/>
    ${stamp(800, 600, 20)}
  </svg>`;
}

function sceneExterior(p: Palette, emoji: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${p.soft}"/>
    <rect y="470" width="800" height="130" fill="#d1d5db" opacity="0.4"/>
    <rect x="140" y="150" width="520" height="320" rx="8" fill="#ffffff"/>
    <rect x="140" y="150" width="520" height="50" fill="${p.primary}"/>
    <text x="400" y="186" font-family="sans-serif" font-size="26" fill="#ffffff" text-anchor="middle">CLINIC（※仮の外観）</text>
    <rect x="180" y="240" width="110" height="110" fill="${p.accent}" opacity="0.3"/>
    <rect x="330" y="240" width="110" height="110" fill="${p.accent}" opacity="0.25"/>
    <rect x="480" y="240" width="150" height="230" rx="6" fill="${p.accent}" opacity="0.4"/>
    <rect x="545" y="300" width="12" height="60" rx="6" fill="${p.dark}" opacity="0.6"/>
    ${crossSign(700, 130, 1.5, p.primary)}
    <text x="230" y="430" font-family="sans-serif" font-size="34">${emoji}</text>
    <circle cx="90" cy="420" r="46" fill="${p.accent}" opacity="0.7"/>
    <rect x="84" y="450" width="12" height="46" fill="${p.dark}" opacity="0.6"/>
    <circle cx="690" cy="60" r="34" fill="#ffffff" opacity="0.8"/>
    ${stamp(800, 600, 20)}
  </svg>`;
}

/** ギャラリー6枚（写真が1枚もない場合の差し込み用） */
export function sampleGallery(p: Palette, emoji: string): { url: string; caption: string }[] {
  return [
    { url: uri(sceneExterior(p, emoji)), caption: "外観（※仮画像 — 実際の写真に差し替えます）" },
    { url: uri(sceneReception(p)), caption: "受付（※仮画像）" },
    { url: uri(sceneWaiting(p)), caption: "待合スペース（※仮画像）" },
    { url: uri(sceneExam(p)), caption: "診察室（※仮画像）" },
    { url: uri(sceneEquipment(p)), caption: "検査・設備（※仮画像）" },
    { url: uri(sceneCorridor(p)), caption: "院内の様子（※仮画像）" },
  ];
}
