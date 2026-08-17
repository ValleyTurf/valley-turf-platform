"use client";

import { useState, type MouseEvent } from "react";

type CopyLinkButtonProps = {
  url: string;
  className?: string;
};

export default function CopyLinkButton({
  url,
  className,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(event: MouseEvent) {
    // Stops the click from bubbling up to an ancestor <summary> (this
    // button now also gets used inside collapsed QR/campaign rows on
    // /codes) -- without this, copying the link would also toggle that
    // row open/closed as an unrelated side effect.
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS); fail quietly.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        className ??
        "inline-flex w-full justify-center rounded-xl border border-[#174734] px-4 py-3 text-sm font-semibold text-[#174734] shadow-sm transition hover:bg-[#174734] hover:text-white"
      }
    >
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}
