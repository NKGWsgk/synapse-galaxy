import { ImageResponse } from "next/og";
import { OGP_BROWSER_UA } from "@/lib/ogp";
import { loadSynapseShare, type SynapseShareWork } from "@/lib/synapseShare";

export const alt = "SYNAPSE Galaxy のシナプス";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

// 空配列を返すと、初回アクセス時に生成され、以後キャッシュされる（毎回 3〜5 秒かけて作り直さない）
export async function generateStaticParams() {
  return [];
}

const COVER_W = 240;
const COVER_H = 336;

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** 必要な文字だけの日本語フォント（TTF）を Google Fonts から取る。User-Agent を付けないと TTF が返る。 */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const chars = Array.from(new Set(text)).join("");
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(chars)}`,
      { signal: AbortSignal.timeout(6000) },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** 表紙画像を data URI にして渡す（失敗・非対応形式なら null → 文字だけのカードにする） */
async function loadCover(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": OGP_BROWSER_UA, Accept: "image/jpeg,image/png,image/*;q=0.8" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (type !== "image/jpeg" && type !== "image/png") return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 512 || buf.byteLength > 3 * 1024 * 1024) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

function Card({ work, cover }: { work: SynapseShareWork; cover: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", width: COVER_W, height: COVER_H + 90 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: COVER_W,
          height: COVER_H,
          background: "#FFFFFF",
          flexShrink: 0,
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} width={COVER_W} height={COVER_H} style={{ width: COVER_W, height: COVER_H, objectFit: "cover", objectPosition: "center" }} alt="" />
        ) : (
          <div style={{ display: "flex", padding: 20, fontSize: 28, fontWeight: 700, color: "#1A1B50", textAlign: "center" }}>
            {clip(work.title, 20)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", marginTop: 16, fontSize: 26, fontWeight: 700, color: "#FFFFFF", textAlign: "center" }}>
        {clip(work.title, 14)}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadSynapseShare(id);

  const fallback = async () => {
    const res = await fetch(new URL("/ogp.jpg", process.env.NEXT_PUBLIC_SITE_URL || "https://synapse-galaxy.vercel.app"));
    return new Response(await res.arrayBuffer(), { headers: { "Content-Type": "image/jpeg" } });
  };
  if (!d) return fallback();

  const title = clip(d.title || "つながりを見る", 28);
  const tagline = "作品と作品を、なぜつながるかで結ぶ";
  const brand = "SYNAPSE Galaxy";
  const aTitle = clip(d.source.title, 14);
  const bTitle = clip(d.target.title, 14);
  const [font, coverA, coverB] = await Promise.all([
    loadFont(`${title}${tagline}${brand}${aTitle}${bTitle}${clip(d.source.title, 20)}${clip(d.target.title, 20)}→`),
    loadCover(d.source.imageUrl),
    loadCover(d.target.imageUrl),
  ]);
  if (!font) return fallback();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "40px 56px",
          background: "linear-gradient(135deg, #0D0D1C 0%, #1A1B50 100%)",
          color: "#FFFFFF",
          fontFamily: "NotoSansJP",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: "#B9BBFF" }}>
          <div style={{ display: "flex" }}>{brand}</div>
          <div style={{ display: "flex", fontSize: 20 }}>{tagline}</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Card work={d.source} cover={coverA} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, padding: "0 24px" }}>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>{title}</div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 22, width: "100%" }}>
              <div style={{ display: "flex", flex: 1, height: 4, background: "#8B8DFF" }} />
              <svg width="28" height="28" viewBox="0 0 28 28" style={{ marginLeft: -4 }}>
                <path d="M2 2 L26 14 L2 26 Z" fill="#8B8DFF" />
              </svg>
            </div>
          </div>
          <Card work={d.target} cover={coverB} />
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "NotoSansJP", data: font, weight: 700, style: "normal" }] },
  );
}
