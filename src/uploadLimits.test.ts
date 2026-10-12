import { describe, expect, it } from "vitest";
import { MAX_CSV_BATCH_BYTES, MAX_CSV_BATCH_FILES, checkCsvBatch } from "./uploadLimits";

const MB = 1024 * 1024;

describe("US-38: .csv batch limits", () => {
  it("accepts 1 to 50 files", () => {
    expect(MAX_CSV_BATCH_FILES).toBe(50);
    expect(checkCsvBatch([{ size: 1 }])).toBeNull();
    expect(checkCsvBatch(Array.from({ length: 50 }, () => ({ size: MB })))).toBeNull();
  });

  it("QA-02/QA-03: 51 files are rejected with the 50-file maximum", () => {
    const error = checkCsvBatch(Array.from({ length: 51 }, () => ({ size: 1 })));
    expect(error).toContain("You selected 51 files");
    expect(error).toContain("maximum is 50 .csv files");
  });

  it("QA-04: a batch over 50 MB in total is rejected with the 50 MB cap", () => {
    expect(MAX_CSV_BATCH_BYTES).toBe(50 * MB);
    expect(checkCsvBatch(Array.from({ length: 5 }, () => ({ size: 10 * MB })))).toBeNull(); // exactly 50 MB
    const error = checkCsvBatch(Array.from({ length: 6 }, () => ({ size: 9 * MB }))); // 54 MB
    expect(error).toContain("54.0 MB");
    expect(error).toContain("maximum is 50 MB");
  });
});
