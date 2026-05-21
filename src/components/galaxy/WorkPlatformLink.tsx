"use client";

import {
  contentPlatformDisplayName,
  detectContentPlatform,
  isMusicContentPlatform,
  type AllowedSynapsePlatform,
  type ContentPlatformId,
} from "@/lib/contentPlatform";
import { withSynapseAffiliate } from "@/lib/synapseAffiliate";

export function WorkPlatformLink({
  url,
  className = "",
  compact = false,
  inline = false,
}: {
  url: string;
  className?: string;
  compact?: boolean;
  inline?: boolean;
}) {
  const platform = detectContentPlatform(url);
  const PLATFORM_BTN: Record<Exclude<ContentPlatformId, "other">, { cls: string }> = {
    amazon: { cls: "bg-[#FF9900] text-white hover:brightness-95" },
    youtube: { cls: "bg-[#FF0000] text-white hover:brightness-95" },
    netflix: { cls: "bg-black text-[#E50914] hover:bg-zinc-900" },
    disney: { cls: "bg-[#0063E5] text-white hover:brightness-95" },
    prime: { cls: "bg-[#00A8E1] text-white hover:brightness-95" },
    hulu: { cls: "bg-[#1CE783] text-zinc-900 hover:brightness-95" },
    unext: { cls: "bg-[#0099FF] text-white hover:brightness-95" },
    spotify: { cls: "bg-[#1DB954] text-white hover:brightness-95" },
    apple_music: { cls: "bg-[#FA243C] text-white hover:brightness-95" },
    youtube_music: { cls: "bg-[#FF0000] text-white hover:brightness-95" },
  };
  const meta = platform !== "other" ? PLATFORM_BTN[platform] : null;
  const name = platform !== "other" ? contentPlatformDisplayName(platform as AllowedSynapsePlatform) : null;
  const label = name
    ? isMusicContentPlatform(platform) ? `${name}で聴く` : `${name}で作品をみる`
    : "ページを開く";
  const cls = meta ? meta.cls : "bg-indigo-600 text-white hover:bg-indigo-500";

  return (
    <a
      href={withSynapseAffiliate(url)}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "inline-flex items-center gap-1 font-semibold shadow-sm transition",
        compact
          ? inline
            ? "shrink-0 rounded-lg px-2.5 py-1 text-[10px]"
            : "w-full justify-center rounded-lg px-3 py-1.5 text-[11px]"
          : "w-fit gap-1.5 rounded-full px-3.5 py-2 text-[13px]",
        cls,
        className,
      ].join(" ")}
    >
      {label} <span aria-hidden>↗</span>
    </a>
  );
}
