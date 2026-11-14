import { SITE_NAME_EN } from "@/lib/siteMetadata";

/** アフィリエイト表記（Amazonアソシエイトの規約上、サイト内に明記が必要）。 */
export function AffiliateDisclosure({ className = "" }: { className?: string }) {
  return (
    <p className={["leading-relaxed", className].join(" ")}>
      Amazonのアソシエイトとして、{SITE_NAME_EN} は適格販売により収入を得ています。作品リンクの一部はアフィリエイトリンクです。
    </p>
  );
}
