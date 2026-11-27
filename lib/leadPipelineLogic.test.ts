import { describe, expect, it } from "vitest";
import { deriveLeadStage, leadNeedsAttention } from "./leadPipelineLogic";

const NOW = new Date("2026-11-27T18:00:00Z");
const q = (
  status: string,
  extra: Partial<{ expires_at: string | null; sent_at: string | null; created_at: string | null }> = {}
) => ({
  status,
  expires_at: null,
  sent_at: null,
  created_at: "2026-11-01T00:00:00Z",
  ...extra,
});

describe("deriveLeadStage", () => {
  it("is New with no quotes and no manual status", () => {
    expect(deriveLeadStage(null, [], NOW).key).toBe("new");
    expect(deriveLeadStage("New", [], NOW).key).toBe("new");
  });

  it("shows Contacted from the manual status", () => {
    expect(deriveLeadStage("contacted", [], NOW).key).toBe("contacted");
  });

  it("shows Quote Sent with how long ago", () => {
    const stage = deriveLeadStage("New", [q("sent", { sent_at: "2026-11-24T18:00:00Z" })], NOW);
    expect(stage.key).toBe("quote_sent");
    expect(stage.detail).toContain("3 days ago");
  });

  it("an accepted quote means Won, even if marked lost", () => {
    expect(deriveLeadStage("lost", [q("accepted")], NOW).key).toBe("won");
  });

  it("manual Lost beats a sent quote", () => {
    expect(deriveLeadStage("lost", [q("sent")], NOW).key).toBe("lost");
  });

  it("Can't Quote shows with no live quote, but a sent quote overrides it", () => {
    expect(deriveLeadStage("needs_info", [], NOW).key).toBe("cant_quote");
    expect(deriveLeadStage("needs_info", [q("sent")], NOW).key).toBe("quote_sent");
  });

  it("a sent quote past its expiry reads as Expired", () => {
    const stage = deriveLeadStage("new", [q("sent", { expires_at: "2026-11-10T00:00:00Z" })], NOW);
    expect(stage.key).toBe("quote_expired");
  });

  it("declined and draft quotes", () => {
    expect(deriveLeadStage("new", [q("declined")], NOW).key).toBe("quote_declined");
    expect(deriveLeadStage("new", [q("draft")], NOW).key).toBe("quote_drafted");
  });

  it("a live sent quote wins over an older declined one", () => {
    expect(deriveLeadStage("new", [q("declined"), q("sent")], NOW).key).toBe("quote_sent");
  });
});

describe("leadNeedsAttention", () => {
  it("flags new, drafted and expired only", () => {
    expect(leadNeedsAttention(deriveLeadStage("new", [], NOW))).toBe(true);
    expect(leadNeedsAttention(deriveLeadStage("new", [q("sent")], NOW))).toBe(false);
    expect(leadNeedsAttention(deriveLeadStage("lost", [], NOW))).toBe(false);
  });
});
