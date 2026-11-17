import { describe, expect, it } from "vitest";
import {
  detectWallet,
  formatSomaliPhone,
  localPart,
  maskPhone,
  normalizeSomaliPhone,
  type WalletPrefix,
} from "../../../supabase/functions/_shared/wallet.ts";

const PREFIXES: WalletPrefix[] = [
  { prefix: "61", wallet: "EVC_PLUS", provider_name: "Hormuud", is_active: true },
  { prefix: "77", wallet: "EVC_PLUS", provider_name: "Hormuud", is_active: true },
  { prefix: "63", wallet: "ZAAD", provider_name: "Telesom", is_active: true },
  { prefix: "90", wallet: "SAHAL", provider_name: "Golis", is_active: true },
  { prefix: "62", wallet: "JEEB", provider_name: "Inactive", is_active: false },
];

describe("normalizeSomaliPhone", () => {
  it.each([
    ["+252 61 234 5678", "252612345678"],
    ["00252612345678", "252612345678"],
    ["252612345678", "252612345678"],
    ["0612345678", "252612345678"],
    ["612345678", "252612345678"],
    ["(061) 234-5678", "252612345678"],
    ["+252 0612345678", "252612345678"],
    ["  63 444 5555 ", "252634445555"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeSomaliPhone(input)).toBe(expected);
  });

  it.each([
    [""],
    [null],
    [undefined],
    ["12345"],
    ["61234567"], // 8 digits
    ["6123456789"], // 10 digits
    ["012345678"], // leading zero only → 8 digits after strip
    ["+1 612 345 6789"],
    ["abcdefghi"],
  ])("rejects %s", (input) => {
    expect(normalizeSomaliPhone(input as string | null | undefined)).toBeNull();
  });
});

describe("detectWallet", () => {
  it("detects wallet from active prefixes", () => {
    expect(detectWallet("0612345678", PREFIXES)?.wallet).toBe("EVC_PLUS");
    expect(detectWallet("+252 77 123 4567", PREFIXES)?.wallet).toBe("EVC_PLUS");
    expect(detectWallet("634445555", PREFIXES)?.wallet).toBe("ZAAD");
    expect(detectWallet("907654321", PREFIXES)?.wallet).toBe("SAHAL");
  });

  it("ignores inactive prefixes and unknown numbers", () => {
    expect(detectWallet("621234567", PREFIXES)).toBeNull();
    expect(detectWallet("651234567", PREFIXES)).toBeNull();
  });

  it("returns null for invalid numbers", () => {
    expect(detectWallet("123", PREFIXES)).toBeNull();
    expect(detectWallet(null, PREFIXES)).toBeNull();
  });

  it("prefers the longest matching prefix", () => {
    const withLonger: WalletPrefix[] = [
      ...PREFIXES,
      { prefix: "615", wallet: "WAAFI", provider_name: "Test", is_active: true },
    ];
    expect(detectWallet("615123456", withLonger)?.wallet).toBe("WAAFI");
    expect(detectWallet("612123456", withLonger)?.wallet).toBe("EVC_PLUS");
  });
});

describe("formatting & masking", () => {
  it("formats normalised numbers", () => {
    expect(formatSomaliPhone("252612345678")).toBe("+252 61 234 5678");
    expect(formatSomaliPhone("0612345678")).toBe("+252 61 234 5678");
    expect(formatSomaliPhone("bad")).toBe("bad");
    expect(formatSomaliPhone(null)).toBe("");
  });

  it("masks numbers without revealing the middle digits", () => {
    expect(maskPhone("252612345678")).toBe("25261****678");
    expect(maskPhone("252612345678")).not.toContain("2345");
    expect(maskPhone("1234")).toBe("1234");
  });

  it("returns local part", () => {
    expect(localPart("252612345678")).toBe("612345678");
    expect(localPart("612345678")).toBe("612345678");
  });
});
