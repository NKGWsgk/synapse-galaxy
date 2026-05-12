import { NextResponse } from "next/server";
import { OGP_BROWSER_UA } from "@/lib/ogp";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isSafeToFetchImage(u: string): boolean {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const h = parsed.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local")) return false;
    if (h === "[::1]" || h === "::1" || h === "0.0.0.0") return false;
    if (h.startsWith("10.")) return false;
    if (h.startsWith("192.168.")) return false;
    if (h.startsWith("127.")) return false;
    if (h.startsWith("0.")) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return false;
    if (h === "metadata.google.internal" || h === "metadata") return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  const ref = searchParams.get("ref");
  if (!target || !isSafeToFetchImage(target)) {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (ref && !isSafeToFetchImage(ref)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  let referer = ref ?? undefined;
  if (!referer) {
    try {
      const iu = new URL(target);
      referer = `${iu.origin}/`;
    } catch {
      /* noop */
    }
  }

  try {
    const res = await fetch(target, {
      redirect: "follow",
      headers: {
        "User-Agent": OGP_BROWSER_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status === 404 ? 404 : 502 });
    }

    const ct = res.headers.get("content-type") || "";
    if (ct) {
      const lower = ct.toLowerCase();
      if (!lower.startsWith("image/") && !lower.startsWith("application/octet-stream")) {
        return new NextResponse(null, { status: 502 });
      }
    }

    const len = res.headers.get("content-length");
    if (len && Number(len) > MAX_IMAGE_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    const outType =
      ct && ct.toLowerCase().startsWith("image/")
        ? ct
        : ct && ct.toLowerCase().includes("application/octet-stream")
          ? "image/jpeg"
          : "image/jpeg";

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": outType,
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
