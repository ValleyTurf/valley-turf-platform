// Plain types shared between the server-rendered page and the client
// components it hands data to (ScheduleInteractive, ScheduleGrids,
// ScheduleMapPanel, ScheduleMapLeaflet). Kept in their own file, with no
// "use server"/"use client" directive, so both sides can import them
// freely.

export type ScheduleVisit = {
  id: string;
  clientId: string | null;
  customerName: string;
  address: string | null;
  phone: string | null;
  dateStr: string;
  dateHeading: string;
  dateTimeShort: string;
  startTimeLabel: string;
  endTimeLabel: string | null;
  durationMinutes: number;
  service: string | null;
  serviceLabel: string;
  serviceChipClass: string;
  serviceColorHex: string;
  statusLabel: string;
  statusClasses: string;
  statusDotClass: string;
  gateCode: string | null;
  specialInstructions: string | null;
  latitude: number | null;
  longitude: number | null;
  // Raw UTC timestamps, alongside the display-formatted fields above —
  // needed by the reschedule form and month-view drag-and-drop to know
  // the visit's exact current time-of-day (not just its formatted
  // label) so a date-only move can preserve it exactly. See
  // timeHelpers.ts's phoenixDateTimeParts.
  startAtIso: string | null;
  endAtIso: string | null;
  // A visit can have any number of assignees (big jobs, 2+ crew) — see
  // 018_visit_assignments_multi.sql.
  assignedUsers: AssignableUser[];
  // Priced off jobber_jobs.total, joined by jobber_job_id. This is the
  // job's flat total for its whole billing period (this app's
  // established convention — see lib/visitReportFormatting.ts and
  // recurring-services/page.tsx — treats that period as one calendar
  // month), not a per-visit price on its own.
  jobId: string | null;
  jobTotal: number | null;
  // How many of this job's visits fall in the same Phoenix-local
  // calendar month as this visit — the denominator behind visitPrice.
  // 1 for a true one-off job; >1 splits jobTotal evenly.
  jobVisitCountThisMonth: number;
  // jobTotal ÷ jobVisitCountThisMonth — what actually gets displayed as
  // "the price" for this visit (pills, modal, day/period sums). Summing
  // visitPrice across a job's visits always reconstructs jobTotal
  // exactly, so day/week/period totals can just add these up directly —
  // see sumVisitPrices in page.tsx.
  visitPrice: number | null;
};

export type AssignableUser = {
  id: string;
  name: string;
};

export type GridDate = {
  dateStr: string;
  dayNumber: number;
  weekdayShort: string;
  inMonth: boolean;
  isToday: boolean;
  dayHref: string;
};

export type SchedulePin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dateTimeShort: string;
  serviceLabel: string;
  color: string;
};
