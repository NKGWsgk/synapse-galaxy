"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import type { User } from "@supabase/supabase-js";
import { GoogleSignInButton } from "./GoogleSignInButton";

type Props = {
  onUser?: (user: User | null) => void;
};

export function AuthPanel({ onUser }: Props) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      onUser?.(data.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      onUser?.(u);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, onUser]);

  async function signOut() {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <a href={`/user/${user.id}`} title="マイページ">
          <img
            src={user.user_metadata?.avatar_url ?? `https://api.dicebear.com/7.x/initials/svg?seed=${user.email}`}
            alt={user.user_metadata?.nickname ?? user.user_metadata?.full_name ?? user.email ?? "user"}
            className="h-7 w-7 rounded-full border border-zinc-200 object-cover transition hover:ring-2 hover:ring-indigo-300"
          />
        </a>
        <button
          type="button"
          onClick={signOut}
          disabled={loading}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
        >
          ログアウト
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <GoogleSignInButton
        visualClassName="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
        disabled={loading}
        onSuccess={() => setLoading(false)}
        onError={() => setLoading(false)}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Googleでログイン
      </GoogleSignInButton>
      <p className="text-[10px] leading-snug text-zinc-400">
        ログインすると
        <Link href="/terms" className="mx-0.5 text-indigo-600 hover:underline">利用規約</Link>
        と
        <Link href="/privacy" className="mx-0.5 text-indigo-600 hover:underline">プライバシーポリシー</Link>
        に同意したものとみなします。
      </p>
    </div>
  );
}
