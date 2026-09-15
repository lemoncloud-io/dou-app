# push — registering a device token, once per install

A live socket only sees the cloud it is connected to. Everything else — a message in another cloud, a
message while the app is closed — arrives as a push, and that requires the shell's device token to be
registered with the home broker, which the central push service then fans out through.

This folder owns **when to register and when not to**. It does not know how a token is obtained;
that is shell knowledge, and it arrives as a delegate.

## Layout

```text
push/                              3 source files, 2 tests
├── index.ts                      the `push` facade group
├── hooks/useDeviceTokenRegistration.ts   the lifecycle hook and the policy
└── registrationRecord.ts         the durable "already registered with this token" record
```

`PushRegistrationRecord` is deliberately **not** published. It is the policy's internal state, and
there is no reason to plant or clear it from outside. What an app supplies is where to keep it, not
what it contains.

## Responsibilities

| Owner                       | What                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **app-runtime**             | The whole registration policy: auth gating, once-per-install dedup and its durable record, the burst floor, retry on failure, overlap prevention, injecting the device id and the account uid, and calling the mutation |
| **the app (shell adapter)** | All shell knowledge: how to obtain a token, reading the shell's window globals, and deciding whether this even _is_ a native shell                                                                                      |

Outside a native shell the app passes `null` and the hook is a no-op. This is the same inversion as
the socket auth delegate — the runtime does not know the shell, and the shell injects only the
acquisition path.

## The shared contract

```ts
interface DeviceTokenDelegate {
    fetchDeviceToken: () => Promise<string | null>; // null = unobtainable (permission denied, …)
    platform: string; // 'ios' | 'android' | 'desktop' …
    installId?: string; // @deprecated — falls back to useDynamicDeviceId().firebaseInstallationId
    application?: string; // defaults to 'chatic'
    stage?: string; // omit and the broker uses its own default — see below
    subscribeTokenChange?: (onChange: () => void) => () => void; // read once, on mount
    nativeRecordMirror?: NativeRecordMirror; // a durable home for the record (mobile only)
}

useDeviceTokenRegistration(delegate: DeviceTokenDelegate | null): void;
```

### Register once per install, not once per launch

A successful registration is recorded, and while that record matches the current **account, device,
platform and token**, nothing is sent again.

**The record holds the token, not a boolean.** The meaning of a skip has to be "nothing changed", not
"we did this once" — otherwise a rotated token is never registered.

The account uid comes from `getRelaySessionUser()`, **not** from `useSessionIdentity().userId`. The
latter reads the _active slot's_ token, so it moves whenever a cloud is entered, and keying on it
would turn "once per install" into "once per cloud switch".

When a call does go out it always sets **`force: true`**. The broker skips any re-registration it has
seen within the hour, and `force` is the only way through that guard — which means the policy above
is the only thing limiting call volume.

### The record lives in two tiers

- **Web tier** — `@chatic/shared`'s `storage`, which apps point at `localStorage` inside a shell. **Synchronous**, so the foreground-return path can decide without a bridge round trip.
- **Native tier** — only when the shell supplies a `nativeRecordMirror`. It survives a WebView cache wipe, and it is **asynchronous**, so it is hydrated once after mount. A read that finds the web tier empty and the native tier populated backfills the web tier.

Hydration runs **after** the foreground fast path and **in parallel with** the token fetch. After,
because doing a bridge round trip to avoid a bridge round trip defeats the point; in parallel,
because both are 10-second bridge requests and serializing them stacks two timeouts. A boot that has
not hydrated yet may do one unnecessary token fetch, and the token comparison still prevents the
call.

Only mobile supplies a mirror; the desktop shell has no preference handler for it. And because the
web bundle deploys ahead of the app, **the mirror not working right after a release is normal** — an
older shell refuses the write and returns nothing on read, both are swallowed, and the web tier
behaves exactly as it did before.

The storage key is `push-reg:<policy version>:<uid>:<deviceId>:<platform>`, holding
`{ id, token, at }`. `at` is diagnostic; **there is no expiry**. A corrupt or half-written entry reads
as "never registered" rather than throwing. The key is deliberately **not** `@`-prefixed, so the
logout storage sweep does not delete it.

