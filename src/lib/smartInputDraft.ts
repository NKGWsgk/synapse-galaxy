import { SYNAPSE_EDGE_REASON_MAX_CHARS, SYNAPSE_EDGE_TITLE_MAX_CHARS } from "@/lib/synapseLimits";

const GUEST_STORAGE_KEY = "sgSmartInputDraft";
const USER_STORAGE_KEY_PREFIX = "sgSmartInputDraft:";

export type SmartInputDraft = {
  sourceUrl: string;
  targetUrl: string;
  title: string;
  description: string;
  savedAt: number;
};

function storageKey(userId: string | null): string {
  return userId ? `${USER_STORAGE_KEY_PREFIX}${userId}` : GUEST_STORAGE_KEY;
}

function sanitizeDraft(raw: unknown): SmartInputDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sourceUrl = typeof o.sourceUrl === "string" ? o.sourceUrl : "";
  const targetUrl = typeof o.targetUrl === "string" ? o.targetUrl : "";
  const title =
    typeof o.title === "string" ? o.title.slice(0, SYNAPSE_EDGE_TITLE_MAX_CHARS) : "";
  const description =
    typeof o.description === "string" ? o.description.slice(0, SYNAPSE_EDGE_REASON_MAX_CHARS) : "";
  const savedAt = typeof o.savedAt === "number" && Number.isFinite(o.savedAt) ? o.savedAt : Date.now();
  if (!hasSmartInputDraftContent({ sourceUrl, targetUrl, title, description })) return null;
  return { sourceUrl, targetUrl, title, description, savedAt };
}

export function hasSmartInputDraftContent(
  draft: Pick<SmartInputDraft, "sourceUrl" | "targetUrl" | "title" | "description">,
): boolean {
  return Boolean(
    draft.sourceUrl.trim() ||
      draft.targetUrl.trim() ||
      draft.title.trim() ||
      draft.description.trim(),
  );
}

export function loadSmartInputDraft(userId: string | null): SmartInputDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    return sanitizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSmartInputDraft(
  userId: string | null,
  draft: Pick<SmartInputDraft, "sourceUrl" | "targetUrl" | "title" | "description">,
): void {
  if (typeof window === "undefined") return;
  if (!hasSmartInputDraftContent(draft)) {
    clearSmartInputDraft(userId);
    return;
  }
  try {
    const packed: SmartInputDraft = {
      sourceUrl: draft.sourceUrl,
      targetUrl: draft.targetUrl,
      title: draft.title.slice(0, SYNAPSE_EDGE_TITLE_MAX_CHARS),
      description: draft.description.slice(0, SYNAPSE_EDGE_REASON_MAX_CHARS),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(storageKey(userId), JSON.stringify(packed));
  } catch {
    /* quota / private mode */
  }
}

export function clearSmartInputDraft(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* noop */
  }
}
