export type EdgeKeywordRenderPlan =
  | { mode: "hints"; raw: string }
  | { mode: "explicit"; lines: readonly [string, string] };

/**
 * keywords[0] などの接続短題の表示計画。
 * - ユーザー／AI が U+000A を1個だけ規定すると explicit（ヒント処理はしない）。
 * - それ以外は従来の jaKeywordSoftBreakHints は呼び元で適用。
 */
export function getEdgeKeywordRenderPlan(raw: string): EdgeKeywordRenderPlan {
  const t = raw.normalize("NFC").replace(/\r/g, "\n");
  const i = t.indexOf("\n");
  if (i < 0) return { mode: "hints", raw: t };
  const head = t.slice(0, i).trimEnd();
  const tail = t.slice(i + 1).replace(/\n/g, "").trimStart();
  if (!head || !tail) {
    const flat = head || tail ? `${head}${tail}` : t.replace(/\n/g, "");
    return { mode: "hints", raw: flat };
  }
  return { mode: "explicit", lines: [head, tail] };
}
