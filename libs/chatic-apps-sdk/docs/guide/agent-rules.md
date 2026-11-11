# Rules for an AI assistant writing a Chatic app

You are writing a web page that opens inside the DoU app, at `https://<name>.apps.chatic.io`, using
`@lemoncloud/chatic-apps-sdk`. Follow these rules. `GUIDE.md` in this package says how to set the
project up and what the bundle looks like; `README.md` is the reference for every call, limit and error
code. Read the part you need before you write code that depends on it.

## The project

1. **Static files only.** The output is a folder with `index.html` at its top and
   `.well-known/chatic-app.json` beside it. No server code, no server-side rendering, no server routing.
   With Vite, put the manifest at `public/.well-known/chatic-app.json`.
2. **The page is always entered at `/`.** Do not route on the path and do not set a `base`. A shared
   link carries its data in the query: read it from `location.search` when the page starts.
3. **Install the mock in development only**, before `connect()`:
   `if (import.meta.env.DEV) installChaticAppsMock({ permissions: [...] })`, imported from
   `@lemoncloud/chatic-apps-sdk/mock`.

## The calls

4. Use `@lemoncloud/chatic-apps-sdk`. Call `await connect()` once at start, inside `try/catch`.
5. Check `apps.inApp` and `apps.supports(capability)` before offering an app feature; never compare
   version numbers.
6. Every call can throw `ChaticAppsError`; branch on `error.code` only, never on `error.message`.
7. Take the theme and language from `apps.context` and `apps.onContextChange`, not from the OS.
8. Share links built with `apps.link({ ... })`, never the page's own address.
9. Keep the page's state in `apps.storage` as it changes, and at the latest on `visibilitychange` to
   `hidden`; never in `localStorage`. What must follow the user to another phone goes on your own server
   under `apps.getUserKey()`.
10. For screens and dialogs inside the page, keep a stack: while it holds more than one screen,
    `apps.onBack(back)`; at the root, `apps.onBack(null)`, so Android back closes the page. iOS has no
    back key, so draw a back button that calls the same `back()` whenever there is a screen to go back to.
    Keep the stack in memory: a router that pushes browser history (hash routes, `pushState`) makes
    Android back at the root walk that history instead of closing the page.
11. Use `apps.onCloseRequest` only to protect unsaved work; return `true` to close.
12. For the camera or microphone, call `apps.permissions.request(kind)` when the user reaches for the
    feature, never at start, then `getUserMedia`. No manifest permission is needed. Do not time the
    request out, and send `'blocked'` to `apps.openSettings()`. Treat the request's answer, not
    `query`'s, as the truth: on Android `query` can read `'prompt'` for a blocked permission.

## The page

13. No `window.opener`, no popup logins, no file downloads.
14. Never put the user's data in errors or in `reportError`.
15. List the permissions the page needs (`clipboard`, `share`, `openUrl`, `userKey`) in
    `/.well-known/chatic-app.json` — and nothing it does not use. A call that needs one fails with
    `NOT_SUPPORTED` without it.
16. Do not draw for the safe area: the page already lies inside it on every edge.
17. The page has no title bar unless the manifest sets `"display": "standard"`: draw your own header and
    title, and keep the top-right corner clear, where the app's close button floats.

## Before you say it is done

Run the build, and check that `dist/index.html` and `dist/.well-known/chatic-app.json` exist. Say what
you could not check: a browser with the mock proves a page's logic and nothing about a phone — layout,
the keyboard and real haptics need the app.
