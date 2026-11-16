import { describe, expect, it } from "vitest";
import { findWaitingThreads, formatWaiting } from "./needsReplyLogic";

describe("needsReplyLogic", () => {
  // Each check is one test; expected values compare by content.
  function eq(got: unknown, want: unknown, name: string) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }

  const e=(clientId:string,kind:"customer"|"staff"|"handled",at:string)=>({clientId,kind,at});
  eq(findWaitingThreads([e("a","customer","2026-11-10T10:00:00Z")]).map(t=>t.clientId),["a"],"unanswered");
  eq(findWaitingThreads([e("a","customer","2026-11-10T10:00:00Z"),e("a","staff","2026-11-10T11:00:00Z")]),[],"answered");
  const w=findWaitingThreads([e("a","customer","2026-11-10T10:00:00Z"),e("a","staff","2026-11-10T11:00:00Z"),e("a","customer","2026-11-11T09:00:00Z"),e("a","customer","2026-11-11T10:00:00Z")]);
  eq(w[0].since,"2026-11-11T09:00:00Z","since first unanswered after reply");
  eq(w[0].lastInboundAt,"2026-11-11T10:00:00Z","last inbound");
  eq(findWaitingThreads([e("a","customer","2026-11-10T10:00:00Z"),e("a","handled","2026-11-10T12:00:00Z")]),[],"handled");
  eq(findWaitingThreads([e("a","handled","2026-11-10T12:00:00Z"),e("a","customer","2026-11-10T13:00:00Z")]).length,1,"new msg after handled");
  eq(findWaitingThreads([e("b","customer","2026-11-12T10:00:00Z"),e("a","customer","2026-11-10T10:00:00Z")]).map(t=>t.clientId),["a","b"],"longest first");
  const now=new Date("2026-11-16T12:00:00Z");
  eq(formatWaiting("2026-11-16T11:40:00Z",now),"20m","m");
  eq(formatWaiting("2026-11-16T09:00:00Z",now),"3h","h");
  eq(formatWaiting("2026-11-14T12:00:00Z",now),"2d","d");
});
