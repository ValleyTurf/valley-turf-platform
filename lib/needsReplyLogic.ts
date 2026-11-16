// Pure "needs reply" decision (no database), see lib/needsReply.ts for the
// rules and for where the events come from.
export type ThreadEvent = {
  clientId: string;
  kind: "customer" | "staff" | "handled";
  at: string;
};

export type WaitingThread = {
  clientId: string;
  // When the first unanswered message arrived.
  since: string;
  // The newest unanswered message.
  lastInboundAt: string;
};

export function findWaitingThreads(events: ThreadEvent[]): WaitingThread[] {
  const byClient = new Map<string, ThreadEvent[]>();

  for (const event of events) {
    const list = byClient.get(event.clientId) ?? [];
    list.push(event);
    byClient.set(event.clientId, list);
  }

  const waiting: WaitingThread[] = [];

  for (const [clientId, list] of byClient) {
    let lastAnswer = "";

    for (const event of list) {
      if (event.kind !== "customer" && event.at > lastAnswer) {
        lastAnswer = event.at;
      }
    }

    const unanswered = list
      .filter((event) => event.kind === "customer" && event.at > lastAnswer)
      .map((event) => event.at)
      .sort();

    if (unanswered.length > 0) {
      waiting.push({
        clientId,
        since: unanswered[0],
        lastInboundAt: unanswered[unanswered.length - 1],
      });
    }
  }

  return waiting.sort((a, b) => (a.since < b.since ? -1 : 1));
}

// "20m", "3h", "2d" -- how long a customer has been waiting.
export function formatWaiting(sinceIso: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(sinceIso).getTime()) / 60000)
  );

  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (60 * 24))}d`;
}
