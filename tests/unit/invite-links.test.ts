import { describe, it, expect } from "vitest";
import {
  INVITE_TOKEN_LENGTH,
  INVITE_TOKEN_RE,
  generateInviteToken,
  invitePath,
  openWorkspacePath,
} from "@/lib/invite-links";
import { inviteTokenSchema } from "@/lib/validation";

describe("generateInviteToken", () => {
  it("mints a base64url string of the documented length that passes its own schema", () => {
    const token = generateInviteToken();
    expect(token).toHaveLength(INVITE_TOKEN_LENGTH);
    expect(token).toMatch(INVITE_TOKEN_RE);
    expect(inviteTokenSchema.safeParse(token).success).toBe(true);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, generateInviteToken));
    expect(seen.size).toBe(200);
  });
});

describe("inviteTokenSchema", () => {
  it("rejects anything outside the alphabet or length", () => {
    expect(inviteTokenSchema.safeParse("short").success).toBe(false);
    expect(inviteTokenSchema.safeParse("has spaces in it and more").success).toBe(false);
    expect(inviteTokenSchema.safeParse("x".repeat(129)).success).toBe(false);
    expect(inviteTokenSchema.safeParse("<script>alert(1)</script>xxxx").success).toBe(false);
  });
});

describe("paths", () => {
  it("builds the join page path, encoding the token", () => {
    expect(invitePath("abc-DEF_123")).toBe("/invite/abc-DEF_123");
    expect(invitePath("a/b")).toBe("/invite/a%2Fb");
  });

  it("builds the open-workspace link the tracker understands", () => {
    expect(openWorkspacePath("0192b0c0-0000-7000-8000-000000000001")).toBe(
      "/app?workspace=0192b0c0-0000-7000-8000-000000000001",
    );
  });
});
