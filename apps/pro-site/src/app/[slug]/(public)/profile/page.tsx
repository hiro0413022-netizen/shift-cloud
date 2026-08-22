import { notFound } from "next/navigation";
import { getPro, listCareer, listClubs, listProfileItems } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "PROFILE" };

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const [items, career, clubs] = await Promise.all([listProfileItems(pro.id), listCareer(pro.id), listClubs(pro.id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-10">
      <section>
        <h1 className="sec-title mb-2 text-3xl font-bold">PROFILE</h1>
        <p className="mb-6 text-sm text-(--color-dim)">プロゴルファー {pro.name} プロフィール</p>
        {pro.profile_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pro.profile_image_url} alt={pro.name} className="mb-6 w-full max-w-sm rounded-xl" />
        ) : null}
        {items.length > 0 ? (
          <table className="w-full border-y border-(--color-line) text-sm">
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-(--color-line) last:border-b-0">
                  <th className="w-36 bg-(--color-panel) px-3 py-3 text-left font-bold">{it.label}</th>
                  <td className="px-3 py-3">{it.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      {pro.bio ? (
        <section>
          <h2 className="sec-title mb-4 text-2xl font-bold">BIOGRAPHY</h2>
          <div className="whitespace-pre-wrap text-[15px] leading-8">{pro.bio}</div>
        </section>
      ) : null}

      {career.length > 0 ? (
        <section>
          <h2 className="sec-title mb-4 text-2xl font-bold">CAREER</h2>
          <p className="mb-3 text-xs text-(--color-dim)">主な戦歴</p>
          <table className="w-full border-y border-(--color-line) text-sm">
            <thead>
              <tr className="border-b border-(--color-line) bg-(--color-panel) text-left text-xs">
                <th className="px-3 py-2">年度</th>
                <th className="px-3 py-2">競技名</th>
                <th className="px-3 py-2">成績</th>
              </tr>
            </thead>
            <tbody>
              {career.map((c) => (
                <tr key={c.id} className="border-b border-(--color-line) last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2.5 text-(--color-dim)">{c.season}</td>
                  <td className="px-3 py-2.5">{c.event}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 font-bold ${c.result === "優勝" ? "text-(--color-gold)" : ""}`}>{c.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {clubs.length > 0 ? (
        <section>
          <h2 className="sec-title mb-4 text-2xl font-bold">CLUB SETTING</h2>
          <p className="mb-3 text-xs text-(--color-dim)">クラブセッティング</p>
          <table className="w-full border-y border-(--color-line) text-sm">
            <tbody>
              {clubs.map((c) => (
                <tr key={c.id} className="border-b border-(--color-line) last:border-b-0">
                  <th className="w-40 bg-(--color-panel) px-3 py-3 text-left font-bold">{c.category}</th>
                  <td className="px-3 py-3">{c.item}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
