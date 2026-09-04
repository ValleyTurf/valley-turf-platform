export const dynamic = "force-static";

// Server-rendered mirror of valleyturfrevival.com/terms-and-conditions --
// same reasoning as app/privacy-policy/page.tsx's header comment (see
// there for the full explanation): Twilio's campaign vetting crawler
// can't see the Jobber-hosted page's client-rendered text, so this page
// carries the identical, already-approved text as plain server-rendered
// HTML instead. Keep in sync manually with valleyturfrevival.com if that
// page's text ever changes.
export default function TermsAndConditionsPage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-10 text-[#174734] sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/logo.svg"
          alt="Valley Turf Revival"
          className="mx-auto h-16 w-auto"
        />

        <h1 className="mt-6 text-center text-3xl font-bold">
          Terms and Conditions
        </h1>

        <p className="mt-4 text-center text-sm text-[#6b705c]">
          Valley Turf Revival · Queen Creek, AZ · (480) 331-4596 ·
          valleyturfrevival@gmail.com
          <br />
          Effective date: August 30, 2026
        </p>

        <section className="mt-8 space-y-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use
            of services provided by Valley Turf Revival (&ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By requesting a
            quote, scheduling service, or otherwise engaging us, you
            agree to these Terms.
          </p>

          <div>
            <h2 className="text-lg font-bold">Our Services</h2>
            <p className="mt-2">
              Valley Turf Revival provides artificial turf cleaning, pet
              odor removal, and related lawn maintenance services in
              Queen Creek and the greater East Valley/Phoenix Metro area,
              as described at the time of your quote or booking.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Quotes &amp; Pricing</h2>
            <p className="mt-2">
              Quotes are based on information provided at the time of
              request, including property size and condition. Final
              pricing may be adjusted if actual conditions differ
              materially from what was described (for example, turf
              size, staining, or damage not visible from photos). We will
              communicate any pricing changes before completing work
              whenever possible.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Scheduling &amp; Cancellations</h2>
            <p className="mt-2">
              We do our best to arrive within the scheduled window and
              will notify you if a delay occurs. If you need to
              reschedule or cancel a visit, please contact us as soon as
              possible; recurring service plans can be paused or canceled
              at any time by contacting us.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Payment</h2>
            <p className="mt-2">
              Payment is due upon receipt of invoice unless other
              arrangements have been made. We accept payment through the
              methods offered on your invoice, processed securely via
              Stripe. Recurring/autopay customers authorize us to charge
              their saved payment method for each completed service.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">
              Communications &amp; Text Messaging
            </h2>
            <p className="mt-2">
              By providing your phone number, you consent to receive
              service-related communications from us, including
              appointment alerts and invoice notifications by text
              message. Message and data rates may apply. You may opt out
              of text messages at any time by replying STOP. See our{" "}
              <a href="/privacy-policy" className="underline">
                Privacy Policy
              </a>{" "}
              for more detail on how we handle your information.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Satisfaction</h2>
            <p className="mt-2">
              If you&apos;re not satisfied with a completed service,
              please contact us within a reasonable time so we can make
              it right.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Limitation of Liability</h2>
            <p className="mt-2">
              While we take care to protect your property during service,
              Valley Turf Revival is not responsible for pre-existing
              damage, wear, or conditions unrelated to the work
              performed. Our liability for any claim related to our
              services is limited to the amount paid for the service in
              question.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Changes to These Terms</h2>
            <p className="mt-2">
              We may update these Terms from time to time. The
              &ldquo;Effective date&rdquo; above reflects the most recent
              revision. Continued use of our services after changes take
              effect constitutes acceptance of the updated Terms.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Contact Us</h2>
            <p className="mt-2">Questions about these Terms? Reach us at:</p>
            <p className="mt-2">
              Valley Turf Revival
              <br />
              (480) 331-4596
              <br />
              valleyturfrevival@gmail.com
              <br />
              valleyturfrevival.com
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
