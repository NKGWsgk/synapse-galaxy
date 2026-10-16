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
  { rank: "第1位", icon: "🥇", amount: "3,000円分", tone: "border-amber-200 bg-amber-50 text-amber-700" },
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

export default function LikeAwardNewsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200/80 bg-white/95 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-indigo-500/80">Synapse</span>
            <span className="text-sm font-semibold text-zinc-900">Galaxy</span>
          </Link>
          <span className="text-zinc-300">›</span>
          <p className="text-sm font-medium text-zinc-700">News</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <article className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-gradient-to-br from-indigo-50 via-white to-amber-50 px-5 py-8 sm:px-8 sm:py-10">
            <p className="mb-4 inline-flex rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-600">
              Open Campaign
            </p>
            <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-950 sm:text-3xl">
              『{SITE_NAME_EN}』オープン記念！
              <br />
              「いいね！」アワード！！
            </h1>
            <p className="mt-4 text-lg font-semibold text-amber-600">
              Amazonギフトカード3,000円プレゼント！
            </p>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-700">
              『{SITE_NAME_EN}』では、読者から最も多くの「いいね」を獲得したレビューを表彰するランキングアワードを開催します。
            </p>
          </div>

          <div className="space-y-8 px-5 py-8 text-sm leading-7 text-zinc-700 sm:px-8">
            <section className="space-y-3">
              <p>
                作品単体ではなく、あなた自身の視点による作品と作品をつなぐ「接続レビュー」の投稿をすることで、
                Amazonギフトカード3,000円がもらえます！
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-zinc-950">プレゼント内容</h2>
              <p className="mt-2">
                読者から獲得した「いいね！」数をベースに、上位3名のレビュワーへAmazonギフトカード（デジタルコード）を贈呈します。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {prizes.map((prize) => (
                  <div key={prize.rank} className={`rounded-2xl border px-4 py-4 ${prize.tone}`}>
                    <p className="text-2xl" aria-hidden>
                      {prize.icon}
                    </p>
                    <p className="mt-2 text-xs font-semibold">{prize.rank}</p>
                    <p className="text-lg font-bold">ギフトカード {prize.amount}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-base font-semibold text-zinc-950">スケジュール</h2>
              <div className="mt-3 space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                  <h3 className="font-semibold text-zinc-900">【告知・準備期間】11月1日〜11月10日</h3>
                  <p className="mt-2">
                    キャンペーン告知期間です。Googleアカウントでログインしてシナプス投稿の準備をしましょう。
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                  <h3 className="font-semibold text-zinc-900">【レビューエントリー期間】11月11日〜25日</h3>
                  <p className="mt-2">
                    期間中にサイト内で投稿されたシナプス（接続レビュー）が、すべて自動的にランキング対象となります。期間中であれば何件でも投稿できます。
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                  <h3 className="font-semibold text-zinc-900">【いいね集計・審査期間】11月25日〜12月1日</h3>
                  <p className="mt-2">
                    新規エントリー受付がストップし、公開されたレビューへの「いいね」集計に特化する期間です。
                    運営にてアクセスログの確認およびレビュー内容の品質審査を行います。
                  </p>
                </div>
              </div>
              <p className="mt-4">
                その後、12月3日ごろにサイト上にて上位3名を発表します。該当者の登録メールアドレス宛にAmazonギフトカードのデジタルコードを送付いたします。
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-zinc-950">応募規約 ＆ 注意事項</h2>
              <div className="mt-3 space-y-3">
                {rules.map((rule) => (
                  <div key={rule.title} className="rounded-2xl border border-zinc-200 px-4 py-4">
                    <h3 className="font-semibold text-zinc-900">{rule.title}</h3>
                    <p className="mt-2">{rule.body}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </article>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6">
          <Link href="/" className="text-sm font-medium text-indigo-600 transition hover:text-indigo-500">
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
