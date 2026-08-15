import { describe, it, expect } from "vitest";
import { profileDisposalRequest } from "@/lib/profile-deletion";

const counts = (transactions: number) => ({ transactions, files: 0, attachments: 0 });

/**
 * The rule that decides whether a confirm click may destroy rows. The dialog
 * that owns it can't be rendered in this suite (no DOM), which is exactly why
 * the rule lives in its own module — it's the one line between "delete a
 * profile" and "delete 1,800 transactions nobody was shown".
 */
describe("profileDisposalRequest", () => {
  it("asks to delete only when the counts are known and the user chose it", () => {
    expect(profileDisposalRequest(counts(3), "delete", "")).toEqual({
      transactions: "delete",
    });
  });

  it("asks to move when a destination is picked", () => {
    expect(profileDisposalRequest(counts(3), "move", "p1")).toEqual({
      transactions: "move",
      toProfileId: "p1",
    });
  });

  /**
   * The critical case: the impact call failed or hasn't landed. Treating that
   * as "no transactions" is what armed `delete` behind a dialog reading "This
   * profile has no transactions" — `reject` puts the server's 409 back in the
   * way.
   */
  it("falls back to reject when the counts are unknown", () => {
    expect(profileDisposalRequest(null, "delete", "")).toEqual({ transactions: "reject" });
    expect(profileDisposalRequest(null, "move", "p1")).toEqual({ transactions: "reject" });
  });

  it("falls back to reject for a profile known to be empty", () => {
    expect(profileDisposalRequest(counts(0), "delete", "")).toEqual({
      transactions: "reject",
    });
  });

  it("falls back to reject for a move with no destination", () => {
    expect(profileDisposalRequest(counts(3), "move", "")).toEqual({
      transactions: "reject",
    });
  });
});
