# Building a page with chatic-apps-sdk

A Chatic app is a web page that opens inside the DoU app, over everything else, at
`https://<name>.apps.chatic.io`. You build it like any web page, and `@lemoncloud/chatic-apps-sdk`
connects it to the app: closing, the title, haptics, sharing, saving data on the device, and more.
This guide is how to set a project up and what comes out of it. The library's calls, limits and error
codes are in the package `README.md`; this guide does not repeat them.

## What you are building

- **Static files.** The app loads your page from a web address like any browser. There is no server
  of yours to run for the page itself, and no server-side rendering.
- **One page, entered at the root.** The app always opens `/`. A link carries data in its query
  (`/?level=3`), never in a path, so a page does not route on the path.
- **In the phone's own web view.** The page runs in WKWebView on iOS and the Android System WebView
  on Android, so it can use what those engines support. Check the oldest phones you mean to support.
- **Also in a browser, while you build.** The library falls back to what a browser can do, and ships a
  stand-in for the app, so you can write and try the page without a phone.

## Choose a toolchain

The library has no runtime dependencies and no opinion about the rest, so use what you know. Three
shapes work, from least to most tooling:

| Shape                           | Use it when                                   | The library comes from                               |
| ------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| One `index.html`, no build      | A small page, a prototype                     | A `<script>` tag that defines `window.ChaticAppsSDK` |
| Vite and plain TypeScript or JS | A page of its own with a few screens of logic | `npm install`                                        |
| Vite and React, Vue or Svelte   | You already build interfaces in one of these  | `npm install`                                        |

Anything that ends in static files is fine, with these limits:

- **No server rendering and no server routing.** A framework's static or single-page mode, not its
  server mode. Next.js needs `output: 'export'`, Nuxt needs `ssr: false` or `nuxt generate`, and
  SvelteKit needs the static adapter in single-page mode.
- **Do not depend on a path.** A client-side router must work with the page entered at `/`, and must
  not be needed to reach a shared link: put what a link carries in the query.
- **Do not depend on `window.opener`, popups or file downloads.** A popup opens in the same view and
  replaces the page, so a login that answers through `window.opener` cannot work, and a download is not
  handled on iOS; the package `README.md` says what to do instead.

Vite is the shortest road, and the rest of this guide uses it.

## Set up a project

```bash
npm create vite@latest quiz -- --template vanilla-ts
cd quiz
npm install @lemoncloud/chatic-apps-sdk
```

Pick `react-ts`, `vue-ts` or `svelte-ts` for the template instead if you want one; nothing below
depends on it. Replace `src/main.ts` with a page that connects:

```ts
import { connect, ChaticAppsError } from '@lemoncloud/chatic-apps-sdk';
import { installChaticAppsMock } from '@lemoncloud/chatic-apps-sdk/mock';

// A stand-in for the app in the browser, in development only. Vite removes a branch that is always
// false, so it is not in the production bundle. The controller lets you play the user's side.
if (import.meta.env.DEV) {
    const app = installChaticAppsMock({ permissions: ['share', 'userKey'] });
    Object.assign(window, { app }); // then `app.pressBack()` in the browser console
}

async function start() {
    try {
        const apps = await connect();
        document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
        apps.onContextChange(context => (document.documentElement.dataset.theme = context.theme));
    } catch (error) {
        // `UNSUPPORTED_PROTOCOL` means the app is newer than this library: update the library.
        const needsUpdate = error instanceof ChaticAppsError && error.code === 'UNSUPPORTED_PROTOCOL';
        document.body.textContent = needsUpdate ? 'This page needs an update.' : 'This page could not start.';
    }
}

void start();
```

Then:

```bash
npm run dev      # the page in your browser, with the stand-in for the app
npm run build    # the bundle, in dist/
```

With React, Vue or Svelte, put the same lines where the application starts, before it renders.

### Developing in a browser

`installChaticAppsMock` turns the tab into a fake app: it answers as the app does, logs every call, and
lets you play the user's side through the controller it returns — the Android back button, a close
request, a theme change (the example above puts it on `window`, so the browser console can reach it). It grants only the permissions you list, as the app grants only what the page's manifest holds.
It proves the page's logic and nothing about a phone: layout, the keyboard, the safe area and real
haptics need the app.

## The bundle

What you hand over is a folder of static files. With Vite, that is `dist/`:

```text
dist/
├── index.html
├── assets/
│   ├── index-3fa1c9.js
│   └── index-81b2d0.css
└── .well-known/
    └── chatic-app.json
```

- **`index.html` is at the top of the folder.** It is what `/` serves.
- **Assets are named by root-relative address** (`/assets/…`), which Vite does by default. The page is
  always served from the root of its own address, so do not set a `base` path.
