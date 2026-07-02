import { describe, it, expect } from "vitest";
import { GET as listCats, POST as createCat } from "@/app/api/v1/categories/route";
import { PATCH as patchCat, DELETE as deleteCat } from "@/app/api/v1/categories/[id]/route";
import { signInAs } from "../helpers/session";
import { bootstrapUser, categoryId } from "../helpers/seed";
import { apiReq, jsonBody, ctx } from "./helpers";

describe("/api/v1/categories", () => {
  it("lists bootstrapped defaults", async () => {
    signInAs("a");
    const res = await listCats(apiReq("/api/v1/categories"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("kind");
  });

  it("creates a category (201) and rejects a duplicate (409)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const created = await createCat(
      apiReq("/api/v1/categories", { method: "POST", body: jsonBody({ name: "Pets", kind: "expense", icon: "🐶" }) }),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).data.name).toBe("Pets");

    const dup = await createCat(
      apiReq("/api/v1/categories", { method: "POST", body: jsonBody({ name: "Groceries", kind: "expense" }) }),
    );
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.message).toMatch(/already exists/);
  });

  it("422s on invalid input", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await createCat(
      apiReq("/api/v1/categories", { method: "POST", body: jsonBody({ name: "", kind: "expense" }) }),
    );
    expect(res.status).toBe(422);
  });

  it("updates and deletes a category", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await categoryId("a", "Shopping", "expense");

    const patched = await patchCat(
      apiReq(`/api/v1/categories/${id}`, { method: "PATCH", body: jsonBody({ name: "Retail" }) }),
      ctx({ id }),
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.name).toBe("Retail");

    const del = await deleteCat(apiReq(`/api/v1/categories/${id}`, { method: "DELETE" }), ctx({ id }));
    expect(del.status).toBe(200);
  });

  it("404s deleting an unknown category", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const missing = "00000000-0000-0000-0000-000000000000";
    const res = await deleteCat(apiReq(`/api/v1/categories/${missing}`, { method: "DELETE" }), ctx({ id: missing }));
    expect(res.status).toBe(404);
  });
});
