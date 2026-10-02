import { describe, expect, it } from "vitest";
import { formatDisplayInteger, formatInteger, normalizeDecimalString, parseQuantityExpression } from "@/lib/quantity";

describe("quantity expression parser", () => {
  it.each([["1,250", 1250n], ["2.5k", 2500n], ["5.11t", 5_110_000_000_000n], ["2e6", 2_000_000n], ["(10 + 5) * 3", 45n], ["1q / 4", 250_000_000_000_000n]])("parses %s exactly", (input, expected) => expect(parseQuantityExpression(input)).toBe(expected));
  it.each(["0", "-2", "1 / 3", "2.5", "1 / 0", "Math.max(1,2)", "2 ** 3"])("rejects invalid final quantity %s", (input) => expect(() => parseQuantityExpression(input)).toThrow());
  it("rejects unsafe JavaScript numbers while preserving exact integer strings", () => {
    expect(() => normalizeDecimalString(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    expect(normalizeDecimalString("9007199254740993")).toBe("9007199254740993");
  });
});

describe("large number display", () => {
  it.each([
    ["120098942437500", "120.1t", "120.1 trillion"],
    ["18879142437500", "18.88t", "18.88 trillion"],
    ["4108667", "4.11m", "4.11 million"],
    ["1250", "1.25k", "1.25 thousand"],
    ["999", "999", "999"],
    ["0", "0", "0"],
    ["-1250", "-1.25k", "-1.25 thousand"],
    ["-1", "-1", "-1"],
    ["999999999", "1b", "1 billion"],
    ["999499999", "999.5m", "999.5 million"],
    ["9007199254740993", "9.01q", "9.01 quadrillion"],
    ["1234567890123456789", "1.23qi", "1.23 quintillion"],
    ["1000000000000000000000000", "1sp", "1 septillion"],
    ["1000000000000000000000000000000000000", "1e36", "1e36"],
  ])("formats %s without unsafe number conversion", (input, short, words) => {
    expect(formatDisplayInteger(input, "compact")).toBe(short);
    expect(formatDisplayInteger(input, "words")).toBe(words);
  });
  it("keeps exact values and legacy exact formatting intact", () => {
    expect(formatDisplayInteger("120098942437500", "exact")).toBe("120,098,942,437,500");
    expect(formatInteger("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(formatInteger(1250n, true)).toBe("1.25k");
  });
  it("rounds an enormous scientific display into the next exponent", () => {
    expect(formatDisplayInteger(10n ** 100n - 1n)).toBe("1e100");
  });
});

describe("named quantity scales", () => {
  it.each([
    ["2.5 million", 2_500_000n],
    ["2.5million + 1k", 2_501_000n],
    ["1 BILLION / 2", 500_000_000n],
    ["5.11 trillion", 5_110_000_000_000n],
    ["1 quadrillion", 10n ** 15n],
    ["1qi", 10n ** 18n],
    ["1 quintillion + 1", 10n ** 18n + 1n],
    ["2 sx", 2n * 10n ** 21n],
    ["1 decillion", 10n ** 33n],
    ["1e36", 10n ** 36n],
  ])("parses %s exactly", (input, expected) => expect(parseQuantityExpression(input)).toBe(expected));
  it.each(["2 millions", "2 mil", "2 trillionfoo", "2k3", "1,25 million", "1e1001", "1 qi qi"])("rejects malformed scale %s", input => {
    expect(() => parseQuantityExpression(input)).toThrow();
  });
});
