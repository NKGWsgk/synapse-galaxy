"use client";

import { useCallback, useState } from "react";

type Props = {
  /** クリップボードに書き込む文字列 */
  textToCopy: string;
  className?: string;
  /** 複数並べたとき用 */
  "aria-label"?: string;
  idleLabel?: string;
  copiedLabel?: string;
};

export function CopyLinkButton({
  textToCopy,
  className = "",
  "aria-label": ariaLabel,
  idleLabel = "コピー",
  copiedLabel = "コピー済",
}: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (!textToCopy.trim()) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 非HTTPS等では失敗しうるが、静かに握りつぶす */
    }
  }, [textToCopy]);

  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={!textToCopy.trim()}
      aria-label={ariaLabel ?? `リンクをコピー: ${textToCopy.slice(0, 80)}`}
      title={idleLabel}
      className={[
        "shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-600 transition",
        "hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700",
        "disabled:pointer-events-none disabled:opacity-40",
        copied ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800" : "",
        className,
      ].join(" ")}
    >
      {copied ? copiedLabel : idleLabel}
    </button>
  );
}
