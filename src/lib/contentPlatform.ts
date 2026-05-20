export type ContentPlatformId =
  | "amazon"
  | "netflix"
  | "youtube"
  | "disney"
  | "prime"
  | "hulu"
  | "unext"
  | "spotify"
  | "apple_music"
  | "youtube_music"
  | "other";

export function detectContentPlatform(url: string): ContentPlatformId {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const path = url.toLowerCase();

    if (h === "music.youtube.com" || (h.includes("youtube.com") && path.includes("/music"))) {
      return "youtube_music";
    }
    if (h === "music.apple.com" || h.endsWith(".music.apple.com")) return "apple_music";
    if (h === "open.spotify.com" || h === "spotify.com" || h.endsWith(".spotify.com")) {
      return "spotify";
    }

    if (h.includes("primevideo.com")) return "prime";
    if (h === "amzn.to" || h.endsWith(".amzn.to") || h.includes("amazon.")) {
      if (path.includes("/gp/video")) return "prime";
      return "amazon";
    }
    if (h === "video.unext.jp" || h.endsWith(".video.unext.jp")) return "unext";
    if (h.includes("netflix.com")) return "netflix";
    if (h === "youtu.be" || h.includes("youtube.com")) return "youtube";
    if (h.includes("disneyplus.com")) return "disney";
    if (h.includes("hulu.com") || h.includes("hulu.jp")) return "hulu";
    return "other";
  } catch {
    return "other";
  }
}

/** シナプス endpoint として登録可能なプラットフォーム */
export const ALLOWED_SYNAPSE_PLATFORMS = [
  "amazon",
  "netflix",
  "youtube",
  "disney",
  "prime",
  "hulu",
  "unext",
  "spotify",
  "apple_music",
  "youtube_music",
] as const satisfies readonly ContentPlatformId[];

export type AllowedSynapsePlatform = (typeof ALLOWED_SYNAPSE_PLATFORMS)[number];

const PLATFORM_DISPLAY_NAME: Record<AllowedSynapsePlatform, string> = {
  amazon: "Amazon",
  netflix: "Netflix",
  youtube: "YouTube",
  disney: "Disney+",
  prime: "Prime Video",
  hulu: "Hulu",
  unext: "U-NEXT",
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
};

const MUSIC_PLATFORMS: readonly ContentPlatformId[] = [
  "spotify",
  "apple_music",
  "youtube_music",
];

export function contentPlatformDisplayName(id: AllowedSynapsePlatform): string {
  return PLATFORM_DISPLAY_NAME[id];
}

export function isMusicContentPlatform(id: ContentPlatformId): boolean {
  return (MUSIC_PLATFORMS as readonly ContentPlatformId[]).includes(id);
}

export const ALLOWED_SYNAPSE_PLATFORM_LIST_TEXT =
  "Amazon・YouTube・Netflix・Disney+・Prime Video・Hulu・U-NEXT・Spotify・Apple Music・YouTube Music";

export function isAllowedSynapseUrl(url: string): boolean {
  const id = detectContentPlatform(url);
  return (ALLOWED_SYNAPSE_PLATFORMS as readonly ContentPlatformId[]).includes(id);
}

export const ALLOWED_SYNAPSE_URL_MESSAGE = `${ALLOWED_SYNAPSE_PLATFORM_LIST_TEXT} の作品URLのみ登録できます。`;

/** 入力欄用（許可外 URL 検出時） */
export const ALLOWED_SYNAPSE_ALERT_MESSAGE = `入力できるプラットフォームは ${ALLOWED_SYNAPSE_PLATFORM_LIST_TEXT} のみです。`;

export function synapseUrlFieldError(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  try {
    new URL(u);
  } catch {
    return "URL形式が正しくないかも";
  }
  if (!isAllowedSynapseUrl(u)) return ALLOWED_SYNAPSE_ALERT_MESSAGE;
  return null;
}
