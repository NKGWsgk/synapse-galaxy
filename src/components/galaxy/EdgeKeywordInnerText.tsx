"use client";

import { getEdgeKeywordPillLines } from "@/lib/edgeKeywordDisplay";

/** pill 等の幅制約下で折り込みを確実にする（button 内でも min-w-0 が効く block ラッパー） */
const EDGE_KEYWORD_TEXT_WRAP_CLS =
  "block min-h-0 min-w-0 w-full max-w-full [overflow-wrap:anywhere]";

/** GraphView / FocusCompass 共通: DB 明示改行・ZWSP 分行・中割りフォールバックを1経路に統一 */
export function EdgeKeywordInnerText({ keyword }: { keyword: string }) {
  const lines = getEdgeKeywordPillLines(keyword);
  if (lines.length >= 2) {
    return (
      <span className={EDGE_KEYWORD_TEXT_WRAP_CLS}>
        <span>{lines[0]}</span>
        <br />
        <span>{lines[1]}</span>
      </span>
    );
  }
  return <span className={EDGE_KEYWORD_TEXT_WRAP_CLS}>{lines[0]}</span>;
}
