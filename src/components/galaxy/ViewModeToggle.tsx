export type ViewMode = "feed" | "map";

export function ViewModeToggle({
  mode,
  onSelect,
}: {
  mode: ViewMode;
  onSelect: (next: ViewMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 rounded-lg border border-zinc-200/90 bg-zinc-100/80 p-0.5"
      role="group"
      aria-label="表示モード"
    >
      <button
        type="button"
        aria-pressed={mode === "feed"}
        onClick={() => {
          if (mode !== "feed") onSelect("feed");
        }}
        className={[
          "rounded-md px-2 py-1 text-[10px] font-semibold transition",
          mode === "feed"
            ? "bg-white text-indigo-700 shadow-sm"
            : "text-zinc-500 hover:text-zinc-700",
        ].join(" ")}
      >
        フィード
      </button>
      <button
        type="button"
        aria-pressed={mode === "map"}
        onClick={() => {
          if (mode !== "map") onSelect("map");
        }}
        className={[
          "rounded-md px-2 py-1 text-[10px] font-semibold transition",
          mode === "map"
            ? "bg-white text-indigo-700 shadow-sm"
            : "text-zinc-500 hover:text-zinc-700",
        ].join(" ")}
      >
        マップ
      </button>
    </div>
  );
}
