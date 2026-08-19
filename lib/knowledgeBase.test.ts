import { describe, expect, it } from "vitest";
import {
  parseTagsInput,
  distinctTags,
  matchesSearch,
  parseMarkdownLite,
} from "./knowledgeBase";

describe("parseTagsInput", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseTagsInput(" Safety, Mowing ,  Equipment")).toEqual([
      "safety",
      "mowing",
      "equipment",
    ]);
  });

  it("lowercases so casing differences don't create duplicate tags", () => {
    expect(parseTagsInput("Safety, safety, SAFETY")).toEqual(["safety"]);
  });

  it("drops empty segments from trailing/double commas", () => {
    expect(parseTagsInput("safety,, mowing,")).toEqual(["safety", "mowing"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseTagsInput("")).toEqual([]);
    expect(parseTagsInput("   ")).toEqual([]);
  });
});

describe("distinctTags", () => {
  it("collects and sorts every unique tag across articles", () => {
    const articles = [
      { tags: ["mowing", "safety"] },
      { tags: ["safety", "equipment"] },
      { tags: [] },
    ];
    expect(distinctTags(articles)).toEqual(["equipment", "mowing", "safety"]);
  });

  it("returns an empty array when no articles have tags", () => {
    expect(distinctTags([{ tags: [] }, { tags: [] }])).toEqual([]);
  });
});

describe("matchesSearch", () => {
  const article = {
    title: "Mower Safety Checklist",
    content: "Always check the blade guard before starting.",
    tags: ["safety", "equipment"],
  };

  it("matches on title, case-insensitively", () => {
    expect(matchesSearch(article, "mower")).toBe(true);
    expect(matchesSearch(article, "MOWER")).toBe(true);
  });

  it("matches on content", () => {
    expect(matchesSearch(article, "blade guard")).toBe(true);
  });

  it("matches on tags", () => {
    expect(matchesSearch(article, "equip")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchesSearch(article, "invoice")).toBe(false);
  });

  it("treats a blank query as matching everything", () => {
    expect(matchesSearch(article, "")).toBe(true);
    expect(matchesSearch(article, "   ")).toBe(true);
  });
});

describe("parseMarkdownLite", () => {
  it("splits blank-line-separated text into paragraph blocks", () => {
    const blocks = parseMarkdownLite("First paragraph.\n\nSecond paragraph.");
    expect(blocks).toEqual([
      { type: "p", text: "First paragraph." },
      { type: "p", text: "Second paragraph." },
    ]);
  });

  it("recognizes a single-line '# ' block as an h2", () => {
    expect(parseMarkdownLite("# Mowing Procedure")).toEqual([
      { type: "h2", text: "Mowing Procedure" },
    ]);
  });

  it("recognizes a single-line '## ' block as an h3", () => {
    expect(parseMarkdownLite("## Before You Start")).toEqual([
      { type: "h3", text: "Before You Start" },
    ]);
  });

  it("recognizes a block where every line starts with '- ' as a bullet list", () => {
    expect(parseMarkdownLite("- Check the oil\n- Check the blade\n- Fill the tank")).toEqual([
      {
        type: "ul",
        items: ["Check the oil", "Check the blade", "Fill the tank"],
      },
    ]);
  });

  it("recognizes '* ' bullets the same as '- '", () => {
    expect(parseMarkdownLite("* One\n* Two")).toEqual([
      { type: "ul", items: ["One", "Two"] },
    ]);
  });

  it("treats a mixed block (not every line a bullet) as a paragraph", () => {
    expect(parseMarkdownLite("Notes:\n- not fully bulleted")).toEqual([
      { type: "p", text: "Notes:\n- not fully bulleted" },
    ]);
  });

  it("skips extra blank lines between blocks", () => {
    const blocks = parseMarkdownLite("# Title\n\n\n\nBody text.");
    expect(blocks).toEqual([
      { type: "h2", text: "Title" },
      { type: "p", text: "Body text." },
    ]);
  });

  it("returns an empty array for blank content", () => {
    expect(parseMarkdownLite("")).toEqual([]);
    expect(parseMarkdownLite("   \n\n   ")).toEqual([]);
  });
});
