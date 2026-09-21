# ADR-0108: One module owns the history stack, and depth is the router's index

> Status: Accepted · Decided: 2026-09-21 · Implemented: `feat/navigation-stack` · Scope: `apps/web/src/app/navigation/**` · `apps/web/src/app/hooks/useBackHandler.ts` · `apps/web/src/app/bridge/navigation/**` · `apps/web/src/app/features/invite/accept/**` · `apps/web/src/app/ui/transientUi.ts`

## Context

At `dcc98b76`, `apps/web` had 115 `navigate()` call sites across 56 files and no single place that
decided what any of them did to the history stack. The rules that existed lived in four files that
did not know about each other, while all four wrote to one `window.history`:

- `bridge/navigation/usePushNavigate.ts` held three rules for push entry — skip the same target,
  replace when leaving a channel room, push otherwise.
- `features/mypage/pages/LoginPage.tsx` decided whether leaving login rewound or went home, from
  `returnTo && window.history.length > 1`.
- `ShareLinkRedirect`, `InviteEntryGate` and `useEnterInvitedChannel` decided the invite chain, and
  ended it with an unconditional `navigate(home, { replace: true })`.
- `hooks/useBackHandler.ts` decided what a native back press did, from
  `location.key !== 'default' && window.history.length > 1`.

Three reported symptoms came out of that single gap. Entry screens accumulated on invite, login and
push. The in-app banner survived a back press. And the shell's idea of "can this app go back"
disagreed with the web's.

Two of those four sites asked `window.history.length`, and that is the root defect rather than a
detail. The value is global to the WebView and only ever grows: it counts entries a redirect
replaced, pages visited before the app was loaded, and whatever an earlier session left behind. On
a long-lived WebView it answers "yes, you can go back" while the app sits on its own first screen.
Measured in the real Android WebView, at home after one round trip into a room and back:

```
path "/"   idx 0   history.length 2
  history.length > 1  ->  TRUE    <- wrong; this is the first screen
  idx > 0             ->  false   <- correct
```

## Decision

### 1. `app/navigation/` owns the stack, forwards and backwards

Going forward and going back touch the same resource. The moment a policy answers "this entry
replaces", the back behaviour of that screen is already decided — so two files deciding it
separately means two inferences about one stack, which is what the four sites above were.

The module answers three questions and nothing else: how an arrival goes onto the stack
(`useStackNavigate`), whether there is anywhere to go back to (`canGoBackInApp`), and whether the
app consumed a back press (`useStackBack`). `index.ts` is its whole public surface.

