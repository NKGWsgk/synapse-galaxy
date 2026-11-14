import { unstable_cache } from "next/cache";
import { createAnonClient, type SynapseRow } from "@/lib/supabase/clients";
import { encodeFocusParam } from "@/lib/focusShareUrl";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { endpointWorkKey } from "@/lib/workEndpoint";
import { buildWorkEndpointMap, type WorkEndpointInfo } from "@/lib/workResolve";

export type WorkLink = {
  otherSlug: string;
  otherTitle: string;
  /** out: この作品 → 相手 / in: 相手 → この作品 */
  direction: "out" | "in";
  keyword: string | null;
  reason: string;
  likes: number;
  createdAt: string;
};

export type WorkEntry = {
  slug: string;
  title: string;
  imageUrl: string | null;
  description: string | null;
  links: WorkLink[];
  updatedAt: string;
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
/** サイト名やストア名だけのスラッグは作品を表さないので、id ベースの名前に置き換える */
const GENERIC_SLUG = /^(netflix|amazon|amazon-co-jp|amazon-com|youtube|spotify|prime-video|apple-music|unknown|untitled)$/i;

function shortId(workId: string, len: number): string {
  return workId.replace(/-/g, "").slice(0, len).toLowerCase();
}

function firstKeyword(s: SynapseRow): string | null {
  const k = s.keywords?.find((x) => x && x.trim());
  return k ? k.replace(/\s*\n\s*/g, "").trim() : null;
}

async function loadWorkEntries(): Promise<WorkEntry[]> {
  const supabase = createAnonClient();
  const synapses: SynapseRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("synapses")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as SynapseRow[];
    synapses.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  const workMap = await buildWorkEndpointMap(
    supabase,
    synapses.flatMap((s) => [s.source_url, s.target_url]),
  );

  const infoById = new Map<string, WorkEndpointInfo>();
  for (const info of Object.values(workMap)) {
    if (!infoById.has(info.workId) && info.title?.trim()) infoById.set(info.workId, info);
  }

  const slugById = new Map<string, string>();
  for (const [id, info] of infoById) {
    let slug: string | null = null;
    try {
      slug = encodeFocusParam(normalizeSynapseEndpoint(info.representativeUrl), workMap);
    } catch {
      slug = null;
    }
    const base = slug && !GENERIC_SLUG.test(slug.split("~")[0]!) ? slug : `work-${shortId(id, 8)}`;
    slugById.set(id, base);
  }
  // 念のため、最終的な重複は id 接尾辞で解消する
  const counts = new Map<string, number>();
  for (const slug of slugById.values()) counts.set(slug.toLowerCase(), (counts.get(slug.toLowerCase()) ?? 0) + 1);
  for (const [id, slug] of slugById) {
    if ((counts.get(slug.toLowerCase()) ?? 0) > 1 && !slug.includes("~")) slugById.set(id, `${slug}~${shortId(id, 6)}`);
  }

  const linksById = new Map<string, WorkLink[]>();
  const updatedById = new Map<string, string>();
  const touch = (id: string, at: string) => {
    if (at > (updatedById.get(id) ?? "")) updatedById.set(id, at);
  };
  const add = (id: string, link: WorkLink) => {
    if (!linksById.has(id)) linksById.set(id, []);
    linksById.get(id)!.push(link);
  };

  for (const s of synapses) {
    const a = endpointWorkKey(s.source_url, workMap);
    const b = endpointWorkKey(s.target_url, workMap);
    if (a === b || !slugById.has(a) || !slugById.has(b)) continue;
    const base = {
      keyword: firstKeyword(s),
      reason: (s.description ?? "").trim(),
      likes: s.likes_count ?? 0,
      createdAt: s.created_at,
    };
    add(a, { ...base, otherSlug: slugById.get(b)!, otherTitle: infoById.get(b)!.title!.trim(), direction: "out" });
    add(b, { ...base, otherSlug: slugById.get(a)!, otherTitle: infoById.get(a)!.title!.trim(), direction: "in" });
    const at = s.updated_at ?? s.created_at;
    touch(a, at);
    touch(b, at);
  }

  const entries: WorkEntry[] = [];
  for (const [id, links] of linksById) {
    const info = infoById.get(id)!;
    links.sort((x, y) => y.likes - x.likes || y.createdAt.localeCompare(x.createdAt));
    entries.push({
      slug: slugById.get(id)!,
      title: info.title!.trim(),
      imageUrl: info.imageUrl ?? null,
      description: info.description?.trim() || null,
      links,
      updatedAt: updatedById.get(id) ?? new Date(0).toISOString(),
    });
  }
  return entries.sort((x, y) => x.title.localeCompare(y.title, "ja"));
}

/** 1つ以上のシナプスでつながっている作品だけを返す（10分キャッシュ）。 */
export const getWorkEntries = unstable_cache(loadWorkEntries, ["work-entries-v1"], { revalidate: 600 });

export async function findWorkEntry(slug: string): Promise<WorkEntry | null> {
  const key = slug.toLowerCase();
  const entries = await getWorkEntries();
  return entries.find((e) => e.slug.toLowerCase() === key) ?? null;
}
