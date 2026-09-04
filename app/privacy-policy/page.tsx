export const dynamic = "force-static";

// Server-rendered mirror of valleyturfrevival.com/privacy-policy -- see
// proxy.ts's PUBLIC_PATHS entry for why this exists as a duplicate
// rather than just linking to the Jobber-hosted page: that page renders
// its actual text client-side, which is invisible to Twilio's A2P 10DLC
// campaign vetting crawler (a plain HTTP fetch, no JavaScript). This
// page has the identical, already-approved text as plain HTML instead,
// so it's readable on the very first response. Text content is owned by
// Ryan/the business, not this app -- if valleyturfrevival.com's policy
// text changes, this page needs the same edit made here too, since nothing
// keeps the two in sync automatically.
export default function PrivacyPolicyPage() {
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
          Privacy Policy
        </h1>

        <p className="mt-4 text-center text-sm text-[#6b705c]">
          Valley Turf Revival · Queen Creek, AZ · (480) 331-4596 ·
          valleyturfrevival@gmail.com
          <br />
          Effective date: August 30, 2026
        </p>

        <section className="mt-8 space-y-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <p>
            Valley Turf Revival (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) provides artificial turf cleaning and pet
            odor removal services in Queen Creek and the greater East
            Valley/Phoenix Metro area. This Privacy Policy explains what
            information we collect from customers, how we use it, and the
            choices you have.
          </p>

          <div>
            <h2 className="text-lg font-bold">Information We Collect</h2>
            <p className="mt-2">
              When you request a quote, schedule service, or otherwise
              interact with us, we may collect:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Contact information — name, phone number, email address,
                and service address
              </li>
              <li>
                Service details — property details, service history,
                photos of work performed, and notes related to your
                service
              </li>
              <li>
                Payment information — processed securely through our
                payment processor (Stripe); we do not store your full
                card number
              </li>
              <li>
                Communications — messages you send us by phone, text,
                email, or through our website or client portal
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold">How We Use Your Information</h2>
            <p className="mt-2">We use the information we collect to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Schedule and provide the services you request</li>
              <li>Send appointment reminders and &ldquo;on our way&rdquo; notifications</li>
              <li>Send invoices and process payments</li>
              <li>Respond to questions, quote requests, and service issues</li>
              <li>Maintain accurate service and billing records</li>
            </ul>
            <p className="mt-2">
              We do not sell your personal information to third parties.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Text Messaging (SMS)</h2>
            <p className="mt-2">
              If you provide your phone number, you may receive text
              messages from Valley Turf Revival related to your service,
              including:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Appointment &ldquo;on our way&rdquo; alerts when a crew
                is en route
              </li>
              <li>Invoice notifications with a secure link to view and pay your bill</li>
            </ul>
            <p className="mt-2">
              Message frequency varies based on your service schedule.
              Message and data rates may apply. You can opt out of text
              messages at any time by replying STOP to any message. Reply
              HELP for assistance. Text messaging consent is not shared
              with third parties for marketing purposes.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Sharing Your Information</h2>
            <p className="mt-2">
              We share information only as needed to operate our
              business, with service providers who help us run it,
              including:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Jobber — scheduling, dispatching, and client management</li>
              <li>Stripe — payment processing</li>
              <li>Twilio — text message delivery</li>
              <li>Resend — email delivery</li>
            </ul>
            <p className="mt-2">
              These providers are contractually limited to using your
              information only to provide services on our behalf.
            </p>
            <p className="mt-2">
              We may also disclose information if required by law.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Data Retention &amp; Security</h2>
            <p className="mt-2">
              We retain customer information for as long as needed to
              provide our services and maintain business records, and
              take reasonable measures to protect it against unauthorized
              access.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Your Choices</h2>
            <p className="mt-2">
              You can ask us to update or correct your contact
              information, or ask what information we have on file, at
              any time by contacting us using the information below. You
              can opt out of text messages by replying STOP, and
              unsubscribe from marketing emails using the link in any
              such email.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold">Contact Us</h2>
            <p className="mt-2">Questions about this policy? Reach us at:</p>
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

          <div>
            <h2 className="text-lg font-bold">Changes to This Policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. The
              &ldquo;Effective date&rdquo; above reflects the most recent
              revision.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
