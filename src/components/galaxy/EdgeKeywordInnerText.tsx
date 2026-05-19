"use client";

import { getEdgeKeywordRenderPlan } from "@/lib/edgeKeywordDisplay";
import { jaKeywordSoftBreakHints } from "@/lib/jaKeywordLineBreak";

/** GraphView / FocusCompass 共通: 明示改行または ZWSP ヒント後の文言 */
export function EdgeKeywordInnerText({ keyword }: { keyword: string }) {
  const plan = getEdgeKeywordRenderPlan(keyword);
  if (plan.mode === "explicit") {
    const [a, b] = plan.lines;
    return (
      <>
        <span>{a}</span>
        <br />
        <span>{b}</span>
      </>
    );
  }
  return <>{jaKeywordSoftBreakHints(plan.raw)}</>;
}
