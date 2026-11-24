# Valley Turf Revival OS — Roadmap

Living list of where this platform is headed. Updated as we go — ask
Claude to add to it, re-prioritize it, or check something off.

**Standing constraint — never re-suggest these:** Ryan has explicitly
ruled out (1) same-day/multi-stop route optimization, (2) stock/inventory
level alerts, (3) customer self-service features (e.g. self-serve
reschedule), and (4) proactive weather-day/schedule-disruption alerts to
customers. Do not propose or build any of these four, in this doc or
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
2. ~~**Full one-time data migration off Jobber.**~~ **Done.** Migration
   067 relabeled every existing customer/job/visit from
   `source: 'jobber'` to `source: 'native'` in one pass — this app's
   database is now the system of record for all three, not just a
   mirror. Quotes (no source column) and invoicing/payments were
   deliberately untouched — invoicing/payments stay wired to Jobber
   until a later, separate migration (tracked by the Stage 7 rollout at
   /invoices/routing).

   **Still open:** job 1269 was the one active recurring job whose
   cadence couldn't be auto-inferred from visit history at migration
   time — confirm whether its recurring schedule was ever set to
   semiannual by hand via its "Update recurring schedule" toggle; if
   not, that's still outstanding.
3. ~~**Stop Jobber from writing into this app, except
   invoicing/payments.**~~ **Done**, same cutover. The daily
   customer/job/visit sync crons and their live webhook handlers
   (client/job/visit create/update/delete) are now no-ops — an edit made
   directly in Jobber no longer reaches this app. Invoice, payment,
   payout, and payment-fee syncing are untouched.

   **Side effect confirmed with Ryan (2026-09-15):** this also silently
   stopped the *other* direction — completing/rescheduling/skipping a
   visit in this app no longer pushes that change into Jobber either,
   since `lib/jobberVisit.ts`'s mutations skip calling Jobber for any
   visit whose `source` is `'native'`, which is now everything (see
   `isNativelyManagedVisit`). Confirmed this is fine to leave as-is —
   Jobber-side jobs/visits will just show as perpetually open/incomplete
   going forward, which doesn't matter since Jobber is only still relied
   on for invoicing/payments on customers not yet moved to native
   invoicing.

## Top 10 (November 2026)

Agreed with Ryan 2026-11-15. Items 1-9 approved; 10 waits on Gusto.

1. ~~**Reminder links use the real address.**~~ **Done.** Cron-sent
   links (visit confirm, overdue pay link, quote follow-up) now go out
   as go.valleyturfrevival.com instead of a temporary Vercel address
   (`lib/baseUrl.ts`).
2. ~~**Why some customers don't get or can't open messages.**~~
   **Checked.** `/api/ops/delivery-check?q=<name>` reads Twilio's real
   delivery status and our email log. Result (Nov 2026): 928 of 930
   texts were delivered, and Katie Ray's and Chris Brown's messages were
   delivered too. The likely cause is their phones filtering a text from
   an unknown number, plus Katie Ray having no email on file and Chris
   Brown's emails going delivered but unopened. One invoice text to
   another customer was blocked by the carrier (error 30007) and nobody
   knew, which is what the second list's #1 fixes.
3. ~~**Re-send the invoice at 1, 3, 7, 14 days overdue.**~~ **Done.**
   Daily reminders stay; on those four days the invoice itself (PDF +
   Pay Now) goes out instead of the plain reminder
   (`lib/invoiceReminders.ts`, `INVOICE_RESEND_DAYS`).
4. ~~**Autopay options.**~~ **Done.** Per customer (customer page >
   Autopay): charge when invoiced; pay AHEAD on a set day of the month
   (one invoice for the recurring visits until the next pay date, built
   and charged automatically, previewed in the digest the day before);
   or N days after each invoice. For pay-ahead customers, extras are
   charged right away and a paid-for visit that's skipped is flagged in
   the digest, not refunded automatically. Saving a card charges
   anything already due. Settings > Autopay lists recurring customers
   not enrolled (`lib/autopayPrepay.ts`, `lib/autopaySchedule.ts`,
   migration 105).
