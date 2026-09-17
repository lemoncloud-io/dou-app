# ADR-0080: The web controls debug entirely — shared model, build-stage visibility, the app only executes

> Status: **Accepted** · Written: 2026-09-08 · Implementation: **mostly Live** (measured 2026-09-10 — see §Implementation status below)
> The foundation is in place: [ADR-0079](./0079-config-registry-and-lane-resolver.md)'s steps 1-7 are implemented and committed
> (the general-purpose KV shell lane · the 84-key registry · `snapshotAll()`). This document's decisions build on top of that.
> **Ordering invariant: Decision 11 must land before Decision 12** — Decision 12's own justification is "once Decision 11 puts
> every button on the web, the FAB has nothing left to open," so deleting the app's UI before the web panel exists leaves
> neither side with a way to operate anything.
> Scope: `apps/web/src/app/features/debug/**` · `apps/mobile/src/app/features/debug/**` (15 screens ·
> 5,917 lines) · `apps/mobile/src/app/webview/AppWebView.tsx` (auto-recovery) · `apps/mobile/src/app/App.tsx` ·
> `apps/web/src/main.tsx` (comment) · `libs/app-messages` (per-screen commands) · a new shared model module
> Related: [ADR-0079](./0079-config-registry-and-lane-resolver.md) (config registry — this document amends its
> Decision 3 schema and its Decision 9 general-purpose panel in two places) ·
> Registry key proposal, which lived in the root docs tree, which has since been removed.

> Commit as measured: `4501835e3` (2026-09-08). Implementation as measured: `5f1f2ff4f` (2026-09-10).

## Implementation status (2026-09-10)

| Decision                                   | Status                | What actually exists                                                                 |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------ |
| 1 shared pure TS module                    | **moot**              | Nothing left to share with — see delta ① below                                       |
| 2 `platforms` · union                      | not implemented       | left for a later step — see delta ② below                                            |
| 3 unify category · name · language         | implemented (variant) | `features/debug/i18n.ts` — see delta ③ below                                         |
| 4 expose `buildStage`                      | **half**              | the registry row exists but the panel does not read it — see delta ④ below           |
| 5 split `env.stage` / `env.buildStage`     | implemented           | `libs/config/src/registry/env.ts`                                                    |
| 6 exclude `meta: true`                     | implemented           | `meta` in `types.ts` · `isHidden` in `ConfigScreen`                                  |
| 7 no shared components · visual convention | **moot**              | nothing left to align with (delta ①). A convention doc is unnecessary too            |
| 9 fix the `main.tsx` comment               | implemented           | `apps/web/src/main.tsx`                                                              |
| 11 all control lives on the web            | implemented           | 22 screens live on the web                                                           |
| 12 zero debug UI in the app                | implemented           | `818698ea8` — no `apps/mobile/.../features/debug`, no FAB                            |
| 13 remove the web-address-change feature   | implemented           | `4b80a76b7` — no `EnvironmentSettingsScreen`                                         |
| 14 the button set                          | **2/3**               | send logs now · view current settings now = present / clear cache by domain = absent |

Something this document did not plan for also got built. **The panel's own structure got reworked** (`5f1f2ff4f`) — the
screen list, which used to live in both `debugMenu.ts` and `MiniPanel.TABS`, is now one file, `overlay/screenManifest.ts`;
three shells collapsed into one `DebugPanel.tsx`; and the modes (mini/float/expanded) became a size axis
(`mini`·`dock`·`full`). **Size used to decide what was visible at all** — that was the reason the catalog had split.
Two screens are also new: `BridgeScreen` (channel detection · Ping round-trip · arbitrary commands), and edit
capability added to what used to be a read-only `ConfigScreen`.

### Delta ① — the premise behind Decisions 1 and 7 is gone

Decision 1 wanted the web and mobile to share a menu model, and Decision 7 wanted a convention to align the two
panels' visuals. **Decision 12 deleted all of the app's debug UI, so there is nothing left to share with and nothing
left to align with.** Open question ① — that a new lib would be needed because `libs/shared` is not RN-safe — goes
away with it: the manifest just needs to live inside `apps/web`. Only Decision 2's `platforms` survives (whether a
screen needs the app shell is still a real question).

### Delta ② — `requiresShell` instead of `platforms`

