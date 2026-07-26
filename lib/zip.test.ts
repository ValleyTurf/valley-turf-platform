import { describe, expect, it } from "vitest";
import { buildZip } from "./zip";

describe("buildZip", () => {
  it("starts with a local file header signature for the first entry", () => {
    const zip = buildZip([
      { name: "a.csv", data: Buffer.from("hello", "utf8") },
    ]);

    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("ends with an end-of-central-directory signature", () => {
    const zip = buildZip([
      { name: "a.csv", data: Buffer.from("hello", "utf8") },
    ]);

    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });

  it("records the correct total entry count in the end record", () => {
    const zip = buildZip([
      { name: "a.csv", data: Buffer.from("one", "utf8") },
      { name: "b.csv", data: Buffer.from("two", "utf8") },
      { name: "c.csv", data: Buffer.from("three", "utf8") },
    ]);

    expect(zip.readUInt16LE(zip.length - 12)).toBe(3);
  });

  it("stores each entry's filename and raw (uncompressed) bytes so file sizes match", () => {
    const data = Buffer.from("the quick brown fox", "utf8");
    const zip = buildZip([{ name: "fox.csv", data }]);

    // Local header: 4(sig)+2+2+2+2+2+4(crc)+4(compressed size)+4 = offset 22
    const compressedSize = zip.readUInt32LE(18);
    const uncompressedSize = zip.readUInt32LE(22);

    expect(compressedSize).toBe(data.length);
    expect(uncompressedSize).toBe(data.length);
  });

  it("produces an empty-but-valid archive for zero entries", () => {
    const zip = buildZip([]);

    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
    expect(zip.readUInt16LE(8)).toBe(0);
  });
});
