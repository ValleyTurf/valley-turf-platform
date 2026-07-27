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