5. ~~**Match bank deposits to invoices.**~~ **Done.** Reconciliation >
   Match Deposits suggests the unpaid invoice(s) a deposit pays (exact
   amount only) and marks them paid in one step. Zelle added as a
   payment method (`lib/depositMatches.ts`, migration 106).
6. ~~**Bank feed category rules.**~~ **Done.** "Remember this for
   future bank transactions" on any expense; rules listed on Settings >
   Bank Feed (`lib/expenseRules.ts`, migration 107).
7. ~~**Nightly check for gaps in recurring schedules.**~~ **Done.**
   Daily digest section plus a "Schedule gaps to review" panel on
   Recurring Services with a "This is intended" button
   (`lib/recurringGaps.ts`). Skips made before 2026-11-15 can't be
   matched to a job and need that one-time click.
8. ~~**Page-crash safety net.**~~ **Done.** Crash screen with Try
   Again and, for admins, the real error; every server error logged
   (`lib/pageErrors.ts`), shown on System Health and in the digest.
9. ~~**Broader push notifications.**~~ **Done.** Unknown senders,
   missed calls, payments, autopay failures, low ratings; per-person
   on/off on the Account page; money-related ones admin-only; tapbacks
   filed as a quiet reaction (`lib/pushKinds.ts`, `lib/tapbacks.ts`,
   migration 108).
10. **Send timeclock hours to Gusto.** On hold until Gusto is set up.

## Top 10, second list (November 2026)

Proposed 2026-11-16. Ryan picked 1, 4, 7, 8, 9 and 10; the rest are
parked.

1. ~~**Track whether each text was delivered.**~~ **Done.** Every
   customer text asks Twilio to report back
   (`lib/twilioSend.ts`, `/api/webhooks/twilio-status`); the result shows
   on the message thread and customer page, failures are listed in the
   daily digest, and an automated text that fails is emailed to the
   customer once if they have an email (`lib/twilioDelivery.ts`,
   migration 109).
2. **Get customers to save the business number.** Parked.
3. **Text back missed calls.** Parked.
4. ~~**Needs-reply view and saved replies.**~~ **Done.** Messages >
   Needs reply (customer wrote last, nobody on staff has answered,
   longest wait first) with a "No reply needed" button; saved replies in
   the reply box with {first_name}; customers waiting over a day show in
   the daily digest (`lib/needsReply.ts`, migration 110).
5. **Warn before a saved card expires.** Parked.
6. **Price increase tool.** Parked.
7. ~~**Finish leaving Jobber.**~~ **Done (the report).** Settings >
   Leaving Jobber shows who is still invoiced through Jobber, unpaid
   Jobber invoices, payments that came through Jobber, the syncs still
   running, and a safe-to-cancel verdict (`lib/jobberExit.ts`). Moving
   the remaining customers over is still done from /invoices/routing,
   and the Jobber syncs get switched off once the report is clear.
8. ~~**Tax-time package.**~~ **Done.** Revenue > Profit & Loss > Tax
   Package: one ZIP per year with profit and loss by month, expenses by
   category and in detail, journal entries kept separate, payments by
   method, and a README (`lib/taxPackage.ts`).
9. ~~**Save the tests, clear out the diagnostics.**~~ **Done.** Tests for
   the logic written this fall are saved in `lib/*.test.ts` (run by CI),
   and 73 one-off debug, lookup, flip and backfill routes were removed.
10. ~~**Business details as settings.**~~ **Done.** Settings > Business
    Details (admin only): name, phone, website and who signs quotes now
    feed customer texts, emails and invoice PDFs (`lib/business.ts`,
    migration 111). The public website pages and the Phoenix time zone
    are still fixed in code.

## Top 10, third list (November 2026)

Proposed 2026-11-16. Ryan picked 4, 5 and 8; the rest are parked.

1. **Recover failed card charges.** Parked.
2. **Credit for skipped prepaid visits.** Parked.
3. ~~**Alert if a scheduled job does not run.**~~ **Done** (see the fourth list, item 8).
4. ~~**Automatic weekly backup.**~~ **Done.** Every Sunday the app saves a
   ZIP of about 80 tables (no passwords or tokens) to a private storage
   bucket, keeps the newest 8, and emails the digest recipients a 7-day
   download link, or a failure notice. System Health has a Weekly backup
   check (`lib/backup.ts`, `lib/backupTables.ts`, migration 112).
