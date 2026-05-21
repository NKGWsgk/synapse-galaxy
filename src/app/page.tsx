import { GalaxyApp } from "@/components/galaxy/GalaxyApp";
import { SITE_DESCRIPTION, SITE_NAME_EN, SITE_NAME_JA } from "@/lib/siteMetadata";

export default function Home() {
  return (
    <>
      <div className="sr-only">
        <h1>
          {SITE_NAME_JA}（{SITE_NAME_EN}）
        </h1>
        <p>{SITE_DESCRIPTION}</p>
      </div>
      <GalaxyApp />
    </>
  );
}
