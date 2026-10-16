import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME_EN, SITE_NAME_JA } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  title: "「いいね！」アワード",
  description:
    "SYNAPSE Galaxy「いいね！」アワード開催中。11月11日〜25日の期間に「接続レビュー」を投稿して、いいね数を競おう。上位3名にAmazonギフトカードをプレゼント！",
  alternates: {
    canonical: "/news/like-award",
  },
};

const prizes = [
  { rank: "第1位", icon: "🥇", amount: "3,000円分", tone: "border-violet-400 bg-violet-900/30 text-violet-200" },
  { rank: "第2位", icon: "🥈", amount: "1,500円分", tone: "border-zinc-200 bg-zinc-50 text-zinc-700" },
  { rank: "第3位", icon: "🥉", amount: "500円分", tone: "border-orange-200 bg-orange-50 text-orange-700" },
] as const;

const rules = [
  {
    title: "①ご自身の投稿へのいいね",
    body: "1アカウントにつき1回、自身の記事に「いいね」を押すことはシステム上認められています。",
  },
  {
    title: "②ランキングの最終決定について",
    body: "最終順位は、画面上のいいね数をベースとしつつ、運営による「不正アクセスのチェック（同一IPからの連続投票などがないか）」および「記事のクオリティ審査」を掛け合わせた総合評価で確定いたします。",
  },
  {
    title: "③不正行為の禁止",
    body: "複数端末を用いた自作自演の投票、または特定のグループ間での組織的な相互投票など、不審なログが検知された場合は、運営の判断により該当記事のエントリーを無効（またはアカウント停止）といたします。",
  },
] as const;

const scheduleItems = [
  {
    phase: "告知・準備期間",
    date: "11月1日〜11月10日",
    body: "キャンペーン告知期間です。Googleアカウントでログインしてシナプス投稿の準備をしましょう。",
    active: false,
  },
  {
    phase: "レビューエントリー期間",
    date: "11月11日〜25日",
    body: "期間中にサイト内で投稿されたシナプス（接続レビュー）が、すべて自動的にランキング対象となります。期間中であれば何件でも投稿できます。",
    active: true,
  },
  {
    phase: "いいね集計・審査期間",
    date: "11月25日〜12月1日",
    body: "新規エントリー受付がストップし、公開されたレビューへの「いいね」集計に特化する期間です。運営にてアクセスログの確認およびレビュー内容の品質審査を行います。",
    active: false,
  },
  {
    phase: "受賞者発表・ギフトカード送付",
    date: "12月3日ごろ",
    body: "サイト上にて上位3名を発表します。該当者の登録メールアドレス宛にAmazonギフトカードのデジタルコードを送付いたします。",
    active: false,
  },
];