Four things are deliberately outside it, each because it belongs to a layer that is not history:
overlay detection (the UI library's business — `useStackBack` is told whether one is open),
toast dismissal (the presentation layer registers a callback), the cloud and site switch (session
layer; `usePushNavigate` keeps it and calls the module only at the final landing), and
`utils/routeTrail`, which answers a different question — where the reader has BEEN, not what is
BEHIND them. The feedback report and the log context read the trail, and moving it would have made
those depend on navigation.

### 2. Depth is `history.state.idx`, never `window.history.length`

The router writes its own index into every history entry and back-fills `idx: 0` on init, so index
0 means the app's first screen and nothing else. `stackDepth.ts` is the only reader.

An unreadable index answers `false`. It means something called `history.pushState` past the router,
and rewinding to a place we cannot locate is the one outcome worse than not rewinding.

One cost is accepted: after a reload lands mid-stack the index survives but the entries behind it
belong to a document that is gone, so going back is a real page load. The alternative is a back
button that does nothing on every screen after a reload, which is worse. The retired
`location.key !== 'default'` half of the old check is exactly what used to produce that.

### 3. Home is the floor — a deeplink entry always sits above it

The shell always loads the base URL into the WebView, and a deeplink arrives afterwards as an
`OnNavigate` bridge event rather than as the initial address. So home is underneath a deeplink
entry whether or not the app was already running. Measured, with a control:

| Launch                 | Landing                                                   | `idx` |
| ---------------------- | --------------------------------------------------------- | ----- |
| cold + invite deeplink | `/`                                                       | **1** |
| cold + `/s` deeplink   | `/invite/accept?code=…&provider=invite&version=2&relay=1` | **1** |
| cold, no deeplink      | `/`                                                       | **0** |
| warm (from a room)     | `/`                                                       | **2** |

This was originally specified the other way round — cold entry was expected at `idx === 0`, and the
invite exit was to branch on it: `replace` to home when cold, `back` when warm. The measurement
says both cases are above 0, so the branch never splits.

Rather than reconstruct the distinction, the invariant is taken as the rule: **there is always
somewhere to go back to, so leaving an invite always rewinds.** The `replace` arm survives only as
the unreadable-index fallback.

### 4. A back press reports which branch it took

`overlay-closed`, `navigated`, `not-consumed`. The first two always existed; the third was an
unnamed early return, and naming it is the point. The shell swallows the hardware press before the
web sees it, so silence left it inferring whether the app had handled the press or had nothing to
do — and that inference is where the exit judgement goes wrong.

`not-consumed` is exactly `!hasBlockingOverlay && !canGoBackInApp()`, which is the negation of what
the shell report computes. Both live in this module so that one expression cannot disagree with
itself; a test walks all eight combinations to pin the pairing.

An overlay that refuses the press (`data-prevent-back-close`) still reports `overlay-closed`. The
name is about which branch ran: reporting it as unconsumed would tell the shell it may exit while a
dialog is on screen.

### 5. A route transition retires transient UI

`<SonnerToaster />` is mounted above `RouterProvider`, so no route change could reach the banner —
the symptom was structural, not a missed call. The route observer is already the one place that
sees every transition; it now calls registered listeners and still does not import `sonner`.
`ui/transientUi.ts` registers the one listener and owns what "transient" means.

POP retires (the reported symptom), PUSH and REPLACE onto a different pathname retire, REPLACE onto
the same pathname does not — a query being normalised is not a move, and dismissing there would eat
a banner raised moments earlier.

### Deliberately out of scope

The 115 ordinary call sites are untouched; only entry paths ask the module, and `'in-app'` exists so
that "no policy applies" is written down rather than missing. Tab-scoped stacks, deferred deep
links and push payload fields are all unchanged.

## Alternatives considered

**One class instead of six files.** A `NavigationManager` holding the rules was considered and
rejected on three grounds. Four of the six files are pure functions of their inputs with nothing to
remember, so the `this` would be empty — and the module already uses a class exactly where there is
state (`RouteStackTracker`). The two hooks cannot become methods: `useNavigate()` is React context,
so a class would have to be constructed inside a hook, leaving the hook in place and adding the
class beside it. And the split is load-bearing: the rule that only two files may touch the router is
enforced by a grep over the directory, which stops being possible once they are one file. The
dispersion the structure is accused of is what makes the boundary checkable, so the answer to
"too many files" was `index.ts`, not a merge.

**Preserving the screen the reader was on for a warm invite.** Specified originally, and dropped.
Measurement showed the previous screen is already gone: a deeplink arriving while a channel room is
open goes through the push path, where the room is the one disposable entry. Keeping the room would
mean special-casing the disposal rule for invites — carving an exception into the rule this work
exists to unify — and changing the redirect chain, which this change deliberately does not touch.

**Wiring `LoginPage` to the module.** Its home fallback passes
`{ transition: true, direction: 'back' }`, and the module carries no navigation options, so wiring
it as specified would silently drop the back-direction animation. Giving the module options would
hand them to the push path, which must not have them, and per-caller options would dissolve the
single answer the table exists to give. The part that mattered — the depth judgement — moved
anyway, so the remaining move would have cost user-visible behaviour to buy nothing.

**Keeping `window.history.length` and correcting for it.** Subtracting a baseline captured at boot
was considered. It fails on the case that motivated the work: the WebView can already hold entries
before the app loads, and a reload resets the baseline while the browser count keeps climbing.

## Consequences

The push path's behaviour is unchanged, and `useHandlePushNavigation.test.ts` passing untouched is
what says so. The invite exits change: cold and warm now both rewind onto home instead of replacing
with it, so the acceptance screen leaves the backward path. Login's fallback branch now fires on the
app's own depth, which on a long-lived WebView is the case it used to get wrong.

`window.history.length` survives in one place — the debug overlay displays it beside the app's real
depth, which is that row's entire purpose. Any future CI gate has to target judgement sites rather
than the string.

The shell contract is **not** part of this decision. `setCanGoBack` still reports dialog state only,
and the shell still ORs in the WebView's own history; making the web the single source of that
answer needs a version marker, because a cached old web bundle must not strand a new shell. The
reload reporting gap that marker has to survive was measured at **1213 ms** from navigation start on
a dev build, so it cannot be assumed away.

Two device checks are outstanding and named here so they are not mistaken for done: the invite
accept-then-back round trip needs a valid invite token, and the iOS swipe gesture was not measured —
`apps/mobile/ios/Pods` is not gitignored, so `pod install` would write into a path that work must
not touch.
