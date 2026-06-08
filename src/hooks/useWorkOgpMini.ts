"use client";

import { useEffect, useState } from "react";
import type { WorkEndpointMap } from "@/lib/workEndpoint";
import { resolveWorkOgpMini, type OgpMini } from "@/lib/workOgpMini";

export function useWorkOgpMini(
  url: string | undefined,
  workMap: WorkEndpointMap = {},
  workKey?: string,
): {
  data: OgpMini | null;
  loading: boolean;
  imgError: boolean;
  setImgError: (v: boolean) => void;
} {
  const [data, setData] = useState<OgpMini | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancel = false;
    setLoading(true);
    setImgError(false);

    void resolveWorkOgpMini({ url, workMap, workKey })
      .then((o) => {
        if (!cancel) setData(o);
      })
      .catch(() => {
        if (!cancel) setData({ title: null, imageUrl: null });
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [url, workMap, workKey]);

  return { data, loading, imgError, setImgError };
}