Decision 2 wanted to build the **union** of web and mobile screens, with each item carrying an array of which platform
it belonged to. With no counterpart left to union with (delta ①), only one question remains — **does this screen need
the native shell.** Instead of an array it's a single `requiresShell?: true`, and 8 screens carry it (device info ·
custom zip · boot records · push · SMS · OAuth · in-app purchase · deep link).

The gate is enforced in exactly one place. Picking that screen in a browser shows "Only works inside the app" instead
of the screen, the menu row gets an `App only` badge, and the chip renders in a dimmed state. **Putting `isNative` on
each screen individually only covered 5 of 9** — moving it to one place makes it impossible to skip.

Shell presence is re-read on a 1-second interval (`useShellPresence`). The shell's injected globals can appear only
after the web has mounted — that's why `WebBridgeClient` polls — so deciding this on first render would keep telling a
shell-equipped device "no shell" forever. The subscriber only exists while the panel is open.

Screens that use the shell only partially (log buffer · cache metrics · bridge) don't carry this indicator. They're
useful in a browser too, and the bridge screen's **entire reason to exist is reporting that there's no shell.**

### Delta ③ — no fixed language, two tables instead

Decision 3 said "fix the language to Korean." The implementation keeps one `ko`/`en` table each and follows the app's
language (`features/debug/i18n.ts`). The tables are typed against `DebugScreenKey`, so **a new screen must fill in
both languages to compile** — the drift Decision 3 wanted to stop is stopped harder this way than by fixing one
language. The tables ship in the bundle: the panel you open when boot is broken can't depend on a successful
`/locales` request, or labels show up as raw keys in that situation.

**What's still mismatched:** only the screen names went into the table — **screen body copy is still hardcoded in
Korean.** On a device set to English, the header shows English while the body shows Korean. Screens no longer render
their own name as an `h1` too, so at least the same name doesn't show doubled in two languages.

### Delta ④ — the row decides visibility, and sessionStorage is the unlock record

`useDebugMode` reads `debug.overlayEnabled`. Measurement showed the panel opening even with an empty session storage
in a DEV bundle — the 10-tap friction disappeared exactly where the row already makes the value true. PROD keeps the
row false, so it still requires 10 taps + entry code exactly as before.

**Keeping two sources is intentional.** The row is policy (the stage rule, decided via `env.buildStage` — Decision 5),
and sessionStorage is the unlock record. The latter works before `config.init()` runs and is PROD's only entry point.
Either one being true opens the panel. Turning it off requires clearing **both** — clearing only the unlock record
would leave LOCAL/DEV turning it back on via the stage rule, making "the web can turn it back off" false.

