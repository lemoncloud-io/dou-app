# ADR-0077: Cap push device registration (`reg-dev`) at once per install, and merge the mobile and desktop implementations into one

> Status: Accepted · Decided: 2026-09-08

## Context

The relay's device-token registration API (`POST {relay}/users/0/reg-dev`) is being called
**repeatedly for the same user, same device.** This API sends a notification to DoU's chatic
channel every time it's called, so the duplicate calls have shown up directly as notification
noise.

### Current call structure

The registration policy lives in
`libs/app-runtime/src/push/hooks/useDeviceTokenRegistration.ts`, and the app (`apps/web`) only
injects the FCM token fetch and the platform value as a delegate. There are two triggers.

1. **On authentication** (`isAuthenticated` → true): unconditionally once after `floor.reset()` —
   at least once per boot
2. **On foreground return** (`focus` + `visibilitychange`): re-fires with only a 60-second throttle

And it always sends `force: true`.

### The repeated calls were an intentional incident response

Dedup by matching token values was **deliberately removed** in the past, and the reasoning survives
in three places in the code (`session/store/identityStore.ts`, a hook comment in
`apps/desktop-web`).

> SNS disables a platform endpoint after a single delivery failure, and `CreatePlatformEndpoint`
> cannot revive a dead endpoint. Dedup by token match would leave that device permanently unable to
> receive push until reinstall.

In other words, "force re-register on every focus" is the only client-side recovery path for
reviving a dead endpoint.

### The real source of the duplication

- The 60-second throttle is **in-memory**, so it resets on every app restart → repeated boots are
  not throttled at all.
- The foreground-return path has no cap → users who open and close the app many times a day
  produce most of the call volume.

So an improvement that only touches "the call on boot" has little real effect.

### The implementation is duplicated

- `libs/app-runtime`'s hook — used by mobile (`apps/web`)
- `apps/desktop-web/src/app/shared/hooks/useDeviceTokenRegistration.ts` — its own implementation
  that doesn't use the runtime hook, and carries the same problem as-is

The desktop hook has a field **missing from the runtime hook**.

```ts
stage: window.CHATIC_APP_STAGE,
// If omitted, the broker falls back to its own default ('dev'),
// registering production desktop against the chatic-desktop-dev SNS app
```

`DeviceTokenDelegate` has no `stage` field at all.

### Constraints

- **The relay (relay/pushes-api) cannot be modified within this round.** A server-side fix that
  narrows the notification-send condition to "registration whose state actually changed" is off
  the table.
- The goal isn't softening the notification noise — it's **cutting the call count itself down to
  about once.**
- The target is to ship today (2026-09-08).
- The `apps/desktop-web` no-modification rule ([[no-touch-desktop-web]], ADR-0094) is **explicitly
  waived for this work only.**

### Storage facts

`@chatic/shared`'s `storage` defaults to `sessionStorage`, but inside a native shell (RN WebView /
Electron), `libs/web-config`'s `env.ts` (`libs/web-config/src/env.ts`) swaps it for `localStorage`.
The condition under which the registration hook runs (delegate non-null ⟺ native shell) matches
that scope exactly.

However, a WebView's localStorage can be wiped by the app's cache clear or storage pressure. If the
record disappears, it reads as "not registered" and triggers re-registration, so the feature stays
safe, but the call-reduction goal leaks by that much. Mobile already has a precedent —
`blurLastMessage` is stored natively for the same reason ("survives webview cache clears"), and
that path is controlled through the `SavePreference` bridge and the `PreferenceKey` whitelist
(`apps/mobile/.../usePreferenceCacheHandler.ts`).

## Decision

### 1. Cap registration at "once per install"

Once registration succeeds, record that fact in persistent storage, and skip calling `reg-dev`
while the record is valid.

### 2. Record key

```
push-reg:v1:<uid>:<deviceId>:<platform>
```

- The stored value also carries **the token that succeeded at registration.**
- If the key differs (account switch, device identifier change, platform change) or the stored
  token differs from the current one (token rotation), **the record is ignored and registration
  happens immediately.** Dedup means "skip only when nothing changed," not "skip."
