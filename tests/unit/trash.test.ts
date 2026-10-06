import { describe, it, expect, afterEach } from "vitest";
import {
  TRASH_DAYS,
  describeTrashCounts,
  encodeTrashCursor,
  purgeAt,
  restoredName,
  trashCountdown,
  trashCutoff,
} from "@/lib/trash";
import { trashCursorSchema, trashSelectionSchema } from "@/lib/validation";
import { CRON_TOKEN_HEADER, isValidCronToken, issueCronToken, revokeCronToken } from "@/lib/cron-token";
import { CRON_JOBS, dispatchCronJob } from "@/lib/cron-dispatch";

const DAY = 86_400_000;

describe("trash countdown", () => {
  const deleted = new Date("2026-10-01T10:00:00.000Z");

  it("purges TRASH_DAYS after deletion, and the cutoff mirrors it", () => {
    expect(TRASH_DAYS).toBe(30);
    expect(purgeAt(deleted).getTime()).toBe(deleted.getTime() + 30 * DAY);
    const now = new Date("2026-11-05T00:00:00.000Z");
    expect(trashCutoff(now).getTime()).toBe(now.getTime() - 30 * DAY);
  });

  it("rounds partial days up and says today/tomorrow at the end", () => {
    expect(trashCountdown(deleted, deleted)).toEqual({ days: 30, label: "Deletes in 30 days" });
    expect(trashCountdown(deleted, new Date(deleted.getTime() + 3.2 * DAY)).days).toBe(27);
    expect(trashCountdown(deleted, new Date(deleted.getTime() + 29.5 * DAY))).toEqual({
      days: 1,
      label: "Deletes tomorrow",
    });
    // Past due but not yet purged (the purge runs once a day).
    expect(trashCountdown(deleted, new Date(deleted.getTime() + 31 * DAY))).toEqual({
      days: 0,
      label: "Deletes today",
    });
  });

  it("accepts ISO strings", () => {
    expect(trashCountdown(deleted.toISOString(), deleted).days).toBe(30);
  });
});

describe("restoredName", () => {
  it("keeps a free name and suffixes a taken one, within the length cap", () => {
    const taken = new Set(["Home"]);
    expect(restoredName("Work", 20, (n) => taken.has(n))).toBe("Work");
    expect(restoredName("Home", 20, (n) => taken.has(n))).toBe("Home (restored)");
  });

  it("trims a long name so the suffix fits", () => {
    const name = "Household expenses"; // 18 chars
    const out = restoredName(name, 20, (n) => n === name);
    expect(out).toBe("Household (restored)");
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it("counts up when the restored name is taken too", () => {
    const taken = new Set(["home", "home (restored)"]);
    expect(restoredName("Home", 40, (n) => taken.has(n.toLowerCase()))).toBe("Home (restored 2)");
  });
});

describe("describeTrashCounts", () => {
  it("names only the non-zero kinds", () => {
    expect(describeTrashCounts({ transactions: 3, files: 1, folders: 0, profiles: 0 })).toBe(
      "3 transactions, 1 file",
    );
    expect(describeTrashCounts({ transactions: 0, files: 0, folders: 0, profiles: 0 })).toBe("");
  });
});

describe("trash cursor", () => {
  it("round-trips through its string form at millisecond precision", () => {
    const cursor = { deletedAt: new Date("2026-10-06T23:18:04.123Z"), id: "01a1127e-e254-7fff-a0a3-0f4616068dd4" };
    expect(trashCursorSchema.parse(encodeTrashCursor(cursor))).toEqual(cursor);
  });

  it("rejects garbage", () => {
    for (const bad of ["", "nope", "2026-10-06_not-a-uuid", "_01a1127e-e254-7fff-a0a3-0f4616068dd4"]) {
      expect(trashCursorSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("trashSelectionSchema", () => {
  it("needs at least one id and caps each kind", () => {
    expect(trashSelectionSchema.safeParse({}).success).toBe(false);
    expect(
      trashSelectionSchema.safeParse({ transactionIds: ["01a1127e-e254-7fff-a0a3-0f4616068dd4"] }).success,
    ).toBe(true);
    const tooMany = Array.from({ length: 501 }, () => "01a1127e-e254-7fff-a0a3-0f4616068dd4");
    expect(trashSelectionSchema.safeParse({ fileIds: tooMany }).success).toBe(false);
  });
});

describe("cron token", () => {
  const live: string[] = [];
  afterEach(() => {
    for (const t of live.splice(0)) revokeCronToken(t);
  });

  it("never accepts anything while no run is in flight — the empty string included", () => {
    expect(isValidCronToken(undefined)).toBe(false);
    expect(isValidCronToken(null)).toBe(false);
    expect(isValidCronToken("")).toBe(false);
    expect(isValidCronToken("anything")).toBe(false);
  });

  it("accepts exactly the in-flight token, and nothing after it is revoked", () => {
    const token = issueCronToken();
    live.push(token);
    expect(token.length).toBeGreaterThanOrEqual(60);
    expect(isValidCronToken(token)).toBe(true);
    expect(isValidCronToken(token.slice(0, -1))).toBe(false);
    expect(isValidCronToken(`${token}x`)).toBe(false);
    expect(isValidCronToken("")).toBe(false);
    revokeCronToken(token);
    expect(isValidCronToken(token)).toBe(false);
  });

  it("mints a different token per run", () => {
    const a = issueCronToken();
    const b = issueCronToken();
    live.push(a, b);
    expect(a).not.toBe(b);
  });
});

describe("dispatchCronJob", () => {
  it("calls the internal route in-process with a live token, then revokes it", async () => {
    let seen: { url: string; method: string; valid: boolean; token: string } | null = null;
    await dispatchCronJob(
      async (req: Request) => {
        const token = req.headers.get(CRON_TOKEN_HEADER) ?? "";
        seen = { url: req.url, method: req.method, valid: isValidCronToken(token), token };
        return new Response("ok");
      },
      {},
      {},
      "https://beta.spendchat.app",
      CRON_JOBS.trashPurge,
    );
    expect(seen).toMatchObject({
      url: "https://beta.spendchat.app/api/internal/cron/trash-purge",
      method: "POST",
      valid: true,
    });
    // Revoked once the run is over.
    expect(isValidCronToken(seen!.token)).toBe(false);
  });

  it("skips the run without an origin rather than invent one", async () => {
    let called = false;
    for (const origin of [undefined, "", "spendchat.app", "https://spendchat.app/path"]) {
      await dispatchCronJob(
        async () => {
          called = true;
          return new Response("ok");
        },
        {},
        {},
        origin,
        CRON_JOBS.trashPurge,
      );
    }
    expect(called).toBe(false);
  });

  it("revokes the token even when the handler throws", async () => {
    let token = "";
    await expect(
      dispatchCronJob(
        async (req: Request) => {
          token = req.headers.get(CRON_TOKEN_HEADER) ?? "";
          throw new Error("boom");
        },
        {},
        {},
        "https://spendchat.app",
        CRON_JOBS.trashPurge,
      ),
    ).rejects.toThrow("boom");
    expect(token).not.toBe("");
    expect(isValidCronToken(token)).toBe(false);
  });
});
