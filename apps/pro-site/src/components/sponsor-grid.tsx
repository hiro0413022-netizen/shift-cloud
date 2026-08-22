import type { Sponsor } from "@/lib/data";

/**
 * スポンサーバナーの整列表示。サイズ混在でもきれいに見えるよう
 * 大（1列）→中（2列）→小（3列）の順にグループで並べ、
 * 各カードは白地＋余白＋object-contain（縦横比を崩さない）で統一する。
 */
function Card({ b, imgClass }: { b: Sponsor; imgClass: string }) {
  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.image_url} alt={b.name} loading="lazy" className={`${imgClass} w-full object-contain`} />
  );
  const cardClass =
    "flex items-center justify-center rounded-xl border border-(--color-line) bg-white p-4 transition hover:shadow-md";
  return b.link_url ? (
    <a href={b.link_url} target="_blank" rel="noopener noreferrer" title={b.name} className={cardClass}>
      {inner}
    </a>
  ) : (
    <div title={b.name} className={cardClass}>
      {inner}
    </div>
  );
}

export default function SponsorGrid({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;
  const large = sponsors.filter((b) => b.size === "large");
  const medium = sponsors.filter((b) => b.size === "medium");
  const small = sponsors.filter((b) => b.size === "small");

  return (
    <div className="space-y-4">
      {large.length > 0 ? (
        <div className="grid gap-4">
          {large.map((b) => (
            <Card key={b.id} b={b} imgClass="h-20 md:h-28" />
          ))}
        </div>
      ) : null}
      {medium.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {medium.map((b) => (
            <Card key={b.id} b={b} imgClass="h-14 md:h-20" />
          ))}
        </div>
      ) : null}
      {small.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
          {small.map((b) => (
            <Card key={b.id} b={b} imgClass="h-10 md:h-14" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
