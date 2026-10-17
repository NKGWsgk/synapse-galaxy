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
  { rank: "第1位", icon: "🥇", amount: "3,000円分", borderColor: "border-l-[#1A1B50]", bg: "bg-white" },
  { rank: "第2位", icon: "🥈", amount: "1,500円分", borderColor: "border-l-zinc-300", bg: "bg-white" },
  { rank: "第3位", icon: "🥉", amount: "500円分", borderColor: "border-l-[#C026D3]", bg: "bg-white" },
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
    <div className="min-h-screen bg-white text-[#0D0D1C]">
      {/* Header */}
      <header className="border-b border-[#1A1B50]/10 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-[#1A1B50]/80">Synapse</span>
            <span className="text-sm font-semibold text-[#0D0D1C]">Galaxy</span>
          </Link>
          <span className="text-zinc-400">›</span>
          <p className="text-sm font-medium text-zinc-500">News</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-[4px] bg-[#1A1B50] px-6 py-12 sm:px-10 sm:py-16 text-center shadow-lg shadow-[#1A1B50]/20">
          {/* decorative glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.08),transparent_70%)]" />

          <p className="relative mb-5 inline-flex rounded-[4px] border border-white/20 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/80">
            Open Campaign
          </p>

          <h1 className="relative text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            「いいね！」アワード
          </h1>
          <p className="relative mt-2 text-lg font-semibold text-white/70 sm:text-xl">
            『{SITE_NAME_EN}』オープン記念
          </p>
          <p className="relative mt-4 text-base font-bold text-[#C026D3] sm:text-lg">
            Amazonギフトカード 最大3,000円プレゼント！
          </p>
          <p className="relative mt-4 max-w-xl mx-auto text-sm leading-7 text-white/60">
            作品と作品をつなぐ「接続レビュー（シナプス）」を投稿して、読者からいいねを集めよう。
            上位3名のレビュワーにAmazonギフトカードを贈呈します。
          </p>

          {/* Primary CTA */}
          <div className="relative mt-8 flex flex-col items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-[4px] bg-white px-8 py-3.5 text-base font-bold text-[#1A1B50] shadow-lg shadow-[#1A1B50]/30 transition hover:bg-white/90"
            >
              エントリーして投稿する →
            </Link>
            <p className="text-xs text-white/50">
              期間中（11月11日〜25日）に投稿すれば自動エントリー！
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-10">

          {/* Prize section */}
          <section>
            <h2 className="text-lg font-bold text-[#0D0D1C]">プレゼント内容</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-500">
              読者から獲得した「いいね！」数をベースに、上位3名のレビュワーへAmazonギフトカード（デジタルコード）を贈呈します。
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {prizes.map((prize) => (
                <div key={prize.rank} className={`relative rounded-[4px] border-l-2 border border-[#1A1B50]/10 ${prize.borderColor} ${prize.bg} p-5 shadow-sm`}>
                  <p className="text-3xl" aria-hidden>{prize.icon}</p>
                  <p className="mt-3 text-xs font-semibold text-zinc-500">{prize.rank}</p>
                  <p className="text-xl font-extrabold text-[#0D0D1C]">ギフトカード</p>
                  <p className="text-2xl font-extrabold text-[#1A1B50]">{prize.amount}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Schedule timeline */}
          <section>
            <h2 className="text-lg font-bold text-[#0D0D1C]">スケジュール</h2>
            <div className="relative mt-5 pl-6">
              {/* vertical line */}
              <div className="absolute left-[9px] top-3 bottom-3 w-px bg-[#1A1B50]/20" />

              <div className="space-y-6">
                {scheduleItems.map((item) => (
                  <div key={item.phase} className="relative">
                    {/* dot */}
                    <div
                      className={`absolute -left-6 top-1.5 h-[18px] w-[18px] rounded-full border-2 ${
                        item.active
                          ? "border-[#1A1B50] bg-[#1A1B50] shadow-[0_0_8px_rgba(26,27,80,0.4)]"
                          : "border-zinc-300 bg-zinc-100"
                      }`}
                    />
                    <div
                      className={`rounded-[4px] border px-5 py-4 ${
                        item.active
                          ? "border-[#1A1B50]/20 bg-[#1A1B50]/5"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${item.active ? "text-[#1A1B50]" : "text-zinc-500"}`}>
                        {item.date}
                      </p>
                      <h3 className={`mt-0.5 font-bold ${item.active ? "text-[#0D0D1C]" : "text-zinc-600"}`}>
                        {item.phase}
                        {item.active && (
                          <span className="ml-2 inline-flex rounded-[4px] bg-[#1A1B50]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1A1B50]">
                            NOW
                          </span>
                        )}
                      </h3>
                      <p className="mt-1.5 text-sm leading-7 text-zinc-500">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Rules */}
          <section>
            <h2 className="text-lg font-bold text-[#0D0D1C]">応募規約 ＆ 注意事項</h2>
            <div className="mt-4 space-y-3">
              {rules.map((rule) => (
                <div key={rule.title} className="rounded-[4px] border-l-2 border-l-[#1A1B50]/30 bg-zinc-50 px-5 py-4">
                  <h3 className="font-semibold text-[#0D0D1C]">{rule.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-500">{rule.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Bottom CTA */}
          <div className="rounded-[4px] border border-[#1A1B50]/12 bg-[#F8F8FB] px-6 py-10 text-center">
            <p className="text-base font-semibold text-[#0D0D1C]">参加方法はカンタン！</p>
            <p className="mt-1 text-sm text-zinc-500">
              Googleアカウントでログインして、11月11日〜25日の間にシナプスを投稿するだけ。
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-[4px] bg-[#1A1B50] px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-[#1A1B50]/20 transition hover:bg-[#2D2F7A]"
              >
                エントリーして投稿する →
              </Link>
              <p className="text-xs text-zinc-500">
                期間中（11月11日〜25日）に投稿すれば自動エントリー！
              </p>
            </div>
          </div>

        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6">
          <Link href="/" className="text-sm font-medium text-[#1A1B50] transition hover:text-[#2D2F7A]">
            ← 銀河に戻る
          </Link>
          <p className="text-xs text-zinc-400">
            {SITE_NAME_JA} Campaign News
          </p>
        </div>
      </main>
    </div>
  );
}
