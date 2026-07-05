/**
 * The Firebase web config, provided as ONE JSON env var
 * `NEXT_PUBLIC_FIREBASE_CONFIG` (public by design — it's the client SDK config,
 * inlined into the bundle at build time). Parsed here so both the client SDK
 * (`firebase.ts`) and the server token verifier (`firebase-verify.ts`) read the
 * same source. Example value (single line):
 *
 *   {"apiKey":"…","authDomain":"…","projectId":"…","storageBucket":"…","messagingSenderId":"…","appId":"…"}
 */
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export function firebaseConfig(): FirebaseWebConfig {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw) throw new Error("NEXT_PUBLIC_FIREBASE_CONFIG is not set");
  try {
    return JSON.parse(raw) as FirebaseWebConfig;
  } catch {
    throw new Error("NEXT_PUBLIC_FIREBASE_CONFIG is not valid JSON");
  }
}
