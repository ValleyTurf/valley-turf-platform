// Plain types shared between the server-rendered page and the client
// components it hands data to (ScheduleGrids, ScheduleMapPanel). Kept in
// their own file, with no "use server"/"use client" directive, so both
// sides can import them freely.

export type ScheduleVisit = {
  id: string;
  clientId: string | null;
  customerName: string;
  address: string | null;
  phone: string | null;
  dateStr: string;
  dateHeading: string;
  startTimeLabel: string;
  endTimeLabel: string | null;
  durationMinutes: number;
  service: string | null;
  serviceLabel: string;
  serviceChipClass: string;
  statusLabel: string;
  statusClasses: string;
  statusDotClass: string;
  gateCode: string | null;
  specialInstructions: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type GridDate = {
  dateStr: string;
  dayNumber: number;
  weekdayShort: string;
  inMonth: boolean;
  isToday: boolean;
  dayHref: string;
};
