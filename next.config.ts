import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** Worktree や複数 lockfile がある環境で、親リポジトリの package-lock に引っ張られないよう Turbo のルートを固定する */
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: rootDir,
  },
  async redirects() {
    return [
      // 外部の文章で「(https://…/)」のように閉じ括弧ごとリンクになったURL（/ に続く「)」）を、トップへ送る
      { source: "/\\)", destination: "/", permanent: true },
      { source: "/%29", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