Bumping the policy version is the only lever that re-registers everybody. There is no remote kill
switch.

### Triggers

| When                                                        | What happens                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Authentication completes (launch, re-login, account switch) | Fetch the token, compare with the record, register if it differs. **The only place a rotation is caught** |
| `focus` / `visibilitychange` → visible                      | With a record present, return immediately — no token fetch at all. Only register when there is none       |
| The shell reports a token change                            | Clear the floor and register immediately                                                                  |
| Fetch failed, token empty, or the API failed                | Write no record, reset the floor — the next trigger retries at once                                       |
| A trigger arrives mid-registration                          | Ignored                                                                                                   |

The asymmetry between launch and return is deliberate. Rotation detection has to happen somewhere,
and boot is the cheap place; foreground return happens dozens of times a day and must not cost a
bridge round trip.

The **60-second floor is not a re-registration interval** — the record is the ceiling. Two jobs are
left for it: absorbing the `focus` and `visibilitychange` pair that one foreground transition fires,
and capping the fallback below.

### When there is no uid

The key cannot be built, so the record can be neither read nor written, and the hook **falls back to
the old behaviour of registering every time**. Silently skipping would leave the device dead; calling
too often is the safer direction to fail in, and the floor caps it.

### The trade

The earlier strategy re-registered on every trigger, which quietly self-healed a disabled push
endpoint: the push service disables an endpoint after a single delivery failure, and re-creating it
does not bring it back. Registering once per install gives that up in exchange for the call volume.
Recovery now depends on something else changing — a token rotation, a reinstall, or a policy-version
bump.

## Usage

```tsx
// apps/web/src/app/bridge/useDeviceTokenRegistration.ts — shell knowledge only
const delegate = useMemo<DeviceTokenDelegate | null>(() => {
    const platform = window.CHATIC_APP_PLATFORM;
    if (!platform) return null; // plain browser → no-op
    return {
        fetchDeviceToken: () =>
            appBridge
                .fetchFcmToken()
                .then(r => r.data?.token ?? null)
                .catch(() => null),
        platform,
        installId: window.CHATIC_APP_INSTALLATION_ID,
        application: 'chatic',
        nativeRecordMirror,
    };
}, []);

runtime.push.useDeviceTokenRegistration(delegate);
```

Where it is mounted is the app's choice. It is **not** built into `RuntimeConnectionHost`, because the
delegate needs app and shell context that the host cannot supply with no arguments.

### `stage` is not optional on desktop

Omit it and the broker registers under its own default. The token then belongs to one Firebase
project while the push credentials belong to another, FCM rejects the send as a sender mismatch, and
the push service disables the endpoint. **The registration API returns success**, so nothing in the
logs says this happened. Mobile does not pass it today because its build flavour already selects the
right project.

### What not to do

- **Do not key the record on `useSessionIdentity().userId`.** It follows the active slot and breaks once-per-install into once-per-cloud.
- **Do not drop `force: true`.** The broker's one-hour guard would swallow a genuine re-registration.
- **Do not store a boolean.** A skip has to mean "nothing changed".
- **Do not `@`-prefix the storage key.** The logout sweep clears that namespace.
- **Do not hydrate the mirror before the foreground fast path**, and do not chain it with the token fetch. Both are bridge requests with their own timeouts.
- **Do not build the token in this folder.** Permission prompts and token issuance are the shell's.

## Notes for implementers and tests

- `useDeviceTokenRegistration.test.tsx` drives the hook through the three triggers; `registrationRecord.test.ts` covers the two tiers, the backfill and corrupt entries.
- `subscribeTokenChange` is read **once on mount**. A delegate that changes identity on every render will not re-subscribe.
- The hook holds a `Coalescer` (one attempt at a time) and a `Throttle` (the floor) in refs. The floor is consumed only when an attempt will actually be made — checking it before the record would spend it on a call that was going to be skipped anyway.
- The record is written only **after** the server accepts. Any failure resets the floor so the next trigger retries immediately.

## Further reading

- [docs/data/](../data/README.md) — `useRegisterDeviceTokenMutation`, the call this hook makes
- [docs/session/](../session/README.md) — `useDynamicDeviceId` and `getRelaySessionUser`, the two identity inputs
