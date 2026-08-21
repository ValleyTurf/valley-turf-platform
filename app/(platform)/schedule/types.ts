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
  // Priced off jobber_jobs.total, joined by jobber_job_id — NOT a
  // per-visit price. For a recurring job, this is the flat total for the
  // whole job/billing period (e.g. a $500/mo job's every visit carries
  // jobTotal: 500), so day/week/period sums must dedupe by jobId rather
  // than adding this per visit — see sumUniqueJobTotals in page.tsx and
  // its longer comment, which mirrors the same already-fixed bug in
  // lib/visitReportFormatting.ts's summarizeVisitsByJobType.
  jobId: string | null;
  jobTotal: number | null;
  jobIsRecurring: boolean;
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