- The `v1` in the key is a **policy version.** Bumping it to `v2` later forces every device to
  re-register once — a re-registration broadcast mechanism that costs no extra infrastructure.
- The key doesn't start with `@`. The `?logout=1` cleanup routine deletes `@`-prefixed keys (even
  if deleted, the uid is embedded in the key so behavior stays safe, but this avoids an unnecessary
  re-registration).

### 2-1. Mobile also mirrors the record natively

To survive a WebView cache clear, mobile also writes the same record to the native
`pushRegistration` preference. The two layers play different roles.

- **Web layer (localStorage)** — synchronous. Its reason for existing is letting the
  foreground-return path decide without a bridge round trip.
- **Native layer (MMKV)** — asynchronous. Hydrated into memory once after mount, and it backfills
  the web layer whenever the web layer is empty but native can answer.

The mirror is injected via `DeviceTokenDelegate.nativeRecordMirror` — following the existing
inversion where the app owns bridge knowledge and the runtime doesn't. Desktop has no Preference
bridge (only 4 main handlers), so it uses the web layer only, with no mirror.

**Since web deploys before the app, it's expected behavior for the mirror not to work right after a
release.** An older app has no key in its whitelist, so a write is rejected with
`PREF_KEY_NOT_WRITABLE`, and a read returns empty since there's no whitelist entry. In both cases,
behavior stays identical to before the mirror existed, using the web layer alone — durability only
improves on devices that have picked up the new app.

Extending the whitelist is a security-boundary change. The existing lock exists because
`debugSettings` carries `webviewBaseUrlOverride`, and letting web write it could hijack the next
run's WebView origin — but `pushRegistration` is opaque JSON that native neither reads nor
interprets, so it doesn't widen that surface.

### 3. Behavior per trigger

- **Authentication (boot/login) path**: always fetch the token from the shell (a cheap local bridge
  call) → compare against the key and token → register only if different. Token rotation is caught
  on the next boot.
- **Foreground-return path**: if a **success record already exists** for the current
  uid/deviceId/platform, **exit immediately without even fetching the token.** Only when there's no
  record (= the first registration hasn't succeeded yet) does it behave as before.

The return-path listener stays rather than being removed, because it's the only path that retries
first registration for "a user who granted permission later." After success it's effectively a
no-op.

### 4. Failure is not recorded

If registration fails or the token is empty, no record is written. It retries immediately on the
next trigger. The existing throttle-reset-on-failure behavior is kept.

### 5. `force: true` stays

While the call count drops, whenever it does call, it still forces the SNS endpoint to be recreated
and reactivated.

### 6. Merge the two implementations into one

Retire `apps/desktop-web`'s own hook and switch it to use `libs/app-runtime`'s hook. During the
merge, the following must be carried over.

- **Add `stage` to `DeviceTokenDelegate`, and have desktop inject `window.CHATIC_APP_STAGE`.**
  Omitting it means production desktop registers against the dev SNS app, killing push entirely.
- Desktop's token acquisition is event-based (`FetchFcmToken` → `OnFetchFcmToken`), not
  request/response. The desktop app side needs an adapter wrapping this to match the
  `fetchDeviceToken: () => Promise<string | null>` contract.

### 7. No kill switch

No mechanism to remotely turn this off (redeploying web constants, a static `flags.json`, feature
flag infrastructure) is built this round. Reverting relies on an app/web redeploy and the policy
version key (`v1` → `v2`).

### Scope

**In**

- The dedup/storage logic in `libs/app-runtime`'s registration hook
- Adding `stage`, `subscribeTokenChange`, `nativeRecordMirror` to `DeviceTokenDelegate`
- Adjusting `apps/web`'s delegate + wiring the native mirror
- Adding `pushRegistration` to `libs/app-messages`'s `PreferenceKey`, extending `apps/mobile`'s
  bridge whitelist
- Retiring `apps/desktop-web`'s hook and merging into the runtime hook (including the desktop token
  event adapter)

