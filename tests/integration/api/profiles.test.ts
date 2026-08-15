import { describe, it, expect } from "vitest";
import { GET as listProfilesRoute, POST as createProfile } from "@/app/api/v1/profiles/route";
import { PATCH as patchProfile, DELETE as deleteProfile } from "@/app/api/v1/profiles/[id]/route";
import { GET as deletionImpact } from "@/app/api/v1/profiles/[id]/deletion-impact/route";
import { POST as reorder } from "@/app/api/v1/profiles/reorder/route";
import { POST as moveTxns } from "@/app/api/v1/profiles/[id]/move/route";
import { signInAs } from "../helpers/session";
import { bootstrapUser, countTxns, firstProfileId, insertTxn } from "../helpers/seed";
import { apiReq, jsonBody, ctx } from "./helpers";

async function createNamed(name: string): Promise<string> {
  const res = await createProfile(
    apiReq("/api/v1/profiles", { method: "POST", body: jsonBody({ name }) }),
  );
  return (await res.json()).data.id as string;
}

describe("/api/v1/profiles", () => {
  it("lists the bootstrapped Personal profile", async () => {
    signInAs("a");
    const res = await listProfilesRoute(apiReq("/api/v1/profiles"));
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Personal");
  });

  it("creates, updates, reorders and blocks deleting the last profile", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    const workId = await createNamed("Work");

    const patched = await patchProfile(
      apiReq(`/api/v1/profiles/${workId}`, { method: "PATCH", body: jsonBody({ icon: "💼" }) }),
      ctx({ id: workId }),
    );
    expect((await patched.json()).data.icon).toBe("💼");

    const ro = await reorder(
      apiReq("/api/v1/profiles/reorder", { method: "POST", body: jsonBody({ ids: [workId, personal] }) }),
    );
    const order = (await ro.json()).data.map((p: { name: string }) => p.name);
    expect(order).toEqual(["Work", "Personal"]);

    // delete Work (empty, not last) → ok
    const del = await deleteProfile(apiReq(`/api/v1/profiles/${workId}`, { method: "DELETE" }), ctx({ id: workId }));
    expect(del.status).toBe(200);

    // deleting the only remaining profile → 409
    const delLast = await deleteProfile(apiReq(`/api/v1/profiles/${personal}`, { method: "DELETE" }), ctx({ id: personal }));
    expect(delLast.status).toBe(409);
  });

  it("blocks deleting a non-empty profile, then allows it after moving", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    const workId = await createNamed("Work");
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01", profileId: workId });

    const blocked = await deleteProfile(apiReq(`/api/v1/profiles/${workId}`, { method: "DELETE" }), ctx({ id: workId }));
    expect(blocked.status).toBe(409);

    const moved = await moveTxns(
      apiReq(`/api/v1/profiles/${workId}/move`, { method: "POST", body: jsonBody({ toProfileId: personal }) }),
      ctx({ id: workId }),
    );
    expect(moved.status).toBe(200);
    expect((await moved.json()).data.moved).toBe(1);

    const okNow = await deleteProfile(apiReq(`/api/v1/profiles/${workId}`, { method: "DELETE" }), ctx({ id: workId }));
    expect(okNow.status).toBe(200);
  });

  it("deletes a non-empty profile's transactions on ?transactions=delete", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const workId = await createNamed("Work");
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01", profileId: workId });

    const impact = await deletionImpact(
      apiReq(`/api/v1/profiles/${workId}/deletion-impact`),
      ctx({ id: workId }),
    );
    expect((await impact.json()).data).toEqual({ transactions: 1, files: 0 });

    const res = await deleteProfile(
      apiReq(`/api/v1/profiles/${workId}?transactions=delete`, { method: "DELETE" }),
      ctx({ id: workId }),
    );
    expect(res.status).toBe(200);
    expect(await countTxns("a")).toBe(0);
  });

  it("re-files them on ?transactions=move&to=, and 422s without a destination", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const personal = await firstProfileId("a");
    const workId = await createNamed("Work");
    await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01", profileId: workId });

    const noTarget = await deleteProfile(
      apiReq(`/api/v1/profiles/${workId}?transactions=move`, { method: "DELETE" }),
      ctx({ id: workId }),
    );
    expect(noTarget.status).toBe(422);

    const res = await deleteProfile(
      apiReq(`/api/v1/profiles/${workId}?transactions=move&to=${personal}`, { method: "DELETE" }),
      ctx({ id: workId }),
    );
    expect(res.status).toBe(200);
    expect(await countTxns("a")).toBe(1);
  });
});
