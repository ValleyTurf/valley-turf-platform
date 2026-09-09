# Valley Turf Revival OS — Roadmap

Living list of where this platform is headed. Updated as we go — ask
Claude to add to it, re-prioritize it, or check something off.

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

1. **Full one-time data migration off Jobber.** Audit every
   Jobber-sourced customer/job/visit/quote record, confirm nothing is
   missing from the local mirror (some older/edge-case records may
   predate a given sync route), then re-label them as natively-owned
   going forward — so this app's database becomes the actual system of
   record, not just a mirror of one.
2. **Stop Jobber from writing into this app, except invoicing/payments.**
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

## Top 10 fresh ideas (CRM + website)

1. **Capture inbound text replies.** Right now a customer replying to
   an email gets logged automatically, but replying to a *text*
   (visit reminder, invoice, etc.) goes nowhere in the system — no
   inbound SMS webhook exists yet. This is the biggest blind spot in
   the current Messages setup.
2. **Customer self-serve reschedule in the portal.** Today customers
   can only *confirm* an upcoming visit. Letting them pick a different
   day within your existing rules (auto-approved if it's far enough
   out) would cut down on reschedule phone/text volume.
3. **At-risk/churn scoring.** Reactivation and Customer Intelligence
   already bucket customers by time-since-last-service — a real
   predictive score (declining frequency, late payments, complaint
   history) would catch customers before they go quiet, not after.
4. **Multi-stop route optimization**, not just distance display. My
   Day already shows drive legs between stops; actually re-ordering a
   day's (or week's) stops to minimize total drive time would save
   real fuel and hours.
5. **Referral program.** A trackable referral link/code per customer,
   a reward when it converts, and a leaderboard/report for you — ties
   the marketing site and CRM together and is a cheap way to grow.
6. **One-time add-on upsells at booking.** Let a customer tack on an
   extra deodorizing treatment, infill top-up, etc. when confirming a
   visit or requesting service, priced automatically off the pricing
   calculator that already exists for quotes.
7. **Push notifications**, not just the PWA install prompt — a crew
   member gets pinged the moment they're assigned a new visit; a
   customer gets a day-of alert beyond the 2-day/4-day email/text.
8. **Recurring-revenue dashboard.** You're a subscription-style
   business (Revival plans) — an MRR-style view (new/lost/net recurring
   revenue by month) would sit well next to the existing Revenue
   dashboard.
9. **Low-stock material alerts.** Materials & Costs already tracks
   usage per visit — flagging "you'll run out of X in about N visits at
   this rate" would prevent a crew showing up without supplies.
10. **Marketing site content/SEO buildout.** Per-city pages exist but
    are thin; a short FAQ/content block per city plus LocalBusiness
    schema markup would help local search ranking more than anything
    else easy to do on the site right now.
