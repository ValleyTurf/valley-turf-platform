"use client";

// Calls a customer through the CRM business number: the business number
// rings your own phone (saved on the Account page), then connects you to
// the customer, who sees the business number. Used wherever a customer's
// phone number appears, in place of a plain tel: link that would dial from
// your personal phone.
import { useState, useTransition, type ReactNode } from "react";
import { callCustomerViaBusinessLine, callNumberViaBusinessLine } from "@/lib/callActions";

export default function BusinessCallButton({
  jobberClientId,
  phone,
  contactId,
  className,
  stopPropagation,
  children,
}: {
  // Give either a saved customer (jobberClientId) or a raw phone number.
  jobberClientId?: string;
  phone?: string;
  contactId?: string | null;
  className?: string;
  // Set when this sits inside a clickable card, so tapping Call does not
  // also open the card.
  stopPropagation?: boolean;
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  return (
    <span className="inline-block">
      <button
        type="button"
        disabled={isPending}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          setError(null);
          setStarted(false);
          startTransition(async () => {
            const result = phone
              ? await callNumberViaBusinessLine(phone)
              : await callCustomerViaBusinessLine(jobberClientId ?? "", contactId);
            if (result.error) setError(result.error);
            else setStarted(true);
          });
        }}
        className={className ?? "font-semibold hover:underline disabled:opacity-60"}
      >
        {isPending ? "Starting..." : children}
      </button>

      {started ? (
        <span className="block text-xs font-normal text-[#6b705c]">
          Your phone is about to ring from the business number. Answer to connect.
        </span>
      ) : null}

      {error ? <span className="block text-xs font-normal text-[#9a2f22]">{error}</span> : null}
    </span>
  );
}
