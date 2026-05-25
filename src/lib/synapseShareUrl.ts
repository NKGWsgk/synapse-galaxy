const SYNAPSE_PARAM = "synapse";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSynapseShareId(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

export function readSynapseIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = new URLSearchParams(window.location.search).get(SYNAPSE_PARAM);
    return isSynapseShareId(id) ? id : null;
  } catch {
    return null;
  }
}

/** 接続理由詳細モーダル用。`?focus=` は維持し、`?synapse=` のみ更新する。 */
export function writeSynapseIdToUrl(synapseId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (synapseId) params.set(SYNAPSE_PARAM, synapseId);
    else params.delete(SYNAPSE_PARAM);
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  } catch {
    /* noop */
  }
}
