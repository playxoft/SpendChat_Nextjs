import { describe, it, expect, beforeAll, vi } from "vitest";
import { SignJWT, generateKeyPair, createRemoteJWKSet, type KeyObject } from "jose";

// Swap the remote JWKS fetch for a locally-held RSA key. Everything else in
// `verifyFirebaseIdToken` — the RS256 signature check, expiry, issuer/audience
// pinning, `sub` requirement, error mapping — runs for real against tokens we
// mint here (shaped exactly like a Firebase ID token). This is the exact
// verification the app performs; integration tests mock it out.
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: vi.fn() };
});

const PROJECT = "spendchat-test";
const ISS = `https://securetoken.google.com/${PROJECT}`;
let priv: KeyObject;
let otherPriv: KeyObject;

async function mint(
  claims: Record<string, unknown>,
  opts: { exp?: string | number; key?: KeyObject; iss?: string; aud?: string } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? PROJECT)
    .setExpirationTime(opts.exp ?? "1h");
  return jwt.sign(opts.key ?? priv);
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_FIREBASE_CONFIG = JSON.stringify({
    apiKey: "test",
    authDomain: `${PROJECT}.firebaseapp.com`,
    projectId: PROJECT,
    storageBucket: `${PROJECT}.firebasestorage.app`,
    messagingSenderId: "0",
    appId: "test",
  });
  const kp = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  priv = kp.privateKey as KeyObject;
  otherPriv = other.privateKey as KeyObject;
  (createRemoteJWKSet as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    async () => kp.publicKey,
  );
});

describe("verifyFirebaseIdToken", () => {
  it("accepts a valid Firebase ID token and extracts claims", async () => {
    const { verifyFirebaseIdToken } = await import("@/lib/firebase-verify");
    const token = await mint({ sub: "fb-uid-1", email: "a@b.com", name: "Ann" });
    const claims = await verifyFirebaseIdToken(token);
    expect(claims.sub).toBe("fb-uid-1");
    expect(claims.email).toBe("a@b.com");
    expect(claims.name).toBe("Ann");
  });

  it("rejects a token with no subject", async () => {
    const { verifyFirebaseIdToken } = await import("@/lib/firebase-verify");
    const token = await mint({ email: "a@b.com" });
    await expect(verifyFirebaseIdToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an expired token", async () => {
    const { verifyFirebaseIdToken } = await import("@/lib/firebase-verify");
    const token = await mint({ sub: "fb-uid-1" }, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyFirebaseIdToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a token from the wrong issuer", async () => {
    const { verifyFirebaseIdToken } = await import("@/lib/firebase-verify");
    const token = await mint({ sub: "fb-uid-1" }, { iss: "https://securetoken.google.com/evil" });
    await expect(verifyFirebaseIdToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a token for the wrong audience (project)", async () => {
    const { verifyFirebaseIdToken } = await import("@/lib/firebase-verify");
    const token = await mint({ sub: "fb-uid-1" }, { aud: "some-other-project" });
    await expect(verifyFirebaseIdToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a token signed by an untrusted key", async () => {
    const { verifyFirebaseIdToken } = await import("@/lib/firebase-verify");
    const token = await mint({ sub: "fb-uid-1" }, { key: otherPriv });
    await expect(verifyFirebaseIdToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a malformed token", async () => {
    const { verifyFirebaseIdToken } = await import("@/lib/firebase-verify");
    await expect(verifyFirebaseIdToken("not.a.jwt")).rejects.toMatchObject({ status: 401 });
  });
});
