import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/transactions/export/route";
import { setSession, signInAs } from "./helpers/session";
import { bootstrapUser, categoryId, insertTxn } from "./helpers/seed";

const req = (qs = "") => new Request(`http://localhost/api/transactions/export${qs}`);

describe("GET /api/transactions/export", () => {
  it("returns 401 when signed out", async () => {
    setSession(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("streams a CSV with signed amounts and an Uncategorized/empty-note fallback", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const groceries = await categoryId("a", "Groceries", "expense");
    await insertTxn("a", {
      type: "expense",
      amountMinor: 1000,
      occurredOn: "2026-06-01",
      categoryId: groceries,
      title: "Veg",
    });
    await insertTxn("a", {
      type: "income",
      amountMinor: 5000,
      occurredOn: "2026-06-15",
    }); // no category, no title

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="spendchat-\d{4}-\d{2}-\d{2}\.csv"/,
    );

    const body = await res.text();
    const lines = body.split("\r\n");
    expect(lines[0]).toBe("Date,Type,Category,Note,Amount,Currency");
    // newest first: income row (no category → Uncategorized, blank note, +50.00)
    expect(lines[1]).toBe("2026-06-15,income,Uncategorized,,50.00,USD");
    // expense row is signed negative
    expect(lines[2]).toBe("2026-06-01,expense,Groceries,Veg,-10.00,USD");
  });

  it("applies query-string filters", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await insertTxn("a", { type: "expense", amountMinor: 1000, occurredOn: "2026-06-01" });
    await insertTxn("a", { type: "income", amountMinor: 5000, occurredOn: "2026-06-15" });

    const res = await GET(req("?type=income"));
    const lines = (await res.text()).split("\r\n");
    expect(lines).toHaveLength(2); // header + 1 income row
    expect(lines[1]).toContain("income");
  });
});
