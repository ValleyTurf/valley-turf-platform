# Valley Turf Revival OS — Roadmap

Living list of where this platform is headed. Updated as we go — ask
Claude to add to it, re-prioritize it, or check something off.

**Standing constraint — never re-suggest these:** Ryan has explicitly
ruled out (1) same-day/multi-stop route optimization, (2) stock/inventory
level alerts, and (3) customer self-service features (e.g. self-serve
reschedule). Do not propose or build any of these three, in this doc or
elsewhere, even if they'd otherwise seem like a natural fit.

## Where things stand with Jobber today

Good news on the "don't lose anything" front: almost everything Jobber
knows is already mirrored into this app's own database every day
(customers, jobs, visits, invoices, payments, payouts, job notes, labor
hours) via the `sync-*` routes, plus instantly for anything edited
inside Jobber itself via its live webhooks (client/job/visit/invoice
create, update, delete). So today, if Jobber access disappeared
tomorrow, the *historical record* wouldn't be lost — it's already
sitting in this app's database.

What's *not* true yet: this app isn't the sole source of truth. New
customers, jobs, and quotes created **inside this app** already save
natively (no Jobber round-trip) — that's been true for a while. But
existing customers/jobs that originated in Jobber are still marked as
Jobber-sourced, and Jobber's own webhooks/daily syncs can still
overwrite fields on those records if something is edited directly in
Jobber. Invoices and payments are intentionally still a mixed
Jobber/native world (QuickBooks push, Stripe, the payment-fee tracking,
and the invoicing-mode migration all depend on that Jobber link for
now).

## Next up

1. ~~**Surface unrecognized inbound texts/emails instead of dropping them.**~~
   **Done.** A text or email reply from a number/address that doesn't
   match any customer on file now gets logged to a new `unknown_contacts`
   table (migration 066_add_unknown_contacts.sql) instead of just an
   error in the server log, and shows up in an "Unknown senders" panel
   on the Messages page with the sender's phone number or email, where
   it can be turned into a real Leads row with one click ("Add as
   Lead") or dismissed as noise.
2. **Full one-time data migration off Jobber.** Audit every
   Jobber-sourced customer/job/visit/quote record, confirm nothing is
   missing from the local mirror (some older/edge-case records may
   predate a given sync route), then re-label them as natively-owned
   going forward — so this app's database becomes the actual system of
   record, not just a mirror of one.
3. **Stop Jobber from writing into this app, except invoicing/payments.**
   Turn off the daily customer/job/visit sync crons and the
   corresponding live webhook handlers (client/job/visit
   create/update/delete), while leaving invoice, payment, payout, and
   payment-fee syncing exactly as-is.

   **Before this is safe to flip on, we need to know:** does anyone —
   you or the crew — still create or edit a customer, job, or visit
   *directly inside Jobber's own app or website*? If yes, those edits
   would stop showing up here the moment we cut the sync, and this app
   would quietly drift out of sync with reality. If everything's
   already being done through this app day-to-day, we're clear to
   proceed.

## Fresh ideas (CRM + website)

1. ~~**Capture inbound text replies.**~~ **Done.** A customer replying
   to a visit reminder/invoice text now gets logged and shown in
   Messages the same way an email reply already was, via a new Twilio
   inbound webhook.
2. ~~**Referral / lead-source tracking.**~~ **Done.** Not a full
   automated rewards program by design (Ryan's call — manual discounts
   so the terms can change any time without a rebuild). A "how did you
   hear about us?" field (Referral, Google, Instagram, Facebook, Word
   of Mouth, QR Code, Other) lives on the internal New Customer form
   and each customer's Property Profile — staff-only, never shown to
   the customer. Picking Referral links to the referring customer;
   picking QR Code picks from the real QR campaigns already tracked
   under Links & QR. Reporting is internal-only (Reports → Referral
   Sources): counts by source plus a top-referrers list.
3. ~~**Recurring-revenue dashboard.**~~ **Done.** An MRR-style view
   (Revenue → Recurring Revenue) — current MRR plus new/lost/net by
   month. Lost MRR tracks going forward only from a real cancellation
   timestamp (added when this shipped) rather than guessing at
   pre-existing churn.
4. ~~**Marketing site content/SEO buildout.**~~ **Done.** Added 62
   service x city combo pages (`/services/[service]/[city]`), sitewide
   breadcrumb navigation + BreadcrumbList schema, Service/LocalBusiness
   schema validated against Google's Rich Results Test, and self-updating
   `<lastmod>` dates in the sitemap.
5. **Seasonal promo automation.** Auto-send a targeted email/text
   campaign (e.g. spring startup, fall cleanup) to a filtered customer
   segment, reusing the Compose Email infrastructure that already
   exists.
6. **Photo-based before/after gallery, sourced from your own visit
   photos.** My Day already captures visit photos — surfacing the best
   of them (with customer permission) on the marketing site would beat
   hand-picking gallery images.
7. ~~**Team performance dashboard.**~~ **Done.** Reports → Team
   Performance (manager+ only) — avg time per visit and tips per crew
   member, for reviews and scheduling decisions. Cost accuracy was
   dropped: there's no expected/budgeted cost per job anywhere in the
   app to measure against, so it would've had no real benchmark.
