/**
 * コンパス・OGP プレビュー用。動画サムネは横長なので本とは別レイアウトにする。
 */

export function isVideoStyleOgpPageUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === "youtu.be" || h.includes("youtube.com")) return true;
    if (h.includes("netflix.com")) return true;
    if (h.includes("disneyplus.com")) return true;
    if (h.includes("hulu.com") || h.includes("hulu.jp")) return true;
    if (h === "video.unext.jp" || h.endsWith(".video.unext.jp")) return true;
    if (h.includes("primevideo.com")) return true;
    if (h.includes("amazon.") && url.includes("/gp/video")) return true;
    return false;
  } catch {
    return false;
  }
}

export type OgpImageSlot = "gridMini" | "gridHero" | "modal" | "inlineThumb";

type PortraitClasses = {
  mode: "portrait";
  outer: string;
  img: string;
};

type VideoClasses = {
  mode: "video";
  outer: string;
  inner: string;
  img: string;
};

export function ogpImageLayout(pageUrl: string, slot: OgpImageSlot): PortraitClasses | VideoClasses {
  if (!isVideoStyleOgpPageUrl(pageUrl)) {
    const outerBySlot: Record<OgpImageSlot, string> = {
      gridMini: "relative min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-zinc-100",
      gridHero: "relative min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-zinc-100",
      modal: "relative h-[min(40vh,320px)] w-full shrink-0 overflow-hidden bg-zinc-100",
      inlineThumb:
        "relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100",
    };
    return {
      mode: "portrait",
      outer: outerBySlot[slot],
      img: "absolute left-1/2 top-1/2 h-[130%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 object-cover",
    };
  }

  const outerBySlot: Record<OgpImageSlot, string> = {
    gridMini:
      "relative flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center overflow-hidden bg-zinc-950",
    gridHero:
      "relative flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center overflow-hidden bg-zinc-950",
    modal: "relative w-full shrink-0 overflow-hidden bg-zinc-950",
    inlineThumb:
      "relative h-12 w-[4.75rem] shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950",
  };

  const innerBySlot: Record<OgpImageSlot, string> = {
    gridMini: "relative aspect-video w-full max-h-full",
    gridHero: "relative aspect-video w-full max-h-full",
    modal: "relative aspect-video w-full max-h-[min(48vh,400px)] mx-auto",
    inlineThumb: "relative aspect-video h-full w-full",
  };

  return {
    mode: "video",
    outer: outerBySlot[slot],
    inner: innerBySlot[slot],
    img: "absolute inset-0 h-full w-full object-contain object-center",
  };
}
