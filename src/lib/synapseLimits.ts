/** シナプスの「接続タイトル」— SmartInput、`/api/synapse/smart-input`、グラフエッジ表示で共通 */
export const SYNAPSE_EDGE_TITLE_MAX_CHARS = 30;

/**
 * グラフ pill の1行あたりの目安（Unicode グリフ）。AI 改行指示・表示の強制分割の基準。
 * 横に長くなりすぎてカードと被るのを抑える。
 */
export const SYNAPSE_EDGE_LABEL_TARGET_CHARS_PER_LINE = 15;

/** pill 1行の上限（これを超えるなら 2 行に分ける／AI 応答は却下） */
export const SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE = 18;

/**
 * 句読点などで2行に分けるとき、各行の最低字数（Unicode グリフ）。
 * 全体が15文字以内でも「、」の直後など自然な切れ目があれば改行してよい。
 */
export const SYNAPSE_EDGE_LABEL_MIN_CHARS_PER_LINE = 5;

/**
 * この文字数（Unicode グリフ）**以上**の接続題だけ、改行 AI を呼ぶ（句読点での決定論的分割を試したあと）。
 * 未満かつ句読点分割も無いときは1行のまま。
 */
export const SYNAPSE_EDGE_AI_BREAK_FROM_CHARS = 10;

/** シナプスの「接続理由」— SmartInput、`/api/synapse/smart-input`、下書き保存で共通 */
export const SYNAPSE_EDGE_REASON_MAX_CHARS = 4000;
