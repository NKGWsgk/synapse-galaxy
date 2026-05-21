import { amazonAsinFromUrl, isAmazonUrl } from "@/lib/amazon";
import { fetchOgp, type OgpResult } from "@/lib/ogp";
import { extractPureWorkTitle, isWeakStreamingPlatformTitle } from "@/lib/pureWorkTitle";

/** ISBN-10 → ISBN-13 変換（先頭に"978"を付け、チェックデジットを再計算） */
function isbn10ToIsbn13(isbn10: string): string {
  const digits = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return digits + check;
}

/** タイトルが商品名・動画名として使えないときはライブ取得で直す（キャッシュに site 名だけ残っているケース） */
export function needsTitleRefresh(title: string | null | undefined, pageUrl: string): boolean {
  const t = title?.trim() ?? "";
  if (!t) return true;
  if (t.length < 2) return true;

  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    const tl = t.toLowerCase();

    if (isAmazonUrl(pageUrl)) {
      if (/^amazon\.co\.jp$/i.test(t)) return true;
      if (/^amazon\.com$/i.test(t)) return true;
      if (tl === "amazon") return true;
      if (/^amazon\.co\.jp\s*\|/i.test(t)) return true;
      const asin = amazonAsinFromUrl(pageUrl);
      if (asin && /^[（(]\s*amazon\s*[）)]/i.test(t.normalize("NFKC"))) return true;
      const alnum = t.replace(/[^a-z0-9]/gi, "");
      if (asin && alnum.length <= 12 && alnum.toUpperCase().endsWith(asin.toUpperCase())) return true;
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      if (tl === "youtube" || t === "YouTube") return true;
    }
    if (host.includes("netflix.com")) {
      if (tl === "netflix") return true;
      if (isWeakStreamingPlatformTitle(t, pageUrl)) return true;
    }
    if (host.includes("disneyplus.com")) {
      if (tl === "disney+" || tl === "disney plus" || tl === "disneyplus") return true;
    }
    if (host.includes("hulu.com") || host.includes("hulu.jp")) {
      if (tl === "hulu") return true;
    }
    if (host === "video.unext.jp" || host.endsWith(".video.unext.jp")) {
      if (tl === "u-next" || tl === "unext" || t === "U-NEXT") return true;
    }
    if (host.includes("open.spotify.com")) {
      if (tl === "spotify") return true;
    }
    if (host.includes("music.apple.com")) {
      if (tl === "apple music") return true;
    }
    if (host.includes("music.youtube.com")) {
      if (tl === "youtube music") return true;
    }
    if (host.includes("amazon.co.jp") && pageUrl.includes("/gp/video")) {
      if (tl.includes("prime video") && t.length < 24) return true;
    }
  } catch {
    // ignore
  }

  return false;
}

function cleanTitleForHost(title: string | null, pageUrl: string): string | null {
  if (!title) return null;
  let t = title.trim();
  if (!t) return null;

  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    if (host === "amazon.co.jp" || host.endsWith(".amazon.co.jp")) {
      t = t.replace(/^amazon\.co\.jp\s*[:：]\s*/i, "");
    } else if (host === "amazon.com" || host.endsWith(".amazon.com")) {
      t = t.replace(/^amazon\.com\s*[:：]\s*/i, "");
    }
  } catch {
    // ignore
  }

  return t || null;
}

export function pureTitleForResponse(title: string | null | undefined, pageUrl: string): string | null {
  const t = title ?? null;
  return extractPureWorkTitle(t, pageUrl) ?? cleanTitleForHost(t, pageUrl);
}

/** Amazon: OpenBD（日本書籍データベース）でタイトル・表紙を補完 */
export async function enrichAmazonOgp(pageUrl: string, og: OgpResult): Promise<OgpResult> {
  if (!isAmazonUrl(pageUrl)) return og;
  if (!needsTitleRefresh(og.title, pageUrl) && og.imageUrl) return og;

  const asin = amazonAsinFromUrl(pageUrl);
  if (!asin) return og;

  const result = { ...og };

  if (needsTitleRefresh(result.title, pageUrl)) {
    const isbnCandidates = asin.match(/^\d{10}$/)
      ? [asin, isbn10ToIsbn13(asin)]
      : [asin];
    for (const isbn of isbnCandidates) {
      try {
        const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`, { signal: AbortSignal.timeout(5000) });
        const [book] = (await r.json()) as [{ summary?: { title?: string } } | null];
        if (book?.summary?.title) {
          result.title = book.summary.title;
          break;
        }
      } catch {
        // noop — 次の ISBN 候補を試す
      }
    }
  }

  if (!result.imageUrl) {
    const isbn13 = asin.match(/^\d{10}$/) ? isbn10ToIsbn13(asin) : null;
    result.imageUrl = `https://cover.openbd.jp/${isbn13 ?? asin}.jpg`;
  }

  return result;
}

/** OGP 取得。Amazon は bot 対策で失敗しても OpenBD で補完する */
export async function fetchOgpResilient(url: string): Promise<OgpResult> {
  let og: OgpResult = { title: null, description: null, imageUrl: null, siteName: null };
  try {
    og = await fetchOgp(url);
  } catch (e) {
    if (!isAmazonUrl(url)) throw e;
  }
  return enrichAmazonOgp(url, og);
}