export default function LikeAwardNewsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-950/90 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-indigo-400/80">Synapse</span>
            <span className="text-sm font-semibold text-white">Galaxy</span>
          </Link>
          <span className="text-zinc-600">›</span>
          <p className="text-sm font-medium text-zinc-400">News</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-purple-900 to-zinc-900 px-6 py-12 sm:px-10 sm:py-16 text-center shadow-2xl">
          {/* decorative glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(139,92,246,0.35),transparent_70%)]" />

          <p className="relative mb-5 inline-flex rounded-full border border-indigo-400/40 bg-indigo-500/20 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-indigo-300">
            Open Campaign
          </p>

          <h1 className="relative text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            🏆 「いいね！」アワード
          </h1>
          <p className="relative mt-2 text-lg font-semibold text-indigo-200 sm:text-xl">
            『{SITE_NAME_EN}』オープン記念
          </p>
          <p className="relative mt-4 text-base font-bold text-fuchsia-300 sm:text-lg">
            Amazonギフトカード 最大3,000円プレゼント！
          </p>
          <p className="relative mt-4 max-w-xl mx-auto text-sm leading-7 text-zinc-300">
            作品と作品をつなぐ「接続レビュー（シナプス）」を投稿して、読者からいいねを集めよう。
            上位3名のレビュワーにAmazonギフトカードを贈呈します。
          </p>

          {/* Primary CTA */}
          <div className="relative mt-8 flex flex-col items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-purple-900/50 transition hover:from-indigo-400 hover:to-purple-400 hover:shadow-purple-800/60"
            >
              エントリーして投稿する →
            </Link>
            <p className="text-xs text-zinc-400">
              期間中（11月11日〜25日）に投稿すれば自動エントリー！
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-10">

          {/* Prize section */}
          <section>
            <h2 className="text-lg font-bold text-white">プレゼント内容</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              読者から獲得した「いいね！」数をベースに、上位3名のレビュワーへAmazonギフトカード（デジタルコード）を贈呈します。
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {/* 1st */}
              <div className="relative overflow-hidden rounded-2xl border border-violet-400/40 bg-gradient-to-br from-violet-600/25 via-fuchsia-600/15 to-zinc-900 p-5 shadow-lg shadow-violet-900/30">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(167,139,250,0.2),transparent_70%)]" />
                <p className="relative text-3xl" aria-hidden>🥇</p>
                <p className="relative mt-3 text-xs font-semibold text-violet-300/80">第1位</p>
                <p className="relative text-xl font-extrabold text-violet-200">ギフトカード</p>
                <p className="relative text-2xl font-extrabold text-violet-300">3,000円分</p>
              </div>
              {/* Silver */}
              <div className="relative overflow-hidden rounded-2xl border border-zinc-500/40 bg-gradient-to-br from-zinc-400/20 via-slate-500/10 to-zinc-900 p-5 shadow-lg shadow-zinc-800/20">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(148,163,184,0.15),transparent_70%)]" />
                <p className="relative text-3xl" aria-hidden>🥈</p>
                <p className="relative mt-3 text-xs font-semibold text-zinc-300/80">第2位</p>
                <p className="relative text-xl font-extrabold text-zinc-200">ギフトカード</p>
                <p className="relative text-2xl font-extrabold text-zinc-300">1,500円分</p>
              </div>
              {/* 3rd */}
              <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-600/20 via-purple-700/10 to-zinc-900 p-5 shadow-lg shadow-fuchsia-900/20">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(217,70,239,0.15),transparent_70%)]" />
                <p className="relative text-3xl" aria-hidden>🥉</p>
                <p className="relative mt-3 text-xs font-semibold text-fuchsia-300/80">第3位</p>
                <p className="relative text-xl font-extrabold text-fuchsia-200">ギフトカード</p>
                <p className="relative text-2xl font-extrabold text-fuchsia-300">500円分</p>
              </div>
            </div>
          </section>

          {/* Schedule timeline */}
          <section>
            <h2 className="text-lg font-bold text-white">スケジュール</h2>
            <div className="relative mt-5 pl-6">
              {/* vertical line */}
              <div className="absolute left-[9px] top-3 bottom-3 w-px bg-gradient-to-b from-indigo-500/60 via-purple-500/40 to-zinc-700/30" />

              <div className="space-y-6">
                {scheduleItems.map((item) => (
                  <div key={item.phase} className="relative">
                    {/* dot */}
                    <div
                      className={`absolute -left-6 top-1.5 h-[18px] w-[18px] rounded-full border-2 ${
                        item.active
                          ? "border-indigo-400 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                          : "border-zinc-600 bg-zinc-800"
                      }`}
                    />
                    <div
                      className={`rounded-2xl border px-5 py-4 ${
                        item.active
                          ? "border-indigo-500/50 bg-indigo-500/10 shadow-md shadow-indigo-900/30"
                          : "border-zinc-700/50 bg-zinc-800/50"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${item.active ? "text-indigo-300" : "text-zinc-500"}`}>
                        {item.date}
                      </p>
                      <h3 className={`mt-0.5 font-bold ${item.active ? "text-indigo-100" : "text-zinc-300"}`}>
                        {item.phase}
                        {item.active && (
                          <span className="ml-2 inline-flex rounded-full bg-indigo-500/30 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                            NOW
                          </span>
                        )}
                      </h3>
                      <p className="mt-1.5 text-sm leading-7 text-zinc-400">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Rules */}
          <section>
            <h2 className="text-lg font-bold text-white">応募規約 ＆ 注意事項</h2>
            <div className="mt-4 space-y-3">
              {rules.map((rule) => (
                <div key={rule.title} className="rounded-2xl border border-zinc-700/50 bg-zinc-800/50 px-5 py-4">
                  <h3 className="font-semibold text-zinc-200">{rule.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">{rule.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Bottom CTA */}
          <div className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-900/60 via-purple-900/40 to-zinc-900/60 px-6 py-10 text-center shadow-xl shadow-purple-900/20">
            <p className="text-base font-semibold text-zinc-200">参加方法はカンタン！</p>
            <p className="mt-1 text-sm text-zinc-400">
              Googleアカウントでログインして、11月11日〜25日の間にシナプスを投稿するだけ。
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-purple-900/50 transition hover:from-indigo-400 hover:to-purple-400"
              >
                エントリーして投稿する →
              </Link>
              <p className="text-xs text-zinc-500">
                期間中（11月11日〜25日）に投稿すれば自動エントリー！
              </p>
            </div>
          </div>

        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-6">
          <Link href="/" className="text-sm font-medium text-indigo-400 transition hover:text-indigo-300">
            ← 銀河に戻る
          </Link>
          <p className="text-xs text-zinc-600">
            {SITE_NAME_JA} Campaign News
          </p>
        </div>
      </main>
    </div>
  );
}
