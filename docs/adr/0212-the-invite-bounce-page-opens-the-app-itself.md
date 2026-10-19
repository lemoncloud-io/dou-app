# ADR-0212: The invite bounce page opens the app itself

> Status: Accepted · Decided: 2026-10-19 · Implemented: `fix/landing-invite-app-launch`
> · Scope: `apps/landing/src/app/routes/CommonRoutes.tsx` · `apps/landing/src/app/features/deeplink/**`
> · Related: [ADR-0107](./0107-encoded-invite-link-one-decoder-and-a-separate-entry-path.md) — the
> `/i` link format and its decoder
> · The module doc is [`apps/landing` scenario 3](../../apps/landing/README.md#3-the-same-link-opened-in-a-browser)

## Context

An invite link tapped in a text message opened the app on both iOS and Android. The same link
tapped in KakaoTalk, or opened in Chrome, showed the landing site instead. The association files
were not at fault: both domains serve them correctly, and Apple's CDN and Google's Digital Asset
Links API both return them.

The difference is who handles the tap. A messaging app hands the URL to the OS, and the OS resolves
the Universal Link or App Link. An in-app browser (KakaoTalk, Naver, Instagram, Facebook, Line)
loads the URL itself. So does a browser given a URL that was typed or pasted into it, or handed to
it explicitly by another app ("open in Chrome"). In those cases no association is consulted, and
the landing page is all the user gets, even with the app installed. Nothing on the server or in the
app can change that; it is how both platforms define the handoff.

The landing page then failed in two ways:

- **`/i` was not routed.** ADR-0107 taught landing's redirect hook to read `/i?t=…`, but
  `CommonRoutes` only sent `s/*` to the bounce page. An `/i` link fell to the catch-all, which
  redirects to `/` and drops the token, so the invitee saw the marketing page with no way into the
  invite. Reproduced on the deployed dev site, in a desktop browser and in Chrome on an Android
  emulator.
- **The bounce page waited for two taps** ("Open app", then a confirm dialog) before trying the app.
  From an in-app browser that is the only route into the app, and nothing on the page says so.

## Decision

1. **`i/*` routes to the bounce page**, beside `s/*`.
2. **The bounce page tries the app on load** for a link the app can read (`/i?t=…`, `/s?code=…`):
    - **Android: always**, with an `intent://` URL whose `browser_fallback_url` is the same page with
      `#app-missing` appended. A phone without the app comes back marked, does not try again, and is
      offered the store, with the web as the other choice.
    - **iOS: only inside an in-app browser**, matched by user agent, with the custom scheme.
3. **The store dialog appears only when the app is missing**, decided per path:
    - An automatic Android launch offers the store only once the `#app-missing` marker has arrived.
      A page still showing without it can mean the browser declined to open the app, and someone who
      has the app should then get the buttons, not an install prompt.
    - On iOS, and for a tapped launch, the page still being in the foreground after 2.5 s is the
      signal.
    - On every path, a page that went to the background handed the user to the app, so it offers
      nothing.
4. **A tapped launch on Android keeps the Play Store as its fallback**, because the tap already
   asked for the app.

## Alternatives

- **Auto-launch on iOS everywhere, Safari and Chrome included.** That would also cover the Chrome
  case on iOS. But both browsers answer a custom scheme the device cannot open with an "invalid
  address" alert, and invitees are often people without the app yet, so every first visit would
  start with an error. Rejected; iOS outside an in-app browser stays one tap away.
- **Escape KakaoTalk with its own scheme** (`kakaotalk://web/openExternal`), so the system browser
  takes the link. The system browser does not hand the link to the app either, so this only moves
  the problem by one hop, and it is specific to one host app. Rejected.
- **Use the Play Store as the automatic launch's fallback too.** It sends an invitee without the
  app to the store without asking and takes away the web option. Rejected.
- **Leave the page alone and only add the route.** That fixes the dead end for `/i`, but leaves
  every in-app-browser invitee two taps and a dialog away from an app they already have. Rejected.

## Consequences

- **The in-app browser list is a user-agent pattern** (`utils/appLaunch.ts`) and has to be kept up
  to date. A host app that is missing from it falls back to the button; nothing breaks.
- **An Android phone without the app loads or hash-navigates the page once more** on the way back
  from the intent fallback.
- **Safari and Chrome users on iOS who have the app still tap once**, as before.
- **Not verified on a device:** KakaoTalk on Android or iOS. On the Android emulator, Chrome opened
  the app from a page load with the token intact, and the no-app fallback came back as a
  same-document `#app-missing` navigation. Whether KakaoTalk's WebView honours
  `browser_fallback_url`, or opens the Play Store by package instead, has to be checked on a phone
  with KakaoTalk and without the app.
- **No app release.** The app has read `chatic://i?t=…` and `chatic://s?code=…` since the ADR-0107
  change; this ships with a landing deploy.
