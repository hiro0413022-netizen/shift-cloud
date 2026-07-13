/**
 * 進捗レーダーチャート（PGA NOTEユーザーアプリの「マイデータ」準拠 / 依存なしSVG）
 * サーバーでもクライアントでも描画可能な純粋コンポーネント。
 */
export function Radar({
  items,
  size = 280,
  stroke = "#5ea1e6",
  fill = "rgba(94,161,230,0.35)",
  grid = "#3a4150",
  label = "#8b94a5",
}: {
  items: { name: string; percent: number }[];
  size?: number;
  stroke?: string;
  fill?: string;
  grid?: string;
  label?: string;
}) {
  const n = Math.max(items.length, 3);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 34;
  const pt = (i: number, ratio: number): [number, number] => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(ang) * R * ratio, cy + Math.sin(ang) * R * ratio];
  };
  const ring = (ratio: number) =>
    Array.from({ length: n }, (_, i) => pt(i, ratio).join(",")).join(" ");
  const values = items.map((it, i) => pt(i, Math.max(0.02, it.percent / 100)).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-xs" role="img" aria-label="進捗レーダーチャート">
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={ring(r)} fill="none" stroke={grid} strokeWidth="1" />
      ))}
      {items.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={grid} strokeWidth="1" />;
      })}
      <polygon points={values} fill={fill} stroke={stroke} strokeWidth="2" />
      {items.map((it, i) => {
        const [x, y] = pt(i, 1.16);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={label}>
            {it.name.length > 6 ? it.name.slice(0, 6) : it.name}
          </text>
        );
      })}
    </svg>
  );
}