- **`.well-known/chatic-app.json` is the page's manifest.** The app reads it before it shows the page.
  In Vite, put the file at `public/.well-known/chatic-app.json` and the build copies it as it is.
- **Nothing else is needed**: no server code, no `package.json`, no source files. Without a build, the
  same layout holds: `index.html` and a `.well-known/chatic-app.json` beside it.

The manifest names the page and asks for what it needs:

```json
{
    "manifestVersion": 1,
    "name": "Quiz",
    "permissions": ["share", "userKey"],
    "orientation": "portrait"
}
```

A page has no bar by default: a small close button floats in the top-right corner, always, and the page
draws its own header. Add `"display": "standard"` to get the app's bar with the page's title and a
close button instead.

`manifestVersion` must be `1`; the app ignores a manifest it cannot read. Ask only for the permissions
the page uses — `clipboard`, `share`, `openUrl`, `userKey` — and see the
package `README.md` for what each one unlocks and for `display` and `orientation`. Without a manifest a
page still runs; it gets everything but those four.

## How the page behaves in the app

These are the facts that most often surprise a page written first for a browser. The package `README.md`
has the detail on each.

- **The app can close the page at any time.** Save as you go, and when `document` turns `hidden`.
  Keep the page's own data in `apps.storage`, not `localStorage`, which goes when the system clears
  website data. What must follow the user to another phone goes on your own server, under
  `apps.getUserKey()`.
- **The page lies inside the safe area on every edge.** There are no insets to handle.
- **Dark mode follows the app's theme**, from `apps.context.theme`, not the phone's.
- **Share `apps.link({ … })`**, not the page's address, and read what a link carries from
  `location.search` when the page starts.
- **There is no title bar** unless the manifest asks for one, so the page draws its own header and title.
  See [Screens and Back](#screens-and-back).
- **Android back** is yours only while you set `apps.onBack(handler)`; otherwise the app decides.
- **Errors**: every call can throw `ChaticAppsError`; branch on its `code`, never its `message`.

## Screens and Back

A page with more than one screen — a menu, a game, a settings page — needs its own way back. There is
no bar and no back arrow to lean on: the only control the app gives is the small close button at the
top-right corner, which leaves the page. Android has a back key; iOS has none. So the page keeps a
stack of its screens, draws its own back button, and takes the Android back key only while there is a
screen to go back to:

```ts
const screens = ['home'];

// Take Android back while a screen is stacked; give it back at the root, where the app closes the page.
const sync = () => apps.onBack(screens.length > 1 ? back : null);

function open(name: string) {
    screens.push(name);
    sync();
    render();
}

function back() {
    if (screens.length > 1) screens.pop();
    sync();
    render();
}

sync();
```

Draw a back button in your header whenever `screens.length > 1` and have it call `back()`; at the root
draw none, since the close button is already there. In React, Vue or Svelte keep `screens` in state and
call `apps.onBack` from an effect that runs when its length changes. The same pattern closes a dialog:
treat an open dialog as a screen.

Three things to leave alone: do not set a handler at the root, so Android back still closes the page;
do not use `onCloseRequest` for navigation — it is for unsaved work; and keep the screens in memory, not
in the browser's history. A router that pushes entries (hash routes, `pushState`) gives the page a history,
and with a history Android back at the root walks it instead of closing the page. On iOS the edge swipe
only walks that history, so an in-memory stack needs the back button above either way.

Keep the top-right corner of every screen clear of your own controls: the close button floats there.

## For an AI assistant in your project

The package ships `AGENTS.md`: rules for an assistant writing a Chatic app. Assistants read an
`AGENTS.md` at the top of the project, not one inside `node_modules`, so copy it there, or point your
assistant at `node_modules/@lemoncloud/chatic-apps-sdk/AGENTS.md`.

## Before you hand it over

- [ ] `npm run build` produces `dist/` with `index.html` and `.well-known/chatic-app.json` at its top.
- [ ] Opened from a plain file server, the built page works at the root, with no path in the address.
- [ ] The page works in a browser with no app (`apps.inApp` is `false`) and with the stand-in.
- [ ] Every permission in the manifest is used, and every call that needs one is guarded with
      `apps.supports(…)` or handles `NOT_SUPPORTED`.
- [ ] State is saved as the user goes, not only at a button.
- [ ] No `window.opener`, popup login, file download or server-side rendering.
- [ ] No user data in errors, in `reportError` or in the page's own logs.

## Deploying

How a page is submitted, reviewed and deployed to its address is not part of this guide yet.
