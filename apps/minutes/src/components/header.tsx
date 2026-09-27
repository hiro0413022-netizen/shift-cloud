import Link from "next/link";

export function Header({ name }: { name: string }) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <Link href="/" className="block">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
        <h1 className="text-2xl font-bold tracking-widest">議事録</h1>
      </Link>
      <form action="/api/logout" method="post">
        <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">{name} — ログアウト</button>
      </form>
    </header>
  );
}
