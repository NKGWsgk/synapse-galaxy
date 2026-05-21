#!/usr/bin/env npx tsx
/**
 * contents_metadata.title を extractPureWorkTitle で一括正規化する。
 *
 *   npx tsx scripts/backfill-pure-titles.mts          # dry-run
 *   npx tsx scripts/backfill-pure-titles.mts --apply  # DB 更新
 *
 * 環境変数: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const mod = (p: string) => `${p}?v=${Date.now()}`;
const { extractPureWorkTitle } = await import(mod("../src/lib/pureWorkTitle.ts"));
const { computeWorkFingerprint } = await import(mod("../src/lib/workIdentity.ts"));

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Row = { url: string; title: string | null; work_fingerprint: string | null };

async function hasWorkFingerprintColumn(): Promise<boolean> {
  const { error } = await supabase.from("contents_metadata").select("work_fingerprint").limit(1);
  if (!error) return true;
  if (/work_fingerprint/i.test(error.message)) return false;
  throw new Error(error.message);
}

async function main() {
  const fingerprintCol = await hasWorkFingerprintColumn();
  const { data, error } = await supabase.from("contents_metadata").select("url,title,work_fingerprint");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const changes: { url: string; from: string; to: string; fp?: string }[] = [];

  for (const row of rows) {
    const stored = row.title?.trim() ?? "";
    if (!stored) continue;
    const pure = extractPureWorkTitle(row.title, row.url);
    if (!pure || pure === stored) continue;
    const next: { url: string; from: string; to: string; fp?: string } = {
      url: row.url,
      from: stored,
      to: pure,
    };
    if (fingerprintCol) {
      const fp = computeWorkFingerprint(pure, row.url);
      if (fp !== row.work_fingerprint) next.fp = fp;
    }
    changes.push(next);
  }

  console.log(`rows: ${rows.length}, title changes: ${changes.length}`);
  console.log(APPLY ? "MODE: apply" : "MODE: dry-run (pass --apply to write)");

  for (const c of changes.slice(0, 20)) {
    console.log(`  ${c.url.slice(0, 72)}`);
    console.log(`    ${c.from.slice(0, 60)} → ${c.to}`);
  }
  if (changes.length > 20) console.log(`  … and ${changes.length - 20} more`);

  if (!APPLY) return;

  let ok = 0;
  let fail = 0;
  for (const c of changes) {
    const payload: Record<string, unknown> = {
      title: c.to,
      updated_at: new Date().toISOString(),
    };
    if (c.fp) payload.work_fingerprint = c.fp;
    const { error: upErr } = await supabase.from("contents_metadata").update(payload).eq("url", c.url);
    if (upErr) {
      if (c.fp && /work_fingerprint/i.test(upErr.message)) {
        const { error: retry } = await supabase
          .from("contents_metadata")
          .update({ title: c.to, updated_at: payload.updated_at })
          .eq("url", c.url);
        if (retry) {
          fail++;
          console.warn(`  FAIL ${c.url.slice(0, 60)}… ${retry.message}`);
          continue;
        }
      } else {
        fail++;
        console.warn(`  FAIL ${c.url.slice(0, 60)}… ${upErr.message}`);
        continue;
      }
    }
    ok++;
  }
  console.log(`updated: ${ok}, failed: ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
