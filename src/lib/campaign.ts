/** 「いいね！」アワードの日程（日本時間）。ここだけ直せばポップアップとお知らせページに反映される。 */
export const LIKE_AWARD = {
  announce: { label: "12月1日〜12月10日", start: "2026-12-01T00:00:00+09:00" },
  entry: { label: "12月11日〜25日", short: "12/11〜25", start: "2026-12-11T00:00:00+09:00" },
  review: { label: "12月25日〜1月1日", start: "2026-12-26T00:00:00+09:00" },
  result: { label: "1月3日ごろ", start: "2027-01-02T00:00:00+09:00" },
} as const;

export type AwardPhase = "before" | "announce" | "entry" | "review" | "result";

export function getAwardPhase(now: Date = new Date()): AwardPhase {
  const t = now.getTime();
  if (t >= new Date(LIKE_AWARD.result.start).getTime()) return "result";
  if (t >= new Date(LIKE_AWARD.review.start).getTime()) return "review";
  if (t >= new Date(LIKE_AWARD.entry.start).getTime()) return "entry";
  if (t >= new Date(LIKE_AWARD.announce.start).getTime()) return "announce";
  return "before";
}
