import { describe, it, expect } from "vitest";
import { emailKey, recipientHash } from "@/lib/email-key";

describe("emailKey", () => {
  it("drops +tags and case for every provider", () => {
    expect(emailKey(" Zoe+Trip@Example.COM ")).toBe("zoe@example.com");
    expect(emailKey("zoe@example.com")).toBe("zoe@example.com");
  });

  it("ignores Gmail dots and treats googlemail.com as gmail.com", () => {
    expect(emailKey("z.o.e+x@googlemail.com")).toBe("zoe@gmail.com");
    expect(emailKey("Z.OE@gmail.com")).toBe("zoe@gmail.com");
    // Dots only collapse on Gmail.
    expect(emailKey("z.oe@outlook.com")).toBe("z.oe@outlook.com");
  });

  it("leaves odd shapes alone", () => {
    expect(emailKey("+tag@example.com")).toBe("+tag@example.com");
    expect(emailKey("not-an-email")).toBe("not-an-email");
  });
});

describe("recipientHash", () => {
  it("is a hex SHA-256 of the inbox, the same for every spelling of it", async () => {
    const a = await recipientHash("zoe+a@gmail.com");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await recipientHash("Z.OE@googlemail.com")).toBe(a);
    expect(await recipientHash("zoe@example.com")).not.toBe(a);
  });
});