5. ~~**Month-end close checklist.**~~ **Done.** Reconciliation > Month-end
   close: per month, bank charges to review, deposits to match, bank vs.
   app balances, failed card charges, unpaid invoices, and the month's
   P&L. Closing saves a snapshot and the month shows "changed since
   close" if invoices or expenses move later (`lib/monthClose.ts`,
   migration 113).
6. **New-lead response timer.** Parked.
7. **Capture why customers leave.** Parked.
8. ~~**Find and merge duplicate customers.**~~ **Done.** Customers > Find
   Duplicates (same phone, email, or name and address). Merging moves
   every invoice, job, visit, payment, message and saved card to the kept
   customer in one transaction, keeps a full copy of the removed record,
   and points late Jobber syncs for the old id at the kept customer
   (`lib/duplicateCustomers.ts`, migration 114).
9. **Crew checklist per visit.** Parked.
10. **Two-step sign-in for admin and manager.** Parked.

## Top 10, fourth list (November 2026)

Proposed 2026-11-24. Ryan picked 7 and 8; the rest are parked.

7. ~~**Payment history and receipts in the portal.**~~ **Done.** Portal >
   Payments lists every payment with date, method, invoice number, tip and
   any refund (partial or full), shows attempts that did not go through,
   and downloads a PDF receipt. Receipts are looked up by the signed-in
   customer's own id, so another customer's id returns 404
   (`lib/portalPaymentsLogic.ts`, `lib/portalPayments.ts`,
   `lib/paymentReceiptPdf.ts`, `app/portal/payments`,
   `app/portal/receipts/[paymentId]`). The card brand and last 4 are not
   shown: the payment rows do not record which card was used.
8. ~~**Alert if a scheduled job does not run.**~~ **Done.** A watchdog
   (`/api/ops/check-scheduled-jobs`, hourly) compares every cron in
   `vercel.json` against its last run and alerts admins by push and email
   when one is late, failed or stuck, with 24-hour reminders and
   quiet hours overnight. System Health shows the open alerts
   (`lib/cronWatchLogic.ts`, `lib/cronWatch.ts`, migration 120). It is
   itself a cron, so it cannot report if every cron stops.

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
5. ~~**Seasonal promo automation.**~~ **Done.** Marketing → Campaigns
   (manager+ only) — build a customer segment (recurring status, plan,
   city), write a message once, and send it yourself on email and/or
   text. Manual by design (Ryan's call — nothing runs on a schedule),
   reuses the same send functions Compose Email/Text already use.
6. ~~**Photo-based before/after gallery, sourced from your own visit
   photos.**~~ **Done.** Marketing → Photo Gallery — staff pick the best
   visit photos from customers who've checked "OK to feature photos" on
   their Property Profile; featured ones show up in a new "Real results
   from our customers" section on the homepage, alongside (not
   replacing) the existing hand-picked galleries.
7. ~~**Team performance dashboard.**~~ **Done.** Reports → Team
   Performance (manager+ only) — avg time per visit and tips per crew
   member, for reviews and scheduling decisions. Cost accuracy was
   dropped: there's no expected/budgeted cost per job anywhere in the
   app to measure against, so it would've had no real benchmark.
8. **Referral discount ledger.** Item 2's referral tracking records WHO
   referred whom, but not whether the manual discount you owe each side
   has actually been applied yet — a simple "credit owed / credit
   applied" log per customer would stop a promised discount from
   getting forgotten a few invoices later. *Not pursuing right now.*
9. ~~**Private feedback funnel before the public review ask.**~~
   **Skipped** — superseded by item 10's star rating on the receipt,
   which already gates on the rating itself rather than needing a
   separate private-feedback form.
