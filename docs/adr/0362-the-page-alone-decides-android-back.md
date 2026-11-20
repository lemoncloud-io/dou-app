# ADR-0362: The page alone decides Android back

> Status: Accepted · Decided: 2026-11-20 · Implemented: `fix/android-back-after-qr-login`
> · Scope: `apps/web` (`navigation/useStackBack`, `hooks/useBackHandler`, `bridge/appBridge`),
> `apps/mobile` (`webview/hooks/useWebViewNavigation`, `MainScreen`), `libs/bridge-messages`
> (`SetCanGoBackPayload.includesHistory`), `libs/bridges` (`BRIDGE_VERSION` 2.34.0)
> · The behaviour is documented in [apps/mobile docs/webview § Android back](../../apps/mobile/docs/webview/README.md#android-back)
> and [apps/web docs/shell/routing.md](../../apps/web/docs/shell/routing.md)
> · Amends: [ADR-0108](./0108-one-module-owns-the-history-stack-and-depth-is-the-routers-index.md),
> which left the shell contract out of its scope

## Context

An Android back press reaches the page only if the shell decides it is the page's. The shell decided
with `webCanGoBack || navCanGoBack`: the first half was the page's `SetCanGoBack`, which reported only
whether an overlay was open, and the second was the WebView's own `canGoBack` from
`onNavigationStateChange`. The page, for its part, already judged every press it received by its
router's index (ADR-0108) and dropped one it could not spend (`not-consumed`).

ADR-0108 named the gap between those two answers and deferred it: making the page the single source
"needs a version marker, because a cached old web bundle must not strand a new shell", and a reload
leaves the shell without a report for about 1.2 s.

The gap showed up as a bug report: after signing in with a code from another device, back did nothing.
The pairing screen ends with `navigate(-2)`, which leaves the router on its first entry. Whenever the
WebView's `canGoBack` still read true there, the shell sent the press, the page had nothing to rewind,
and the press was lost. On an API 36 emulator the WebView's value was wrong the other way round: it
stayed false on every screen the router pushed, so back showed the exit toast from a pushed screen
instead of returning. Either way, the WebView's history does not follow the router's pushState entries
— `react-native-webview` reads `canGoBack()` as Android reports the history update.

## Decision

1. **The page reports its whole answer.** `SetCanGoBack.canGoBack` is `backIsTheAppsToSpend` — an
   overlay is open, or `canGoBackInApp()` — the exact negation of `useStackBack`'s `not-consumed`,
   reported on every location change, dialog change, and at once after a rewind the page takes.
2. **The report carries its own marker.** `includesHistory: true` says the answer covers history. A
   shell decides from a marked report alone and ignores the WebView's `canGoBack`; an unmarked report
   (a page before bridge 2.34.0) keeps the old `||`. Each report replaces the last, so a reload into an
   older bundle falls back by itself.
3. **A page that goes away takes its report with it.** When a new document starts loading, or an
   error view replaces the WebView, the shell drops the last report and the WebView's history decides
   until a page reports again, as it would for a page that never reports.
4. **A showing sub WebView arms the press on its own.** Its back listener runs in React Native, which
   Android reaches only while the press is armed; the main page underneath may be on its first screen
   and answer false, and that answer must not send a press over a mini app to the app's exit.

## Alternatives

- **Gate on the page's bridge version instead of a field.** The shell would have to learn the version
  from the handshake and keep it across reloads; a field on the report it is about cannot disagree
  with that report.
- **Answer `OnBackPressed` with the outcome, and exit on `not-consumed`.** It keeps two judges and adds
  a round trip to every press, and an older page never answers, so the shell would need a timeout
  before it could exit.
- **Nudge the WebView into reporting again** (a same-URL `replaceState` after each move). It works
  around one WebView behaviour that already differs between builds, and still leaves the shell
  combining two answers.
- **Fix it in the web only.** The page reporting history helps current shells on pushed screens, but a
  current shell still adds the WebView's `true` on the first screen — the reported bug — so the shell
  has to change too.

## Consequences

- **The reported bug needs an app update.** A shell from before this change still ORs the WebView's
  history into the page's new answer. Pushed screens already go back with it — the page now reports
  them — but a press on the first screen while the WebView reads true is still dropped there.
- **A dialog that refuses back still holds it**, unchanged: an open overlay is the page's to spend.
- **iOS is unaffected.** Its shell runs the same hook, but nothing there reads the answer; back is the
  WebView's own swipe.
- **During a reload the old behaviour returns for about a second**, which is no worse than before this
  change, and it is the window ADR-0108 measured.
