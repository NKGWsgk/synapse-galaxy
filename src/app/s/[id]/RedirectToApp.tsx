"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 人間のアクセスはそのままマップ（該当シナプスの詳細）へ送る。クローラーは JS を実行せず、この共有ページの OGP を読む。 */
export function RedirectToApp({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}
