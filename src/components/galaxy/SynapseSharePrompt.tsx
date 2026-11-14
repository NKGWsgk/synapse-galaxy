"use client";

import { useEffect, useState } from "react";
import { CopyLinkButton } from "@/components/galaxy/CopyLinkButton";
import { buildShareText, buildXIntentUrl } from "@/lib/synapseShareText";

type ShareInfo = { title: string; source: { title: string }; target: { title: string } };

/** シナプスを投稿した直後に出す「Xでシェア」カード。書き終えた直後が一番シェアされやすい。 */
export function SynapseSharePrompt({ synapseId, onClose }: { synapseId: string; onClose: () => void }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const shareUrl = origin ? `${origin}/s/${synapseId}` : "";

  useEffect(() => {
    let alive = true;
    fetch(`/api/synapse/${synapseId}/share`)
      .then((r) => (r.ok ? (r.json() as Promise<ShareInfo>) : null))
      .then((j) => { if (alive && j) setInfo(j); })
      .catch(() => {});
    return () => { alive = false; };
  }, [synapseId]);

  const href = info && shareUrl
    ? buildXIntentUrl(buildShareText({ title: info.title, source: info.source, target: info.target }), shareUrl)
    : null;

  return (
    <div
      role="dialog"
      aria-label="シナプスをシェア"
      className="fixed bottom-20 left-1/2 z-[250] w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-[#1A1B50]/15 bg-white p-4 shadow-xl"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute right-2 top-2 rounded p-1 text-zinc-400 transition hover:text-zinc-700"
      >
        ✕
      </button>
      <p className="pr-6 text-sm font-bold text-[#0D0D1C]">シナプスを繋ぎました！</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        {info ? `『${info.source.title}』→『${info.target.title}』` : "あなたのつながりを、友だちにも見せましょう。"}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            <span aria-hidden className="font-black">𝕏</span> でシェア
          </a>
        ) : (
          <span className="inline-flex items-center rounded-full bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-500">読み込み中…</span>
        )}
        <CopyLinkButton textToCopy={shareUrl} idleLabel="リンクをコピー" copiedLabel="コピー済" className="px-3 py-2 text-xs" />
      </div>
    </div>
  );
}