Unlocking also opens `system.overridesUnlocked`. Without this wiring, `surface: 'dev'` keys would have shown up
read-only in PROD (Decision 4's local-lane premise would collapse).

## Context

### 1. Sharing the model was the intent, but it ended as a copy, and it has already drifted

The first line of web debugMenu.ts declares its own
intent.

> `// Web counterpart of the mobile debug menu model (apps/mobile .../debug/debugMenu.ts).`

The intent was explicit, but the mechanism was copying. The result:

| Item                                 | Web                       | Mobile                                                  |
| ------------------------------------ | ------------------------- | ------------------------------------------------------- |
| `DebugMenuItem` · `DebugMenuSection` | identical                 | **identical — pure duplication**                        |
| `DEBUG_SCREEN_TITLES` derived reduce | identical                 | **identical — pure duplication**                        |
| Section categories                   | `Tools` / `Data` / `Info` | "Feature tests" / "Environment settings" / "Monitoring" |
| Language                             | English                   | **Korean**                                              |
| `UploadTest` title                   | `Chunk Upload Test`       | "Large upload test" (Korean copy)                       |

The same tool ends up with different category schemes and different languages, and the same screen ends up with two
names. The type is duplicated and the data has diverged — the typical outcome of copying, and it will keep happening
every time a screen is added if left alone.

### 2. The screen list is two closed unions, so overlap is implicit

10 web `DebugScreenKey` variants, 14 mobile `DebugOverlayScreenKey` variants. `UploadTest` is on both, and there are
more conceptually overlapping pairs (web `DeviceInfo` ↔ mobile `DeviceTest`, web `LogBuffer` ↔ mobile `Monitoring`,
web `BootTab` ↔ mobile `BootPerformance`). The only way to know which screen lives on which platform is **to read
both files side by side**, and there's no way to reach the other platform's screen from either panel.

### 3. The exposure policy only creates friction on LOCAL/DEV

Both sides require unlocking (10 taps + entry code). The unlock itself is already unified —
[`setDebugModeEnabled`](../../apps/web/src/app/features/debug/hooks/useDebugMode.ts) writes sessionStorage ·
`appBridge.setDebugMode()` · the injected global all at once, and its comment says "Single unlock/lock covers both
layers (PROD included)."

The problem is **the same gate regardless of stage.** Opening the web overlay during local development still requires
10 taps. On LOCAL/DEV this friction has zero security value.

### 4. The `main.tsx` comment misleads about the security gate (corrected by measurement)

[main.tsx](../../apps/web/src/main.tsx) currently reads:

> NOTE: this only hides the FAB on PROD builds, where the native gate is `debugModeEnabled` alone.
> **Non-PROD builds also show it via a compile-time flag the web cannot change** — that needs a native build.

**This is not true in the current tree.** `apps/mobile/src/app/App.tsx:56`'s FAB mount condition is just
`debugModeEnabled && !isDebugOverlayVisible`, and there is no other mount path. On mobile, `__DEV__` is only used for
console · WebView debugging · log sinks and **plays no role in whether the debug panel shows.**

There is exactly one build-stage gate, and it isn't on the FAB — it's on a single **item inside the menu**:
`apps/mobile/src/app/features/core/components/FloatingMenu.tsx:11`'s
`ALLOW_ENVIRONMENT_SETTINGS = Config.VITE_ENV !== 'PROD'`
hides only "Environment settings" (loading an arbitrary URL). That comment's basis is accurate.

The stale comment leads readers to believe "outside of PROD there's an exposure path the web can't turn off," and
that puts a security judgment on a false premise. It needs correcting.

### 5. There is currently no way to share visual tokens

[libs/theme](../../libs/theme/src/provider/ThemeProvider.tsx) is **web-only** — React +
`window.document.documentElement` + `matchMedia`. Mobile has its own theme. So half of "make it look similar" means
building a platform-neutral token layer first, and that is a separate, large effort that touches the entire product UI.

## Decision

### Decision 1 — Promote the menu model to a shared, pure TS module

One place owns `DebugMenuItem` · `DebugMenuSection` · the section array · the derived title map, and both sides
import it. Zero React dependency — this keeps the property the web file already documents: "Pure data so navigation
and rendering can be unit-tested without React."

**The location is left as a spec-stage decision.** `libs/shared` carries web APIs like `useLocalStorage`, which is
unsafe to import from RN. Whether this needs a new small lib or a subpath entry point on an existing lib gets decided
together with lib-boundary policy.

### Decision 2 — The model declares screen availability, and the list is a union

```ts
export interface DebugMenuItem {
    key: DebugScreenKey; // merges the web and mobile keys into one union
    title: string;
    platforms: readonly ('web' | 'native')[];
}
```

The list is a **union**. Each panel renders its own platform's screens directly, and screens exclusive to the other
platform show up as **a bridge deep-link item** (active only when the native shell is present). This is what actually
makes "the two panels feel like one tool," and it turns §Context 2's implicit overlap into a type.

### Decision 3 — Unify category · name · language into one. The language is Korean

Categories follow the mobile-side axis ("Feature tests" / "Environment settings" / "Monitoring") and web screens get
placed into it — web's `Tools`/`Data`/`Info` are a convenience grouping, not a property, and they carry no extension
rule.

**The language is fixed to Korean.** This panel's users are the team's developers and QA, and the QA docs canon is in
Korean. The code-comments-in-English convention applies to code, not to on-screen copy. The state where the same
screen has two names (§Context 1) goes away with this decision.

### Decision 4 — Exposure is decided by `env.buildStage`. LOCAL/DEV expose by default, PROD fails closed

Expressed as an ADR-0079 registry row.

```ts
'debug.overlayEnabled': {
    title: 'Debug overlay',
    description: 'Enables entry to debug screens. PROD requires 10 taps + entry code.',
    type: 'boolean',
    defaultValue: false,
    byStage: { LOCAL: true, DEV: true },   // PROD stays false (there are only these three stages — ADR-0079 Decision 14)
    writableBy: ['shell', 'local'],
    persist: 'session',
    meta: true,                             // Decision 6
}
```

On LOCAL/DEV it opens without 10 taps; on PROD it requires the unlock exactly as today. Web and native **read the
same row**, so policy becomes one thing.

Keeping `'local'` in `writableBy` is a deliberate choice. When reproducing a PROD issue in a browser or in
desktop-web, the 10-tap+code path is the only entry point, so limiting writes to the shell alone would block that
case. **Owning entry-code verification stays with the calling flow, not with `config`** — authentication is not the
config registry's job.

### Decision 5 — Split `env.stage` and `env.buildStage` (amends ADR-0079)

The moment exposure decisions move onto stage, stage becomes a security-relevant input. But the current
[env.ts](../../libs/config/src/registry/env.ts) reads:

```ts
export const WEB_ENV = (window.ENV || import.meta.env.VITE_ENV || '').toLowerCase();
```

**By shape, the injected global wins over the build constant.** But measurement shows **zero** code reading
`window.ENV` (ADR-0079 §Context 5), so **there is no live forgery path today.** This split is not closing a hole
that's already been exploited — it's a **preventive measure against a hole that combining them would create.**

The prevention matters because both values genuinely exist. `VITE_ENV` (build-injected) and `CHATIC_APP_STAGE`
(shell-injected, consumed by `deviceInfoStore`) don't meet today, but both are alive, and putting them into one
`env.stage` registry entry would make them meet. So the two are kept apart.

| Key              | Source                                   | Forgeable | Use                                        |
| ---------------- | ---------------------------------------- | --------- | ------------------------------------------ |
| `env.stage`      | injection-first (keeps current behavior) | yes       | display · log context · non-security rules |
| `env.buildStage` | **`import.meta.env.VITE_ENV` only**      | no        | **security rules only**                    |

`byStage` rules that carry security properties (`debug.*` · `system.overridesUnlocked`) are decided by
`env.buildStage`. A PROD bundle is PROD no matter which shell it runs under. The trade-off is "a DEV app running a
PROD web bundle won't show the panel," and it's right that the risk sits with the bundle.

### Decision 6 — `meta: true` keys are not rendered by the general-purpose panel (amends ADR-0079)

ADR-0079 Decision 9 turns the shell debug screen into "a general-purpose screen that renders the envelope as-is." If
so, `system.overridesUnlocked` and `debug.overlayEnabled` are just another row, so **the panel would carry the switch
that unlocks it.** That's a cycle — the switch that unlocks the screen sits inside the screen you need to be unlocked
to enter — and a hole around the dedicated flow (10 taps + entry code).

Add a marker to the registry schema.

```ts
/** The general-purpose panel does not render an edit UI for this key. Only the dedicated flow can use it. */
meta?: boolean;
```

Applies to: `system.overridesUnlocked` · `system.remote.enabled` · `debug.overlayEnabled` · `debug.entryCode`.

This is a different axis from `writableBy` (which lane can write). `meta` marks "what must be proven before writing"
as living outside the registry. The proof itself isn't owned by config (Decision 4).

### Decision 7 — Don't share components. Align visuals by convention

React DOM and React Native components can't be shared, and there's no shared token layer either (§Context 5).
Building platform-neutral tokens is a separate track that touches the whole product UI, and **the debug panel is a
weak reason to start that track.**

Instead, align them with a short convention document: same section order · same row shape (label left, value right,
tap to copy) · same empty-state copy · same danger-item marker. Gets most of the "same tool" perception without
shared components.

### Decision 8 — ~~Don't consolidate panel content~~ → **Reversed.** Follows Decision 11

The draft said "only consolidate the model, the entry point, and the general-purpose key editor screen; leave the
content as-is." The reasoning was that the two panels can't see each other's layers, so consolidating would mean
turning every read into a bridge round trip.

That cost calculation is right, but the conclusion was wrong. Following the remote-control picture (Decision 10) to
its end means **every button has to be on the remote.** Decision 11 supersedes this one.

### Decision 9 — Fix the stale `main.tsx` comment

Correct §Context 4's text to match the current code. Leaving a false premise about a security gate in place is itself
a risk, and Decision 4's reasoning depends on this fact.

### Decision 10 — The web is the remote, the app is the device

The nine decisions above are each individually correct, but the reason they split this way is one picture.
**The web is the remote, and the app is the device.**

| What the remote (web) does | What the device (app) does                          |
| -------------------------- | --------------------------------------------------- |
| Knows what a key means     | Stores the letters. Doesn't know the meaning        |
| Draws the button           | Hands over the whole value when turned on           |
| Opens the device's screen  | Lets it open                                        |
| Changes the value          | Keeps the changed value and hands it back next time |

Several decisions follow from this automatically. You don't buy a new TV for a new button — so a new toggle costs
zero app releases (ADR-0079 Decision 9). The remote must be able to open a device screen, so the bridge deep link is
needed (Decision 2). A single remote handling two devices needs one button list, so the model is shared (Decision 1).

#### The power button is on the remote too

The draft wanted to leave only the unlock on the app. The reasoning was "a remote can get lost, and one link is
effectively the remote" — but **the analogy is wrong.** Unlocking isn't a URL, it's **a 10-tap gesture + entry code.**
A link can't do that.

Measurement makes it clearer still. The only place the app turns on `debugModeEnabled` is a single bridge message
handler (`apps/mobile/src/app/webview/hooks/usePerfHandler.ts:30`), and **the app has no independent unlock path of
its own.** The web is already the only key.

So no exception is carved out. **Every button, down to the power button, lives on the remote.** For the full reasoning,
see [ADR-0079 Decision 5](./0079-config-registry-and-lane-resolver.md).

#### The remote needs to know it was pressed

One thing missing from this picture: **writing a value to the app needs an acknowledgment.**

Bridge writes today fire and forget. That leaves a state where the screen says "turned off" while the app hasn't
actually turned it off. A remote that doesn't know whether it was pressed isn't a remote.

This code has already hit this once. Theme is the one exception that gets an acknowledgment and retries once
(`syncThemeToNative` in usePreferenceStore). Its comment
explains why — theme is the one setting that can't self-correct once the write is lost, and fire-and-forget can't
tell you it was lost.

**Every config value has that same property.** So the path that writes to the app (ADR-0079 Decision 9's
`SaveConfigValue`) waits for an acknowledgment, retries once on failure, and shows "not saved" on the screen if it
still fails. It never silently pretends to succeed.

### Decision 11 — All control happens on the web. The app only executes

Move the **buttons** for the app's 15 debug screens (**5,917 lines**) to the web. Only actual behavior and native UI
stays in the app.

| What               | Where                                                          |
| ------------------ | -------------------------------------------------------------- |
| The button pressed | **web**                                                        |
| Actual execution   | app (only the app can call native APIs)                        |
| Result display     | **web** — the app hands the result back                        |
| System dialogs     | app (permission prompts · payment sheets are raised by the OS) |

Each screen needs its own bridge command, and creating that command costs an app release. **This differs from a new
toggle** — a new toggle costs zero app releases, but calling a new _action_ from the web requires the app to know
that action. Once punched through once, that screen's button layout and copy afterward change on the web.

#### Delete the bridge test screen

Delete `BridgeTestScreen` (452 lines).

The original reason to keep this screen in the app was "you can't test the bridge over the bridge." True, but it
doesn't justify the screen. **If the bridge dies, the app can't launch the web.** The white screen already tells you
that. A 452-line screen has nothing extra to say.

Bridge status is told by the **handshake and logs**, not a screen — those are automatic and always on.

#### The environment-settings screen isn't moved — it's removed

The environment-settings screen (281 lines) isn't moved to the web. **The feature itself is cut** — Decision 13.

### Decision 12 — Remove all debug UI from the app. Drop the FAB too

Once Decision 11 puts every button on the web, the FAB has nowhere to open. All three things left in the app need no
human tap.

| What stays in the app       | What starts it                |
| --------------------------- | ----------------------------- |
| Executing real actions      | the web calls it              |
| Permission · payment sheets | the OS raises them            |
| Auto-recovery               | runs on its own (Decision 11) |

So `FloatingMenu`, `DebugHomeScreen`, and the
mount condition in `App.tsx` are deleted. **The app's debug UI drops to zero.**

**This deletion only holds once Decision 11 is in place.** The "web calls it" row in the table above requires the
call to actually work — doing this alone before the web panel exists leaves QA unable to touch either side. As of
2026-09-10, not yet started: `apps/mobile/src/app/features/debug` **32 files, 7,237 lines** (15 screens,
5,917 lines) · `FloatingMenu.tsx` 202 lines · the `App.tsx` mount condition all remain unchanged.

There's no need to leave a separate power button either — since the unlock lives on the web (Decision 10), the idea
of leaving one last switch in the app no longer holds.

#### What if the web dies completely

Two cases.

**A bad address got set** — Decision 11's auto-recovery reverts it. There's nothing for a human to press.

**The default deployment itself is broken** — that's not something to fix on that device. Every user hits the same
problem, and the web needs to be redeployed. This isn't something QA can solve on their own phone, so an app screen
would be useless even if it existed.

Neither case needs app UI.

### Decision 13 — Remove the ability to change the web address

A list-restricted version was considered, but **the feature itself is cut.**

This screen decides where the web loads from. The current code describes itself this way:

> The environment-settings item exposes webview URL overrides (**loading any address**) — a **production security
> surface** offered only in non-PROD builds
> (comment in `apps/mobile/src/app/features/core/components/FloatingMenu.tsx:11`)

A list restriction removes "any address," but it **doesn't stop "the wrong environment."** Even a listed address is
still a development environment, and a production user's device pointing at a dev backend is dangerous on its own.
So even with a list, PROD still has to stay closed, which means **building the list, its validation, and its recovery
just to keep a feature permanently closed.**

#### Split by build instead

To change environments, use that environment's build. `VITE_WEBVIEW_BASE_URL` gets baked in at build time and doesn't
change at runtime. It's already there — nothing new to build.

Drop `debug.webviewBaseUrl` and `debug.environmentSettings` from the registry. Keep only the read-only build fact
`env.webviewBaseUrl`, so the debug screen can show "where this loaded from right now."
`apps/mobile/src/app/features/debug/screens/EnvironmentSettingsScreen.tsx`, 281 lines, is deleted.

#### So auto-recovery isn't needed either

The auto-recovery Decision 11 planned to add was **meant to rescue a device that had switched to a bad address.**
With no way to switch, there's nothing to rescue. It's dropped along with it.

The fact that `AppWebView` has no load-failure handling still stands, but its character changes. A broken default
deployment is something **every user hits together**, and it isn't something that device can fix — the web has to be
redeployed. There's nothing useful the app can do in that case, so there's no reason to build a safety net.

#### What is accepted

A developer wanting to view local web in the app **needs a separate local build.** Reinstalling the app makes
switching environments more of a hassle than today. In exchange, one production security surface and one recovery
mechanism disappear entirely.

The feature that loads a web bundle from a custom zip (`customZipLocalRoot` · `customZipServerUrl`) has the same
character but is out of this decision's scope — it isn't in the registry and stays as internal app state. Whether to
clean it up together is looked at separately.

### Decision 14 — Add three buttons to code that already exists

These are **actions**, not keys. They carry no value, so they don't go into the registry — they become items in
Decision 1's shared menu model.

All three are **things the feature already does, but nothing can call.** Almost no new code needs writing.

| Item                      | What already exists                                                                   | Why it can't be used today                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Send logs now**         | [`LogUploadScheduler.flushNow()`](../../libs/logger/src/upload/LogUploadScheduler.ts) | Only fires on app quit/logout. No way to send right after reproducing a bug                         |
| **View current settings** | `config.snapshotAll()` (ADR-0079 Decisions 3·16)                                      | There's no screen. Just needs to render the list                                                    |
| **Clear cache by domain** | The cache screen's clear path                                                         | Only "clear everything" exists. Clearing just channel or just profile to reproduce is a common need |

`platforms` is `['web']` for all three — the web calls it and the web shows the result. Only cache clearing needs a
bridge command, since it must clear native cache too (included in Decision 11's per-screen commands).

**Writing down the criterion behind picking these three.** What else to add to the debug screen has no natural end,
so **"code exists but has no way to be called"** is looked at first. New features don't start life on the debug
screen.

## Alternatives

**Share components too (react-native-web, etc).** Visuals become genuinely identical, but an RN compatibility layer
enters the web bundle, and the two panels see different layers to begin with, so there's little to actually share.
The cost far outweighs the benefit.

**Leave panel content as-is in the app.** The bridge contract doesn't grow. But the remote picture stays half-built —
buttons scattered across two places means remembering, every time, which one does what. Rejected (Decision 11). The
objection "unusable if the bridge breaks" doesn't hold — if the bridge dies the app can't launch the web anyway, so
the white screen already answers that.

**Build the visual token layer first.** Order-wise it looks right, but it means starting a track that touches the
entire product UI for the sake of a debug panel. Not worth spending that cost on a benefit a convention can
substitute for (Decision 7).

**Decide exposure via `env.stage` (injection-first).** Shorter code, one fewer key, but a forgeable value becomes a
security gate. A repackaged shell reporting `'DEV'` would open the panel in a PROD bundle. Rejected (Decision 5).

**Keep the current copy as-is.** Both files stay free to diverge on their own. But §Context 1 is already evidence of
drift, so "keep" really means "let it keep happening." Rejected.

## Consequences

**What is gained.**

- **Buttons live in one place.** No need to remember every time which side does what.
- **Screen copy and layout change without an app release.** Punch a command through once, and everything after that
  is a web deploy.
- **The app's debug UI drops to zero** — FAB · debug home · 15 screens. The app only executes.
- **452 lines disappear** — the bridge test screen. No reason for a screen to say what a white screen already says.
- **One production security surface disappears.** "Load any address" is gone, along with the list · validation ·
  recovery machinery that would have protected it. The 281-line screen is deleted too.
- Type duplication disappears, and adding screens no longer splits category or language.
- Which screen lives on which platform is now visible in the type, and both sides can be seen from one entry point.
- The 10-tap friction on LOCAL/DEV disappears. Policy is one row, so web and native can't drift apart.
- Pre-empts a forgeable value becoming a security gate (Decision 5).
- Closes the hole where the general-purpose panel renders its own lock (Decision 6).
- The stale misunderstanding about the security gate is removed from the code (Decision 9).

**What is accepted.**

- **The migration surface is large.** Moving buttons for 15 screens totaling 5,917 lines, and punching a bridge
  command through for each. Every command punched through costs an app release — the "zero app releases" of a new
  toggle doesn't apply here.
- **Switching environments gets more cumbersome.** Viewing local web in the app needs a separate local build
  installed.
- **Visuals are still two separate things.** Alignment by convention isn't enforced, so it depends on review
  discipline.
- **Where the shared module lives is undecided.** `libs/shared` isn't RN-safe, so a new lib may be needed, and a lib
  for 60 lines of data looks like overkill — the evidence of drift is what supports that judgment anyway.
- **The key union grows.** Web's 10 plus mobile's 14, once overlap is resolved, comes to roughly 20, and each panel
  now knows about keys it has nothing to do with, as a type. That's the explicitness `platforms` buys.
- **Amends ADR-0079 in two places** — Decision 3's schema (adds `meta`) and the registry's `env.*` (adds
  `buildStage`). 0079 is a committed document, so this amendment history lives in this ADR.
- **Splitting `env.buildStage` can cause confusion.** Not knowing there are two stages makes it possible to
  accidentally use `env.stage` in a security rule. The registry comment and the drift gate (ADR-0079 open question ⑧)
  are the defense.

## Open questions — handed to the spec stage

> Updated 2026-09-10: ①·②·⑥ are gone because of Decision 12 (deleting the app's debug UI), and ④·⑤ have been
> answered by implementation. What remains is the leftover part of ③, and two new ones (§Implementation status
> deltas ②·④).

1. ~~**Where the shared model module lives.**~~ → **N/A.** There's nothing to share with (delta ①). The manifest
   lives at `apps/web/src/app/features/debug/overlay/screenManifest.ts`.
2. ~~**How to handle overlapping screen pairs.**~~ → **N/A.** The app-side screens are all deleted, so there are no
   pairs to overlap.
3. **Per-screen bridge commands.** Most are punched through — screens call `appBridge`'s existing commands. What's
   left is Decision 14's clear-cache-by-domain, which needs a command because it must also clear native cache. The
   constraint **no generic execute command** still holds.
4. ~~**Disposition of the custom-zip feature.**~~ → **Ported to the web** (`4b80a76b7`). The loader lives on the web
   and the screen is `CustomZipScreen`. PROD is refused by the app.
5. ~~**Failure display for acknowledgments.**~~ → **Attaches to a single row** (`ce5fd3a77`). `useDebugOperation.run`
   writes it into the result line, and commands the app version doesn't recognize are distinguished from failures as
   "This app version doesn't support this." The settings screen's refusal reasons attach the same way, below the row.
6. ~~**Who owns the visual convention document.**~~ → **N/A.** There's nothing to align with (delta ①).
7. ~~Exposure on STAGING~~ → **N/A.** This repo only has three stages — `LOCAL`·`DEV`·`PROD` — and `STAGING` doesn't
   exist (measured in ADR-0079 Decision 14). The draft's assumption of a generic four-stage setup was an error.
