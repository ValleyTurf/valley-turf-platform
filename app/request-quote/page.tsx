export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, unauthenticated quote-request page — the site's own intake form,
// replacing the Jobber-embedded "Click Here for a Quote!" widget as what
// customers actually submit. Mirrors app/pay/[token]/page.tsx's Shell
// (unguessable-token pages) even though this page needs no token at all
// (it creates a new lead, doesn't look one up). See
// supabase/migrations/050_add_lead_form_fields.sql for the full "why" —
// short version: Jobber's own form has a locked-in marketing-SMS consent
// checkbox that Twilio's A2P 10DLC review won't allow next to a
// transactional-only opt-in, and that checkbox can't be removed from
// Jobber's side.
import RequestQuoteForm from "./RequestQuoteForm";

export default function RequestQuotePage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-10 text-[#174734] sm:px-6">
      <div className="mx-auto max-w-xl">
        {/* Plain <img>, not next/image — this SVG doesn't need the image
            optimizer (nothing to resize/compress on a vector logo), and
            skipping it avoids next.config.ts needing
            images.dangerouslyAllowSVG just to render one static asset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/logo.svg"
          alt="Valley Turf Revival"
          className="mx-auto h-16 w-auto"
        />
        <p className="mt-3 text-center text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival
        </p>
        <h1 className="mt-3 text-center text-3xl font-bold">
          Request a Quote
        </h1>
        <p className="mt-3 text-center text-[#6b705c]">
          Tell us about your turf and we&apos;ll get back to you with a
          quote — usually within one business day.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <RequestQuoteForm />
        </section>

        <p className="mt-6 text-center text-xs text-[#6b705c]">
          Prefer to call or text? Reach us at{" "}
          <a href="tel:4803314596" className="font-semibold text-[#174734]">
            (480) 331-4596
          </a>
          .
        </p>

        {/* Twilio A2P 10DLC campaign review checks the opt-in page itself
            for accessible Privacy Policy / Terms & Conditions links, not
            just the campaign's message_flow text field (error
            30908/30896/30882) -- see this page's own header comment for
            the full context. Kept in the page footer, separate from the
            consent checkbox's own inline links in RequestQuoteForm.tsx,
            so they're visible regardless of where on the page a reviewer
            looks. */}
        <p className="mt-3 text-center text-xs text-[#6b705c]">
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">
            Privacy Policy
          </a>
          {" · "}
          <a
            href="/terms-and-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Terms &amp; Conditions
          </a>
        </p>
      </div>
    </main>
  );
}
