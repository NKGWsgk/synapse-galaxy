import type { Metadata } from "next";
import { LegalLayout, Section } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "プライバシーポリシー | Synapse Galaxy",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="プライバシーポリシー" updated="2026年5月19日">
      <Section title="1. はじめに">
        <p>
          Synapse Galaxy（以下「本サービス」）は、利用者の個人情報の保護を重視します。
          本ポリシーは、本サービスが収集・利用する情報とその取り扱いについて説明します。
        </p>
      </Section>

      <Section title="2. 収集する情報">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Google ログイン情報:</strong> Google OAuth 経由で取得するユーザー ID、メールアドレス、
            表示名、プロフィール画像 URL
          </li>
          <li>
            <strong>プロフィール情報:</strong> ニックネーム（初回ログイン時に入力）
          </li>
          <li>
            <strong>投稿データ:</strong> シナプス（接続元・接続先 URL、接続タイトル、接続理由、いいね数等）
          </li>
          <li>
            <strong>利用情報:</strong> 通知の既読状態、閲覧回数（ブラウザの localStorage に保存）
          </li>
          <li>
            <strong>技術情報:</strong> アクセスログ（IP アドレス、User-Agent、リクエスト日時等）— ホスティング提供者が自動収集する場合があります
          </li>
        </ul>
      </Section>

      <Section title="3. 利用目的">
        <ul className="list-disc space-y-1 pl-5">
          <li>本サービスの提供・認証・ユーザー識別</li>
          <li>投稿内容の表示、ランキング・通知機能の提供</li>
          <li>接続理由からのキーワード抽出（Google Gemini API）</li>
          <li>OGP 情報の取得・キャッシュ（投稿 URL のメタデータ）</li>
          <li>サービス改善・不正利用の防止</li>
        </ul>
      </Section>

      <Section title="4. 第三者への提供">
        <p>当方は、以下の場合を除き、個人情報を第三者に販売しません。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase:</strong> データベース・認証基盤としてユーザー情報・投稿データを保存
          </li>
          <li>
            <strong>Google:</strong> OAuth 認証、Gemini API（テキスト解析）
          </li>
          <li>
            <strong>Vercel:</strong> ホスティング（アクセスログが生成される場合があります）
          </li>
          <li>法令に基づく開示請求への対応</li>
        </ul>
        <p>
          各サービスのプライバシーポリシーについては、各提供者のサイトをご確認ください。
        </p>
      </Section>

      <Section title="5. 公開される情報">
        <p>
          ニックネーム、プロフィール画像、投稿したシナプス、受け取ったいいね数は、
          本サービス上で他の利用者に表示・閲覧される場合があります。
        </p>
      </Section>

      <Section title="6. Cookie・localStorage">
        <p>
          本サービスは認証セッションの維持（Supabase）および閲覧回数の記録（localStorage）に
          ブラウザストレージを使用します。ブラウザ設定で無効化できますが、一部機能が利用できなくなる場合があります。
        </p>
      </Section>

      <Section title="7. 保存期間">
        <p>
          データはアカウント削除または運営者による削除まで保存されます。
          アカウント削除のご希望は、運営者までお問い合わせください。
        </p>
      </Section>

      <Section title="8. 利用者の権利">
        <p>
          利用者は、自己の個人情報の開示・訂正・削除を求めることができます。
          お問い合わせは GitHub リポジトリの Issues 等よりご連絡ください。
        </p>
      </Section>

      <Section title="9. ポリシーの変更">
        <p>
          本ポリシーは必要に応じて変更されることがあります。重要な変更がある場合は、本サービス上で告知します。
        </p>
      </Section>

      <Section title="10. お問い合わせ">
        <p>
          プライバシーに関するお問い合わせは、本サービスの運営者まで GitHub リポジトリの Issues 等よりご連絡ください。
        </p>
      </Section>
    </LegalLayout>
  );
}
