"use client";

import type { ReactNode } from "react";

// Drop-in replacement for a plain `<button type="submit">` inside a
// server-action form. Confirms before letting a destructive action (a
// delete, usually) actually submit — this is the only client-side piece,
// the surrounding form and action stay exactly as they were.
export default function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
