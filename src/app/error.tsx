"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center text-zinc-900">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-500">Error</p>
      <h1 className="text-xl font-semibold">問題が発生しました</h1>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
        一時的なエラーの可能性があります。もう一度お試しください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        再読み込み
      </button>
    </div>
  );
}
