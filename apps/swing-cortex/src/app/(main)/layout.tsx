import { requireCoachActor } from "@/lib/auth";
import Nav from "./nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireCoachActor();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-(--color-bg)">
      {/* トップバー */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-(--color-line) bg-(--color-panel)/90 px-5 py-3 backdrop-blur">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 4.9L18 9.7l-4.2 1.8L12 16l-1.8-4.5L6 9.7l4.2-1.8z" />
          </svg>
        </div>
        <div className="font-bold tracking-tight">
          SWING <span className="text-(--color-brand)">CORTEX</span>
        </div>
        <span className="ml-auto rounded-full border border-(--color-line) px-2 py-0.5 text-[10px] text-(--color-faint)">
          {actor.name}
        </span>
      </header>

      <div className="flex-1">{children}</div>
      <Nav />
    </div>
  );
}
