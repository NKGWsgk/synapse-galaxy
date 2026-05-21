import type { Metadata } from "next";
import { LegalLayout, Section } from "@/components/legal/LegalLayout";
import { SITE_NAME_EN, SITE_NAME_JA } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  title: "利用規約",
  description:
    `${SITE_NAME_JA}（${SITE_NAME_EN}）の利用規約。コンテンツ同士を「なぜ繋がるか」で結ぶシナプス型ネットワークの利用条件を定めます。`,
};

export default function TermsPage() {
  return (
    <LegalLayout title="利用規約" updated="2026年5月19日">
      <Section title="1. はじめに">
        <p>
          本利用規約（以下「本規約」）は、{SITE_NAME_EN}（以下「本サービス」）の利用条件を定めるものです。
          本サービスを利用することで、本規約に同意したものとみなします。
        </p>
      </Section>

      <Section title="2. サービス内容">
        <p>
          本サービスは、ユーザーがコンテンツ（書籍・動画等）同士を「なぜ繋がるか」という自由記述で結び、
          そのネットワークを探索・共有できるプラットフォームです。
        </p>
      </Section>

      <Section title="3. アカウント">
        <p>
          本サービスの一部機能（投稿・いいね等）の利用には、Google アカウントによるログインが必要です。
          アカウント情報の管理は利用者自身の責任において行ってください。
        </p>
      </Section>

      <Section title="4. ユーザーコンテンツ">
        <p>
          利用者が投稿する URL・接続タイトル・接続理由（以下「ユーザーコンテンツ」）の著作権は利用者に帰属します。
          ただし、利用者は本サービスの運営・表示・改善に必要な範囲で、当方がユーザーコンテンツを利用・保存・加工することを許諾するものとします。
        </p>
        <p>
          利用者は、第三者の権利を侵害する内容、違法な内容、公序良俗に反する内容を投稿してはなりません。
        </p>
      </Section>

      <Section title="5. 禁止事項">
        <ul className="list-disc space-y-1 pl-5">
          <li>法令または公序良俗に反する行為</li>
          <li>他者の権利・プライバシーを侵害する行為</li>
          <li>本サービスの運営を妨害する行為（不正アクセス、過度な API 呼び出し等）</li>
          <li>虚偽の情報を意図的に投稿する行為</li>
          <li>その他、当方が不適切と判断する行為</li>
        </ul>
      </Section>

      <Section title="6. 外部サービス">
        <p>
          本サービスは Google（認証）、Supabase（データベース・認証基盤）、Google Gemini（テキスト解析）等の
          外部サービスを利用します。これらのサービス利用には、各提供者の規約が適用されます。
        </p>
        <p>
          投稿 URL には Amazon アソシエイト等のアフィリエイトパラメータが付与される場合があります。
        </p>
      </Section>

      <Section title="7. 免責事項">
        <p>
          本サービスは現状有姿で提供されます。正確性・完全性・特定目的への適合性について保証しません。
          本サービスの利用により生じた損害について、当方の故意または重過失による場合を除き、責任を負いません。
        </p>
      </Section>

      <Section title="8. サービスの変更・停止">
        <p>
          当方は、事前の通知なく本サービスの内容変更・一時停止・終了を行う場合があります。
        </p>
      </Section>

      <Section title="9. 規約の変更">
        <p>
          本規約は必要に応じて変更されることがあります。変更後に本サービスを利用した場合、変更後の規約に同意したものとみなします。
        </p>
      </Section>

      <Section title="10. お問い合わせ">
        <p>
          本規約に関するお問い合わせは、本サービスの運営者まで GitHub リポジトリの Issues 等よりご連絡ください。
        </p>
      </Section>
    </LegalLayout>
  );
}
