import { NextResponse } from "next/server";
import { resolveGoogleClientIdFromEnv } from "@/lib/googleSignIn";

/** 実行時に Google Client ID を返す（Vercel env をビルド後でも参照できる） */
export async function GET() {
  return NextResponse.json({ googleClientId: resolveGoogleClientIdFromEnv() });
}
