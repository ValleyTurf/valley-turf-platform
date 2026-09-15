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
