# 09 · Authentication (Firebase)

Auth is **Firebase Authentication** using the **same Firebase project** as the
web app. The backend does **not** mint tokens — it verifies the Firebase **ID
token** (RS256) on every `/api/v1` request. On mobile, use the **native**
Firebase SDKs (not the web popup flow).

Packages: `firebase_core`, `firebase_auth`, `google_sign_in`. Setup steps are in
[00-getting-started.md](./00-getting-started.md) §4.

---

## 1. The core flow

1. **Initialise** Firebase in `main()`.
2. **Sign in** (email/password or Google) via the Firebase SDK.
3. **Gate on `emailVerified`** — email/password accounts must verify their email
   before they can use the app; the API returns **403** for an unverified token.
   Google accounts are always verified.
4. **Call the API** with `Authorization: Bearer ${await user.getIdToken()}` on
   every request (a dio interceptor).
5. **Refresh:** tokens last ~1h and refresh automatically; on a `401`, call
   `getIdToken(true)` (force) and retry once, else sign out. React to sign-out via
   `idTokenChanges()`.
6. **No token storage needed** — Firebase persists the session and rehydrates on
   launch. Never log tokens.

> The web app also POSTs the ID token to `/api/auth/session` to set an httpOnly
> `__session` cookie — that's a **web-only** bridge for server-rendered pages.
> The mobile app does **not** need it; it uses the bearer token directly against
> `/api/v1`.

---

## 2. Screens

All auth screens are centered, minimal cards on `background`, with the SpendChat
logo + a theme toggle in the header. If already signed in (and verified), redirect
to `/app`.

### 2.1 Sign in (`/sign-in`)
- Heading **"Welcome back"** / "Sign in to your SpendChat account".
- **Continue with Google** button (top), then a divider "or continue with email".
- Fields: **Email** (prefillable from a passed `email`), **Password** (with a
  "Forgot password?" link to `/forgot-password`).
- Validation: both required → "Email and password are required."
- Submit → `signInWithEmailAndPassword`. If `!user.emailVerified`: resend the
  verification email and route to `/verify-email` (pass the email). Else proceed
  to `/app`.
- Button text "Signing in…" while pending. Footer link to `/sign-up`
  ("Create one").

### 2.2 Sign up (`/sign-up`)
- Heading **"Create your account"** / "Start tracking your money in seconds —
  it's free."
- Google button + divider "or sign up with email".
- Fields: **Name** (optional), **Email** (required), **Password** (required,
  **min 8 chars**, placeholder "At least 8 characters").
- Validation: email+password required → "Email and password are required.";
  `password.length < 8` → "Password must be at least 8 characters."
- Submit → `createUserWithEmailAndPassword`; if a name was given →
  `updateProfile(displayName)`; **send a verification email**; route to
  `/verify-email` (pass the email). Footer link to `/sign-in`.

### 2.3 Verify email (`/verify-email`)
- Heading **"Verify your email"** / "We emailed a verification link{ to email}.
  Click it, then come back and continue."
- **"I've verified — continue"** → `user.reload()`; if still unverified → toast
  "Not verified yet — click the link in your email first."; else proceed to
  `/app` (toast "Email verified"). If no user → toast "Please sign in again to
  continue."
- **"Resend link"** → `sendEmailVerification`, toast "Verification link sent —
  check your inbox."
- A "Back to sign in" link.
- Listen to `authStateChanges`/poll so the screen advances once verified.

### 2.4 Forgot password (`/forgot-password`)
- Heading **"Reset your password"**. Field: **Email** (autofocus). Empty → "Enter
  your email."
- Submit → `sendPasswordResetEmail`. **Privacy:** treat `user-not-found` /
  `invalid-email` as **success** (don't reveal whether an account exists). On
  success show: "If an account exists for that email, we've sent a password reset
  link." + "Check your inbox and follow the link to choose a new password."
- Button "Sending…" while pending. "Back to sign in" link.

### 2.5 Google sign-in (native)
Use `google_sign_in` → obtain the Google credential →
`signInWithCredential(...)` (or `signInWithProvider(GoogleAuthProvider())`).
**Do not** use the web `signInWithPopup` flow. On success go to `/app`. Silently
ignore user-cancelled errors. Button text "Connecting…" while loading.

---

## 3. Error messages

Map Firebase error codes to friendly copy (mirror `src/lib/auth-errors.ts`):

| Firebase code | Message |
|---|---|
| `invalid-credential`, `wrong-password`, `user-not-found` | "Incorrect email or password." |
| `invalid-email` | "That doesn't look like a valid email address." |
| `user-disabled` | "This account has been disabled." |
| `too-many-requests` | "Too many attempts. Please wait a moment and try again." |
| `email-already-in-use` | "An account with that email already exists. Try signing in instead." |
| `weak-password` | "That password is too weak — use at least 6 characters." |
| `popup-closed-by-user`, `cancelled-popup-request` | "Sign-in was cancelled." |
| `popup-blocked` | "Your browser blocked the sign-in popup. Allow popups and try again." |
| `network-request-failed` | "Network error. Check your connection and try again." |
| `requires-recent-login` | "For security, please sign in again to finish this action." |
| (default) | the error's message, or a caller-supplied fallback |

- Sign-in fallback: "Couldn't sign in. Check your details and try again."
- Sign-up fallback: "Couldn't create your account. Please try again."

> **Inconsistency to note:** sign-up enforces **8** chars client-side, but the
> `weak-password` message mentions **6** (Firebase's own minimum). Keep the
> stricter 8-char client rule; the message copy is cosmetic.

---

## 4. Sign out & session

- **Sign out** (from the user menu) → Firebase `signOut()` → back to `/sign-in`.
- The go_router redirect (see [03](./03-navigation-shell.md) §6) reacts to the
  Firebase auth stream, so sign-out anywhere bounces to `/sign-in` and an
  unverified session bounces to `/verify-email`.
- On launch, Firebase rehydrates the session; show a splash/loader until the
  first `authStateChanges` event resolves, then route accordingly.
