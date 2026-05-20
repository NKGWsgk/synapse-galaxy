"use client";

import {
  detectContentPlatform,
  type ContentPlatformId,
} from "@/lib/contentPlatform";

export type { ContentPlatformId };
export { detectContentPlatform };

/**
 * コンパス各マス用。サムネ右上にサービスが分かる小バッジ（色＋1文字・記号）。マス角に沿わせる。
 */

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
  hulu: {
    name: "Hulu",
    className: "bg-[#1CE783] text-zinc-900",
    glyph: "H",
  },
  unext: {
    name: "U-NEXT",
    className: "bg-[#0099FF] text-white",
    glyph: "U",
  },
  spotify: {
    name: "Spotify",
    className: "bg-[#1DB954] text-white",
    glyph: "S",
  },
  apple_music: {
    name: "Apple Music",
    className: "bg-[#FA243C] text-white",
    glyph: "A",
  },
  youtube_music: {
    name: "YouTube Music",
    className: "bg-[#FF0000] text-white",
    glyph: "M",
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
