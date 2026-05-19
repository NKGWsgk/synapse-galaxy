import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center text-zinc-900">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-500">404</p>
      <h1 className="text-xl font-semibold">ページが見つかりません</h1>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
        URLが間違っているか、削除されたページの可能性があります。
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        銀河に戻る
      </Link>
    </div>
  );
}
