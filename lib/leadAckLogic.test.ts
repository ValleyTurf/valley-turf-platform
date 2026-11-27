import { describe, expect, it } from "vitest";
import { leadAckEmail, leadAckText } from "./leadAckLogic";

const base = {
  firstName: "Jane",
  businessName: "Valley Turf Revival",
  address: "123 Main St, Queen Creek, AZ 85142",
  turfSizeRange: "500-1000",
  photoCount: 2,
  notes: "Two dogs, gate code 1234",
};

describe("leadAckText", () => {
  it("greets by first name and names the business", () => {
    const text = leadAckText(base);
    expect(text).toContain("Hi Jane,");
    expect(text).toContain("Valley Turf Revival");
    expect(text).toContain("one business day");
  });
  it("falls back to there with no name", () => {
    expect(leadAckText({ ...base, firstName: null })).toContain("Hi there,");
  });
});

describe("leadAckEmail", () => {
  it("echoes what they submitted", () => {
    const email = leadAckEmail(base);
    expect(email.subject).toBe("We got your quote request");
    expect(email.body).toContain("Service address: 123 Main St");
    expect(email.body).toContain("Approximate turf size: 500-1000 sq ft");
    expect(email.body).toContain("Photos: 2 received");
    expect(email.body).toContain("Your notes: Two dogs");
  });
  it("leaves out the details block when nothing was given", () => {
    const email = leadAckEmail({
      ...base,
      address: null,
      turfSizeRange: null,
      photoCount: 0,
      notes: null,
    });
    expect(email.body).not.toContain("Here is what we have");
  });
});
