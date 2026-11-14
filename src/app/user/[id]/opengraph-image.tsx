import { ImageResponse } from "next/og";
import { clipText, fallbackOgpResponse, loadCoverDataUri, loadJpFont } from "@/lib/ogImageAssets";
import { loadUserGalaxy } from "@/lib/userGalaxy";

export const alt = "SYNAPSE Galaxy のユーザーページ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

// 空配列を返すと、初回アクセス時に生成され、以後キャッシュされる
export async function generateStaticParams() {
  return [];
}

// 右半分の星座（ハブ＋衛星）の配置。中心 (CX, CY)
const CX = 880;
const CY = 330;
const HUB = { w: 170, h: 238 };
const SAT = { w: 112, h: 157 };
const SAT_POS = [
  { x: 700, y: 170 },
  { x: 1060, y: 190 },
  { x: 1090, y: 440 },
  { x: 880, y: 540 },
  { x: 680, y: 430 },
];

function Cover({ src, title, w, h, left, top }: { src: string | null; title: string; w: number; h: number; left: number; top: number }) {
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        left: left - w / 2,
        top: top - h / 2,
        width: w,
        height: h,
        background: "#FFFFFF",
        borderRadius: 5,
        overflow: "hidden",
        boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={w} height={h} style={{ width: w, height: h, objectFit: "cover" }} alt="" />
      ) : (
        <div style={{ display: "flex", padding: 8, fontSize: 18, fontWeight: 700, color: "#1A1B50", textAlign: "center" }}>
          {clipText(title, 12)}
        </div>
      )}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await loadUserGalaxy(id).catch(() => null);
  if (!g) return fallbackOgpResponse();

  const hub = g.works[0] ?? null;
  const sats = g.works.slice(1, 1 + SAT_POS.length);
  const name = clipText(g.displayName, 14);
  const nameSize = name.length <= 6 ? 72 : name.length <= 9 ? 58 : 44;
  const suffix = "のシナプス";
  const stats: Array<[string, string]> = [
    [String(g.postCount), "シナプス"],
    [String(g.worksCount), "作品"],
    [String(g.totalLikes), "いいね"],
  ];
  const tagline = "作品と作品を、なぜつながるかで結ぶ";
  const brand = "SYNAPSE Galaxy";

  const [font, hubCover, ...satCovers] = await Promise.all([
    loadJpFont(`${name}${suffix}${tagline}${brand}シナプス作品いいね0123456789${g.works.slice(0, 6).map((w) => clipText(w.title, 12)).join("")}`),
    loadCoverDataUri(hub?.imageUrl ?? null),
    ...sats.map((w) => loadCoverDataUri(w.imageUrl)),
  ]);
  if (!font) return fallbackOgpResponse();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0D0D1C 0%, #1A1B50 100%)",
          color: "#FFFFFF",
          fontFamily: "NotoSansJP",
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          {sats.map((_, i) => (
            <line key={i} x1={CX} y1={CY} x2={SAT_POS[i]!.x} y2={SAT_POS[i]!.y} stroke="#8B8DFF" strokeWidth="3" strokeOpacity="0.7" />
          ))}
        </svg>
        {sats.map((w, i) => (
          <Cover key={i} src={satCovers[i] ?? null} title={w.title} w={SAT.w} h={SAT.h} left={SAT_POS[i]!.x} top={SAT_POS[i]!.y} />
        ))}
        {hub ? <Cover src={hubCover ?? null} title={hub.title} w={HUB.w} h={HUB.h} left={CX} top={CY} /> : null}

        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 64, top: 48, width: 540, height: 534 }}>
          <div style={{ display: "flex", fontSize: 26, color: "#B9BBFF" }}>{brand}</div>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, lineHeight: 1.2, wordBreak: "break-all" }}>{name}</div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#B9BBFF", marginTop: 4 }}>{suffix}</div>
            <div style={{ display: "flex", marginTop: 40 }}>
              {stats.map(([n, label]) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", marginRight: 44 }}>
                  <div style={{ display: "flex", fontSize: 72, fontWeight: 700, color: "#FFFFFF" }}>{n}</div>
                  <div style={{ display: "flex", fontSize: 24, color: "#B9BBFF" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#B9BBFF" }}>{tagline}</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "NotoSansJP", data: font, weight: 700, style: "normal" }] },
  );
}
