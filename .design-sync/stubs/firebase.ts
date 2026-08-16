// Stand-in for `src/lib/firebase.ts`, wired in by the `paths` map in
// tsconfig.sync.json / tsconfig.emit.json.
//
// `UserMenu` (reached from both AppSidebar and AppTopbar) calls
// `getFirebaseAuth()` and `clearSession()` to sign out. Bundling the real
// module pulls the whole Firebase Web SDK — `firebase/app` + `firebase/auth`,
// several hundred KB — into a browser bundle that can never sign anyone in:
// the design bundle has no `NEXT_PUBLIC_FIREBASE_CONFIG`, so the first call
// would throw "NEXT_PUBLIC_FIREBASE_CONFIG is not set" from deep inside
// `firebaseConfig()`. Stubbing it keeps the SDK out and replaces that with an
// error that says what actually happened.
//
// Same contract as the generated `src/actions/*` stubs: the shape type-checks,
// calling it throws.

const stub = (name: string) =>
  new Error(
    `${name}() talks to Firebase Authentication. The SpendChat design-system bundle ships a ` +
      `stub — wire your own handler when composing with this component.`,
  );

/* eslint-disable @typescript-eslint/no-explicit-any */
export function getFirebaseApp(): any {
  throw stub("getFirebaseApp");
}

export function getFirebaseAuth(): any {
  throw stub("getFirebaseAuth");
}

export function googleProvider(): any {
  throw stub("googleProvider");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function syncSession(): Promise<void> {
  throw stub("syncSession");
}

export async function clearSession(): Promise<void> {
  throw stub("clearSession");
}
