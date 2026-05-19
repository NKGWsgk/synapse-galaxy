import Link from "next/link";

type Props = {
  className?: string;
  onLinkClick?: () => void;
};

export function SiteFooter({ className = "", onLinkClick }: Props) {
  return (
    <footer
      className={[
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400",
        className,
      ].join(" ")}
    >
      <Link href="/terms" onClick={onLinkClick} className="transition hover:text-zinc-600">
        利用規約
      </Link>
      <span aria-hidden className="text-zinc-300">·</span>
      <Link href="/privacy" onClick={onLinkClick} className="transition hover:text-zinc-600">
        プライバシーポリシー
      </Link>
    </footer>
  );
}
