# ADR-0092: Entering the web debug overlay — a two-stage gate, ten taps plus an entry code

> Status: Accepted · Decided: 2026-08-03

## Context

- Today the web debug overlay opens **on a gesture alone**. Ten taps within three seconds on MyPage's
  "App version" ListRow unlock it immediately
  (`apps/web/src/app/features/debug/hooks/useDebugMode.ts:60`,
  `apps/web/src/app/features/mypage/pages/MyPage.tsx:229`). There is no knowledge check, so **an ordinary
  user can get in by accident.**
- The tools the overlay exposes are not read-only. It includes DB Browser, My Profile Editor, Email
  Login, Chunk Upload Test and Cache DB Test — items that **manipulate real data and sessions directly**
  (`apps/web/src/app/features/debug/overlay/debugMenu.ts:25-46`). An ordinary user getting in leads
  straight to data damage and support tickets.
- **The repository has no logic that identifies an administrator or operator.** `userRole` exists but is
  used only to test for `'guest'` (`libs/app-runtime/src/runtime/useRuntimeProfile.ts:51`). Gating on
  server-side permissions would need new backend design.
- There are three debug mode entry points in the repo.

    | Surface     | Gate                                                                                                                | Storage                            | Persistence                 |
    | ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------- |
    | web         | 10 taps on the app version within 3s                                                                                | sessionStorage `chatic-debug-mode` | Cleared when the tab closes |
    | desktop-web | 7 taps on the PlaceRail divider within 1.5s (`apps/desktop-web/src/app/features/chat/components/PlaceRail.tsx:127`) | localStorage `__dou_debug_mode`    | Permanent                   |
    | mobile      | No gesture of its own — the web unlock propagates over the bridge                                                   | MMKV `debugSettings`               | Permanent                   |

- But `apps/web/src/main.tsx:46` sends **`appBridge.setDebugMode(false)` on every web boot**. So any
  unlocked state left in mobile's MMKV is cleared each boot, and **the web gate is effectively the mobile
  gate** (in PROD; a non-PROD native build shows the FAB through a compile-time flag, but that is for
  internal distribution only).
- The threat model is limited to **"stop an ordinary user getting in by accident or curiosity"**. A
  deliberate attacker who reverses the bundle to extract the code is not the target here.

## Decision

### 1. A two-stage gate — the gesture (first) plus an entry code (second)

**Keep** the existing ten-tap gesture and add a code check behind it.

- Ten taps no longer unlock immediately; they **open an entry code dialog**.
- `setEnabled(true)` is called only when the code matches.
- The gesture remains a first filter that hides the entry path itself. Even if the code leaks, **it is
  useless to someone who does not know the way in.**

### 2. The code comes from the `VITE_DEBUG_CODE` environment variable, and it fails closed when unset

- Six digits, injected as `VITE_DEBUG_CODE` (an entry is added to `apps/web/.env.example` and to the CI
  secrets).
- **With the variable empty, the whole gate is disabled.** Ten taps open no dialog and nothing happens.
- There is no default fallback. That removes the path where a missing CI secret becomes a hole in
  production.

### 3. Three wrong entries → close the dialog and start over

- After three failures the dialog closes and the tap counter resets. Retrying means ten taps again.
- There is no cooldown timer and no persisted failure count. The cost of re-entry (ten taps) suppresses
  brute force well enough.

### 4. Persistence stays as it is

- The unlocked state continues to live in sessionStorage `chatic-debug-mode`. Closing the tab or app
  clears it, and the next time ten taps plus the code are required again.
- No separate expiry timer is added. The session scope already does that job.

### 5. The UI reuses a web-ui-kit component

- Use `libs/web-ui-kit/src/foundations/input/VerificationCodeInput.tsx`. It is numeric-only, `length`
  defaults to 6, it has an `error` prop, and it already has stories and tests while going unused in the
  app today.
- Do not copy the account verification component
  `apps/web/src/app/features/account/components/VerificationCodeInput.tsx`.

### Scope

**In** — the debug mode entry path in `apps/web`. Mobile depends on the web unlock, so it automatically
moves behind the new gate.

**Out**

- `apps/desktop-web`'s seven-tap PlaceRail gate (with permanent localStorage). Left as separate work.
- The mobile shell's own entry path and the compile-time FAB flag in non-PROD native builds.
- Gating on server-side permissions (role).
- Per-item permission granularity within the debug menu.

## Alternatives

- **Gating on server-side permissions (role)** — the most solid, but the repo has no notion of an
  administrator at all, so a backend schema and API would have to come first. Excessive against a threat
  model of "stop accidental entry".
- **A time-based (TOTP) or date-derived code** — more resistant to leaks, but an operator has to compute
  the current code every time and it is sensitive to device clock skew. The operational burden outweighs
  the gain.
- **Hardcode the constant in the source** — simplest, but this repo is published as an OSS mirror
  (ADR-0005). The code would be exposed in plain text.
- **Drop the ten taps and ask for the code alone** — a visible entry UI advertises that the thing exists
  and invites curiosity. The hidden gesture has real value as a first filter.
- **Skip the code in DEV/LOCAL** — easier locally, but a misconfigured `VITE_ENV` then becomes the hole,
  and the branching grows. One extra line in `.env` is cheaper.
- **Add an expiry timer after unlocking** — the sessionStorage scope already guarantees clearing at the
  end of the session. Redundant defence.

## Consequences

**What is gained**

- An ordinary user can no longer reach data-manipulation tools by tapping repeatedly.
- A leaked code is invalidated immediately by swapping the environment variable and redeploying. No
  source change needed.
- Different codes per deployment environment, so a staging code does not work in production.
- Fixing one place, the web, closes the mobile path too (thanks to the `main.tsx:46` kill switch).

**What is accepted**

- The code is in the bundle, so it does not stop an attacker who reverses it. That is the deliberate
  boundary of the chosen threat model.
- An operator has to do ten taps plus six digits every time they want the debug tools. Being
  session-scoped, that repeats each time the app is reopened.
- `VITE_DEBUG_CODE` becomes a new secret in the deploy pipeline. The workflow wiring (four
  `Generate env file` blocks) is done, but **registering the secret is a human step, and an environment
  where it is not registered is left with the gate off** — so that the omission does not look like a
  silent failure, the secret's name is written down under "CI injection" in
  [entry-gate.md](../../apps/web/docs/feature/debug/README.md).
- desktop-web's seven-tap back door remains. With an easier gate and permanent storage it is genuinely
  more exposed, and it has to be handled as follow-up work.

**Cleanup (check these during implementation)**

- `apps/web/src/app/features/debug/lib/isDevEnv.ts` — dead code with no callers. Only the barrel export
  and a test remain.
- `apps/web/docs/feature/debug/README.md` — its claim of "automatically enabled in DEV/LOCAL" disagrees
  with the current code. Update it with this change.
