import { describe, expect, it } from "vitest";
import { emailProblem, hasNonPhoneCharacters, phoneProblem } from "@/lib/contact-fields";

describe("phoneProblem", () => {
  it("takes the ways people write numbers", () => {
    for (const ok of ["+91 98765 43210", "(020) 7946 0958", "415-555-0132", "0471.255.1234", "9876543210", ""]) {
      expect(phoneProblem(ok)).toBeNull();
    }
  });

  it("refuses letters and stray characters", () => {
    expect(phoneProblem("98765 abc")).toMatch(/digits/);
    expect(phoneProblem("call me")).toMatch(/digits/);
    expect(phoneProblem("98765#43210")).toMatch(/digits/);
    expect(hasNonPhoneCharacters("9876a")).toBe(true);
    expect(hasNonPhoneCharacters("+91 (0) 98-76")).toBe(false);
  });

  it("wants a + only at the start, and a sensible number of digits", () => {
    expect(phoneProblem("91+98765")).toMatch(/start/);
    expect(phoneProblem("12345")).toMatch(/short/);
    expect(phoneProblem("1234567890123456")).toMatch(/long/);
  });
});

describe("emailProblem", () => {
  it("is happy with an address or nothing", () => {
    expect(emailProblem("asha@studio.in")).toBeNull();
    expect(emailProblem("  ")).toBeNull();
  });
  it("says what's wrong otherwise", () => {
    expect(emailProblem("asha@")).toMatch(/valid email/);
    expect(emailProblem("+91 98765 43210")).toMatch(/valid email/);
  });
});
