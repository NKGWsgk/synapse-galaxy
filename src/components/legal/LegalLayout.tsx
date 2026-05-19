import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  updated: string;
  children: ReactNode;
};

export function LegalLayout({ title, updated, children }: Props) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200/80 bg-white/95 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-indigo-500/80">Synapse</span>
            <span className="text-sm font-semibold text-zinc-900">Galaxy</span>
          </Link>
          <span className="text-zinc-300">›</span>
          <p className="text-sm font-medium text-zinc-700">{title}</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        <p className="mt-2 text-xs text-zinc-500">最終更新: {updated}</p>
        <div className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-zinc-700">
          {children}
        </div>
        <div className="mt-10 border-t border-zinc-200 pt-6">
          <Link href="/" className="text-sm font-medium text-indigo-600 transition hover:text-indigo-500">
            ← 銀河に戻る
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-zinc-900">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export { Section };
