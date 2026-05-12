export type PurchaseLinks = Record<string, string>;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function purchaseLinksFromUrl(url: string): PurchaseLinks {
  const host = hostOf(url);
  if (!host) return {};

  // Amazon
  if (host === "amazon.co.jp" || host.endsWith(".amazon.co.jp") || host === "amazon.com" || host.endsWith(".amazon.com")) {
    return { amazon: url };
  }

  // Rakuten (JP)
  if (host === "rakuten.co.jp" || host.endsWith(".rakuten.co.jp") || host === "r10.to" || host.endsWith(".r10.to")) {
    return { rakuten: url };
  }

  return {};
}

export function mergePurchaseLinks(a: unknown, b: PurchaseLinks): PurchaseLinks {
  const base: PurchaseLinks = {};
  if (a && typeof a === "object" && !Array.isArray(a)) {
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim().length > 0) {
        base[k] = v.trim();
      }
    }
  }
  return { ...base, ...b };
}

