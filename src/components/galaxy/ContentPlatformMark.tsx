"use client";

/**
 * コンパス各マス用。サムネ右上にサービスが分かる小バッジ（色＋1文字・記号）。マス角に沿わせる。
 */

export type ContentPlatformId =
  | "amazon"
  | "netflix"
  | "youtube"
  | "disney"
  | "prime"
  | "wikipedia"
  | "other";

export function detectContentPlatform(url: string): ContentPlatformId {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const path = url.toLowerCase();
    if (h.includes("primevideo.com")) return "prime";
    if (h === "amzn.to" || h.endsWith(".amzn.to") || h.includes("amazon.")) {
      if (path.includes("/gp/video")) return "prime";
      return "amazon";
    }
    if (h.includes("netflix.com")) return "netflix";
    if (h === "youtu.be" || h.includes("youtube.com")) return "youtube";
    if (h.includes("disneyplus.com")) return "disney";
    if (h.includes("wikipedia.org")) return "wikipedia";
    return "other";
  } catch {
    return "other";
  }
}

const BADGE: Record<
  Exclude<ContentPlatformId, "other">,
  { name: string; className: string; glyph: string }
> = {
  netflix: {
    name: "Netflix",
    className: "bg-black text-[#E50914]",
    glyph: "N",
  },
  amazon: {
    name: "Amazon",
    className: "bg-[#FF9900] text-white",
    glyph: "a",
  },
  youtube: {
    name: "YouTube",
    className: "bg-[#FF0000] text-white",
    glyph: "Y",
  },
  disney: {
    name: "Disney+",
    className: "bg-[#0063E5] text-white",
    glyph: "D",
  },
  prime: {
    name: "Prime Video",
    className: "bg-[#00A8E1] text-white",
    glyph: "P",
  },
  wikipedia: {
    name: "Wikipedia",
    className: "bg-zinc-800 text-white",
    glyph: "W",
  },
};

export function ContentPlatformMark({
  pageUrl,
  className = "",
}: {
  pageUrl: string;
  className?: string;
}) {
  const id = detectContentPlatform(pageUrl);
  if (id === "other") return null;

  const b = BADGE[id];

  return (
    <span
      role="img"
      aria-label={b.name}
      title={b.name}
      className={[
        "pointer-events-none absolute right-0 top-0 z-20 flex h-5 w-5 select-none items-center justify-center rounded-bl-md border-b border-l border-black/10 bg-clip-padding text-[9px] font-bold leading-none shadow-[0_1px_3px_rgba(0,0,0,0.12)] sm:h-6 sm:w-6 sm:text-[10px]",
        b.className,
        className,
      ].join(" ")}
    >
      {b.glyph}
    </span>
  );
}
