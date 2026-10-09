import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  MAX_SIGNATURE_CANDIDATES,
  WEBHOOK_TOLERANCE_SECONDS,
  timingSafeEqual,
  verifyStandardWebhook,
} from "@/lib/webhook-signature";

/**
 * The provider signs webhooks with the Standard Webhooks scheme. The first
 * case is the specification's own published vector, so this checks the
 * implementation against the spec, not against itself.
 */

// https://github.com/standard-webhooks/standard-webhooks — the reference test vector.
const SPEC = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: 1614265330,
  body: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};

function headers(id: string, ts: number | string, signature: string) {
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": signature });
}

function sign(secret: string, id: string, ts: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

const at = { nowSeconds: SPEC.timestamp };

describe("verifyStandardWebhook", () => {
  it("accepts the specification's test vector", async () => {
    expect(await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, SPEC.signature), SPEC.secret, at)).toBe(
      true,
    );
  });

  it("matches node's own HMAC for a fresh delivery", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_1" } });
    const sig = sign(SPEC.secret, "evt_1", now, body);
    expect(await verifyStandardWebhook(body, headers("evt_1", now, sig), SPEC.secret)).toBe(true);
  });

  it("refuses a tampered body, id or timestamp", async () => {
    const h = headers(SPEC.id, SPEC.timestamp, SPEC.signature);
    expect(await verifyStandardWebhook('{"test": 2432232315}', h, SPEC.secret, at)).toBe(false);
    expect(
      await verifyStandardWebhook(SPEC.body, headers("msg_other", SPEC.timestamp, SPEC.signature), SPEC.secret, at),
    ).toBe(false);
    expect(
      await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp + 1, SPEC.signature), SPEC.secret, {
        nowSeconds: SPEC.timestamp + 1,
      }),
    ).toBe(false);
  });

  it("refuses the wrong secret", async () => {
    const other = `whsec_${Buffer.from("another-secret-entirely").toString("base64")}`;
    expect(await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, SPEC.signature), other, at)).toBe(
      false,
    );
  });

  it("refuses a delivery older or newer than the 5-minute tolerance — a captured one can't be replayed", async () => {
    const h = headers(SPEC.id, SPEC.timestamp, SPEC.signature);
    const late = { nowSeconds: SPEC.timestamp + WEBHOOK_TOLERANCE_SECONDS + 1 };
    const early = { nowSeconds: SPEC.timestamp - WEBHOOK_TOLERANCE_SECONDS - 1 };
    expect(await verifyStandardWebhook(SPEC.body, h, SPEC.secret, late)).toBe(false);
    expect(await verifyStandardWebhook(SPEC.body, h, SPEC.secret, early)).toBe(false);
    expect(
      await verifyStandardWebhook(SPEC.body, h, SPEC.secret, { nowSeconds: SPEC.timestamp + WEBHOOK_TOLERANCE_SECONDS }),
    ).toBe(true);
  });

  it("accepts when any one of several signatures matches, and ignores other versions", async () => {
    const list = `v2,${SPEC.signature.slice(3)} v1,AAAA v1,not-base64!! ${SPEC.signature}`;
    expect(await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, list), SPEC.secret, at)).toBe(true);
    expect(
      await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, `v2,${SPEC.signature.slice(3)}`), SPEC.secret, at),
    ).toBe(false);
  });

  it("refuses missing or malformed headers and an empty secret", async () => {
    const ok = headers(SPEC.id, SPEC.timestamp, SPEC.signature);
    expect(await verifyStandardWebhook(SPEC.body, new Headers(), SPEC.secret, at)).toBe(false);
    expect(await verifyStandardWebhook(SPEC.body, headers(SPEC.id, "16142.5", SPEC.signature), SPEC.secret, at)).toBe(
      false,
    );
    expect(await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, "garbage"), SPEC.secret, at)).toBe(
      false,
    );
    expect(await verifyStandardWebhook(SPEC.body, ok, "", at)).toBe(false);
    expect(await verifyStandardWebhook(SPEC.body, ok, "whsec_@@@", at)).toBe(false);
  });

  it("looks at no more than 5 candidates — a header stuffed with fakes costs one HMAC", async () => {
    const fake = `v1,${Buffer.alloc(32, 7).toString("base64")}`;
    const within = [...Array(MAX_SIGNATURE_CANDIDATES - 1).fill(fake), SPEC.signature].join(" ");
    const beyond = [...Array(MAX_SIGNATURE_CANDIDATES).fill(fake), SPEC.signature].join(" ");
    expect(await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, within), SPEC.secret, at)).toBe(true);
    expect(await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, beyond), SPEC.secret, at)).toBe(false);
  });

  it("skips empty and wrong-length signatures before comparing", async () => {
    const short = `v1,${Buffer.alloc(16, 1).toString("base64")}`;
    expect(
      await verifyStandardWebhook(SPEC.body, headers(SPEC.id, SPEC.timestamp, `v1, ${short} v1,`), SPEC.secret, at),
    ).toBe(false);
  });

  it("compares bytes without stopping at the first difference", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
