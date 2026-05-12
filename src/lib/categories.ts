export const CATEGORY_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  1: "LITERATURE",
  2: "DESIGN",
  3: "TECH",
  4: "HERITAGE",
  5: "SOUND",
  6: "FASHION",
  7: "PEOPLE",
  8: "LIFESTYLE",
};

/** Hex colors for UI: literature … space */
export const CATEGORY_COLORS: Record<CategoryId, string> = {
  1: "#c084fc",
  2: "#38bdf8",
  3: "#4ade80",
  4: "#fbbf24",
  5: "#f472b6",
  6: "#fb7185",
  7: "#f97316",
  8: "#a78bfa",
};

/**
 * 3×3グリッド上の位置（中心除く）。row/col は 0..2。
 * 中心 (1,1) を除く8マスに 1..8 を割り当て。
 */
export const CATEGORY_GRID_POS: Record<CategoryId, { row: number; col: number }> = {
  1: { row: 0, col: 0 },
  2: { row: 0, col: 1 },
  3: { row: 0, col: 2 },
  4: { row: 1, col: 0 },
  5: { row: 1, col: 2 },
  6: { row: 2, col: 0 },
  7: { row: 2, col: 1 },
  8: { row: 2, col: 2 },
};

export function categoryLabelJa(id: CategoryId): string {
  const m: Record<CategoryId, string> = {
    1: "文学",
    2: "デザイン",
    3: "テック",
    4: "遺産",
    5: "音",
    6: "ファッション",
    7: "人",
    8: "ライフスタイル",
  };
  return m[id];
}
