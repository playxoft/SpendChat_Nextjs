// Stand-in for the `firebase/auth` entry point of the Firebase Web SDK, wired
// in by the `paths` map in tsconfig.sync.json / tsconfig.emit.json.
//
// Stubbing `@/lib/firebase` alone is not enough: `UserMenu` imports `signOut`
// straight from the SDK, which would drag `firebase/auth` (and transitively
// `firebase/app`) into the bundle on its own. Only the names the synced
// component set actually imports are declared here — if a newly synced
// component imports another one, the bundle build fails with an unresolved
// export naming it, which is the intended signal to add it.

// Signature-compatible with the call sites, body unreachable — same shape as
// the generated action stubs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function signOut(..._args: unknown[]): Promise<void> {
  throw new Error(
    "signOut() talks to Firebase Authentication. The SpendChat design-system bundle ships a " +
      "stub — wire your own handler when composing with this component.",
  );
}
