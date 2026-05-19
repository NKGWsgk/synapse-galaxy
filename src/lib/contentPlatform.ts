export type ContentPlatformId =
  | "amazon"
  | "netflix"
  | "youtube"
  | "disney"
  | "prime"
  | "hulu"
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
] as const satisfies readonly ContentPlatformId[];

export type AllowedSynapsePlatform = (typeof ALLOWED_SYNAPSE_PLATFORMS)[number];

export function isAllowedSynapseUrl(url: string): boolean {
  const id = detectContentPlatform(url);
  return (ALLOWED_SYNAPSE_PLATFORMS as readonly ContentPlatformId[]).includes(id);
}

export const ALLOWED_SYNAPSE_URL_MESSAGE =
  "Amazon・YouTube・Netflix・Disney+・Prime Video・Hulu の作品URLのみ登録できます。";

/** 入力欄用（許可外 URL 検出時） */
export const ALLOWED_SYNAPSE_ALERT_MESSAGE =
  "入力できるプラットフォームは Amazon・YouTube・Netflix・Disney+・Prime Video・Hulu のみです。";

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
