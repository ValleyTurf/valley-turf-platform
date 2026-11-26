// Pure helpers for the Calls & Voicemails list on the Messages page.
export type CallKind = "voicemail" | "missed" | "answered" | "outgoing";

export function classifyCall(params: {
  direction: string | null | undefined;
  relatedType: string | null | undefined;
  summary: string | null | undefined;
}): CallKind {
  if (params.relatedType === "voicemail") return "voicemail";
  if (params.direction === "outbound") return "outgoing";
  if ((params.summary ?? "").toLowerCase().startsWith("missed")) return "missed";
  return "answered";
}

export function callKindLabel(kind: CallKind): string {
  switch (kind) {
    case "voicemail":
      return "Voicemail";
    case "missed":
      return "Missed call";
    case "answered":
      return "Answered";
    case "outgoing":
      return "Outgoing";
  }
}

// Voicemails and missed calls are the ones someone may still need to call back.
export function needsCallback(kind: CallKind): boolean {
  return kind === "voicemail" || kind === "missed";
}

export function countNeedingCallback(
  entries: Array<{ kind: CallKind; createdAt: string }>,
  now: Date,
  days = 7
): number {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return entries.filter((e) => needsCallback(e.kind) && new Date(e.createdAt).getTime() >= cutoff).length;
}