10. ~~**Post-visit satisfaction rating.**~~ **Done.** The 5-star "Did we
    do a great job?" block already at the bottom of every invoice email
    is now clickable — each star links to a new public /rate/[token]
    page (same link token as Pay Now) with a confirm step before
    anything is recorded, so an email security scanner pre-fetching the
    link can't silently log a fake rating. Only a genuine 5-star
    continues on to the real Google review link (looked up fresh each
    time, so changing that URL later applies to old emails too); 1-4
    stays internal, alerts Ryan immediately by text and email, and also
    shows up in the daily digest's "Low invoice ratings" section as a
    backstop. Not wired into Customer Intelligence's churn-risk scoring
    yet — worth revisiting once there's enough rating history to be a
    meaningful signal.
11. **Equipment maintenance tracking.** The existing Equipment costing
    section tracks what equipment costs, not when it was last
    serviced — a simple maintenance-due list (e.g. "sprayer due for
    cleaning") would catch wear before it turns into a bigger repair or
    a bad clean. *Not pursuing right now.*
12. **Crew service-completion checklist — interested, design TBD.** A
    short per-visit-type checklist (e.g. brushed, rinsed, photo taken,
    gate secured) crew check off from My Day — keeps quality consistent
    across the team and gives you something concrete to point to if a
    customer ever disputes what was actually done.
13. **Team incentive/bonus calculator — interested, design TBD.**
    Builds on the Team Performance scorecard — turn visits/tips/avg
    time into a suggested bonus number for a pay period, so reviews
    aren't just "here's your data" but "here's what it's worth."
14. **Cash flow forecast.** Builds on the Recurring Revenue dashboard —
    layer in AR aging/expected collections for a near-term "what's
    actually coming in the next 30/60 days" view, not just MRR. *Not
    pursuing right now.*
15. **Warranty / re-clean tracking.** Flag and track visits that were
    free redo/warranty work separately from normal paid visits — a
    rising redo rate for a crew member or service type is worth knowing
    about before customers start mentioning it. *Not pursuing right
    now.*
16. **Auto-draft Google Business Profile posts.** Reuses item 6's photo
    curation — turn a freshly featured gallery photo into a drafted GBP
    post (you still review/publish it) instead of writing one from
    scratch.
17. ~~**Inbound calls, forwarded and logged like everything else.**~~
    **Done.** A new voice webhook
    (app/api/webhooks/twilio-voice/route.ts) replaces the quick TwiML
    Bin forward — set it as the Voice config's webhook (not the TwiML
    Bin) to switch over. An inbound call still forwards to Ryan's cell,
    but now also logs to that customer's Contact History (channel:
    "call") once the call ends, with the outcome (answered + duration,
    or missed + why) — same as texts and emails already do, so it shows
    up in the CRM timeline, not just on Ryan's phone. A call from a
    number that doesn't match any customer lands in the same "Unknown
    senders" review queue on Messages that unrecognized texts/emails
    already use (migration 075), instead of vanishing.
18. ~~**Native multi-line-item jobs.**~~ **Done.** Jobs can now carry a
    real ordered list of line items (name + price each) instead of one
    flat total — migration 077's `native_job_line_items` table,
    backfilled from the ~26 legacy Jobber jobs that already had more
    than one item snapshotted (migration 068). Manage Job and New Job
    both show a repeatable add/remove line-item editor in place of the
    old locked "(multiple line items — edit in Jobber)" message; My Day
    surfaces any extra item beyond the base service on a visit's card so
    the crew sees an add-on without opening the job; invoice creation
    already consumed job line items generically, so it started reflecting
    real multi-item native jobs with no changes needed there.
19. **Auto-flip Monthly Maintenance jobs to Full for the right months —
    interested, design TBD.** Some Monthly Maintenance Plan customers
    also get a periodic Full Cleaning layered on top — e.g. Kaleen
    Carter gets Full cleanings in March/June/September/December (a
    quarterly cadence) and regular Maintenance the other 8 months;
    others have a triannual Full cadence, others no Full at all. Ryan
    wants the system to automatically figure out, for each occurrence of
    a Monthly Maintenance Plan job, whether that month should be labeled
    "Maintenance - Monthly" or "Full - Monthly" — instead of tracking it
    by hand. Needs a look at how Full vs. Maintenance visits are
    actually modeled today (separate recurring jobs vs. a per-visit
    label) before this can be properly scoped.
