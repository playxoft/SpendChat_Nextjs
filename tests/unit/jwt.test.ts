import { describe, it, expect, beforeAll, vi } from "vitest";
import { SignJWT, generateKeyPair, createRemoteJWKSet, type KeyObject } from "jose";

// Swap the remote JWKS fetch for a locally-held key. Everything else in
// `verifyAccessToken` — the EdDSA signature check, expiry, `sub` requirement,
// error mapping — runs for real against tokens we mint here. This is the exact
// verification the mobile API performs; integration tests mock it out, so this
// is where it is actually exercised.
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: vi.fn() };
});

const ISS = "https://auth.example.test";
let priv: KeyObject;
let otherPriv: KeyObject;

async function mint(
  claims: Record<string, unknown>,
  opts: { exp?: string | number; key?: KeyObject } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt()
    .setIssuer(ISS)
    .setAudience(ISS);
  if (opts.exp !== undefined) jwt.setExpirationTime(opts.exp);
  else jwt.setExpirationTime("15m");
  return jwt.sign(opts.key ?? priv);
}

beforeAll(async () => {
  process.env.NEON_AUTH_BASE_URL = ISS;
  const kp = await generateKeyPair("EdDSA");
  const other = await generateKeyPair("EdDSA");
  priv = kp.privateKey as KeyObject;
  otherPriv = other.privateKey as KeyObject;
  // Resolve every token to our trusted public key.
  (createRemoteJWKSet as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    async () => kp.publicKey,
  );
});

describe("verifyAccessToken", () => {
  it("accepts a valid EdDSA token and extracts claims", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt");
    const token = await mint({ sub: "user-1", email: "a@b.com", name: "Ann" });
    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe("user-1");
    expect(claims.email).toBe("a@b.com");
    expect(claims.name).toBe("Ann");
  });

  it("rejects a token with no subject", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt");
    const token = await mint({ email: "a@b.com" });
    await expect(verifyAccessToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an expired token", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt");
    const token = await mint({ sub: "user-1" }, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyAccessToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a token signed by an untrusted key", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt");
    const token = await mint({ sub: "user-1" }, { key: otherPriv });
    await expect(verifyAccessToken(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a malformed token", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt");
    await expect(verifyAccessToken("not.a.jwt")).rejects.toMatchObject({ status: 401 });
  });
});
