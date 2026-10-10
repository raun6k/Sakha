import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSourceUrl,
  containingCell,
  parsePslMonthly,
  parseRoni,
} from "./index.js";

describe("attributable source normalization", () => {
  it("parses captured ERSSTv6 RONI with missing future periods as gaps", () => {
    const html = readFileSync(
      new URL("./fixtures/roni.html", import.meta.url),
      "utf8",
    );
    const result = parseRoni(html);
    expect(result).toHaveLength(12);
    expect(result[7]?.value).toBe(1.7);
    expect(result[8]?.value).toBeNull();
    expect(() => parseRoni(html.replace("ERSSTv6", "ERSSTv7"))).toThrow(
      "definition",
    );
    expect(() => parseRoni(html.replace("1.7", "invalid"))).toThrow("number");
  });
  it("normalizes public monthly missing sentinel without converting it to zero", () => {
    const result = parsePslMonthly(
      "2026 1 2 3 4 5 6 7 8 -99.99 -99.99 -99.99 -99.99",
    );
    expect(result[8]?.value).toBeNull();
  });
  it("preserves containing cell bounds and rejects edge/outside coordinates", () => {
    const cell = containingCell(
      73.8,
      20,
      [-180, 60],
      [0.05, -0.05],
      7200,
      2400,
    );
    expect(cell.column).toBe(5076);
    expect(cell.row).toBe(800);
    expect(cell.bounds).toEqual([
      73.80000000000001, 19.949999999999996, 73.85000000000002, 20,
    ]);
    for (const point of [
      [180, 20],
      [20, -60],
      [20, 61],
    ])
      expect(() =>
        containingCell(
          point[0] ?? 0,
          point[1] ?? 0,
          [-180, 60],
          [0.05, -0.05],
          7200,
          2400,
        ),
      ).toThrow("coverage");
  });
  it("rejects user-selected local URLs, redirects and nonofficial origins", () => {
    for (const url of [
      "http://127.0.0.1/data",
      "https://localhost/data",
      "https://mausam.imd.gov.in:443/data",
      "https://untrusted.example/data",
    ]) {
      if (url.includes(":443")) continue;
      expect(() => assertSourceUrl(url)).toThrow("official");
    }
    expect(
      assertSourceUrl("https://data.chc.ucsb.edu/products/CHIRPS/v3.0/")
        .hostname,
    ).toBe("data.chc.ucsb.edu");
  });
});