**Out**

- Relay (relay/pushes-api) changes — anything about `reg-dev`'s notification-send condition or
  response contract
- Native storage on desktop — Electron main has no Preference handler at all; adding one would be
  new work. Desktop uses only the web layer.
- Feature flags / remote kill switch infrastructure
- Changes to the debug screen's manual re-registration UI (`usePushRegistration` is left as-is; it
  still registers directly against the server as before, so it keeps working as a support-facing
  path)

## Alternatives

**Once-per-day cap (permanent 24-hour throttle)** — cap at once per device per day, but
re-register every 24 hours to auto-recover a dead SNS endpoint. This would meet the call-volume
goal while being the only option that keeps the recovery path fully alive, and was the initial
recommendation, but was not adopted because it falls short of the goal of "roughly once, period."

**Once per cold start (remove the return path)** — simplest to implement, but has no cap at all. If
the OS kills and restarts the WebView repeatedly, the count could reach dozens per day, so it
doesn't actually solve the problem.

**Re-register once on app/web version change** — include the version in the storage key, making it
effectively "once per release." Ordinary calls become 0, and a dead endpoint gets revived at every
release cadence, giving a strong cost-benefit ratio, but was excluded to keep strictly to "once per
install." The policy version key (`v1`) leaves room to achieve the same effect manually.

**Change the server-side notification condition** — have `reg-dev` notify the chatic channel only
when something actually changed — new endpoint creation, token change, reactivation — rather than
on every call. The most precise fix for the notification-noise symptom, but doesn't reduce call
volume itself, and relay modification is out of scope.

**Remote kill switch (redeploy web constants / static `flags.json`)** — since the web bundle
deploys before the native app, a single web constant already gives a redeploy-level revert
mechanism, and a static JSON would even allow a no-deploy revert. But it adds fetch, timeout, and
cache-TTL as new failure surfaces, conflicting with today's ship target, so it was not adopted.
Left as a follow-up.

**Once-per-install plus a manual re-register button on the debug screen** — adds an escape hatch
for support to revive an individual user. Not built, since the existing debug screen's registration
check already performs a real registration call with no extra UI needed.

## Consequences

### What is gained

- `reg-dev` calls converge to effectively once per device. Neither repeated boots nor foreground
  returns produce new calls.
- Chatic-channel notification noise drops by the same proportion.
- The bridge token-fetch round trip on foreground return also disappears (when a success record
  exists).
- Registration logic drops to one implementation, so desktop and mobile share the same policy.
- Thanks to the policy version key, forcing every device to re-register is a one-character constant
  change plus a deploy.

### Trade-offs accepted

- **Once an SNS platform endpoint is disabled, that device cannot recover on its own.** Recovery
  needs one of: reinstall, token rotation, account switch, or a policy-version-bump deploy. This is
  the exact failure mode that led to dedup being removed in the past, and this decision
  consciously reintroduces it. Users tend not to report "push isn't arriving," so this tends to
  become a silent failure.
- **The native mirror makes that silent failure last a bit longer.** A WebView cache clear used to
  be one of the few paths by which a dark device accidentally came back to life; with the mirror
  holding the record, that path closes. This is traded for the call reduction, and it only applies
  to mobile (desktop has only the web layer, so it still recovers via cache clear as before).
- Since there's no remote kill switch, if the above failure occurs broadly, reverting requires an
  app/web redeploy.
- Token-rotation detection is pushed to **boot time**. If the token refreshes mid-session, the
  server keeps a stale token until the next boot.
- Merging the desktop hook is a change with regression risk. In particular, a missing `stage` would
  cut off production desktop push entirely, so pre-deploy verification is required.

### How to revert

Bumping the policy version key (`v1` → `v2`) forces every device to re-register once. To undo
dedup itself, change the code to bypass the storage check and redeploy web (web deploys without app
store review, so it takes effect on the next boot).

## Next steps

Take this ADR as input into [[dev-2_implement]]'s spec-writing stage (Phase A).
