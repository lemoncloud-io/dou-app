# tooling

How the page is built (`vite.config.mts`, `tailwind.config.js`, `src/styles.css`, which imports the
desktop tokens from `libs/design-system/tokens/desktop`), and which parts
exist only in a development build. The reasons below are the ones a change to the config would trip
over.

## Vite

- **One copy of React.** React, React DOM and the JSX runtime are both pre-bundled once and
  de-duplicated, because the lazy route chunks (settings, profile, debug) must never receive a second
  React instance: the mismatch surfaces as "Invalid hook call … more than one copy of React" inside Radix
  components, and in dev the optimizer can hand a lazy chunk a second one unless every `react` and
  `react-dom` specifier, including those inside pre-bundled dependencies, resolves to the single root
  copy.
- **No manual vendor chunks.** Forcing React 19's CommonJS build into a chunk of its own, under the
  CommonJS plugin's strict-require mode, breaks the module's initialisation (`Cannot set properties of
undefined`) and leaves a white screen in the production build only. Rollup chunks automatically; the
  lazy route splits keep the entry bundle small.
- **pdf.js data files are served by the page** at `/pdfjs/<dir>/` (dev server) and emitted there (build):
  the CMaps and standard fonts a PDF may name without embedding, which is common in Korean files, the
  colour profiles and the image-decoder wasm. Without them such a PDF draws without its text or images.
  The script-engine wasm is left out, since the viewer never runs a PDF's scripts. The dev server
  answers only an exact match against the list of served files, so no request path can reach outside
  those folders.
- **Shared root icons** (favicon, touch icons, web manifest) come from the repo's shared public folder,
  served in dev and copied into the build, as `apps/web` does. Without it every boot would 404 on
  `/favicon.ico` and the deployed app would have no manifest or touch icons. The dev middleware serves
  only files that stay inside that folder, because joining a crafted URL normalises `..` segments.

## Tailwind

- **The libraries that ship markup are named in `content`** (UI kit, block kit,
  `@chatic/design-system-components-desktop`). `createGlobPatternsForDependencies` reads
  the Nx project graph and returns nothing when Vite runs without one (plain `vite` or `vite build`).
  That left every class only the UI kit uses ungenerated: menus drew transparent and dialogs landed
  off-screen.
- **One stacking scale** (`raised`, `float`, `overlay`, `drawer`, `toast`, `popover`, `alert`) is the
  app's own layering; the kit's dialogs and menus sit at 50, so everything here stays at or below
  that, except `alert`. A new name also has to go into the `z` group of the UI kit's `cn`, or it will
  not override a kit class. What each level is for is in [shell layering](../shell/layering.md).

## Fonts

Pretendard is declared in `styles.css`, not pulled in by an `@import` of the upstream stylesheet (the
local token `@import` is inlined at build time and costs nothing): an
`@import` holds the first paint until that request returns, and on a slow network that left the first
window blank. Each face paints with the fallback while its file is on the way (`font-display: swap`)
and downloads only when text needs it. Only the weights the UI uses are declared, and they point at the
full files, not the Unicode-range subset: the subset has no U+200B glyph, which the composer's editor
inserts while an IME composes, and without it the caret lands inside the composing syllable.
`fontLoading.spec.ts` pins all of it.

## Development-only surfaces

These are in the source but not in what ships.

- **The development sign-in** and its `/auth/debug` route are behind `import.meta.env.DEV` and are
  removed from a production build ([auth](../auth/README.md#the-auth-card-and-the-development-sign-in)).
  The Debug panel's account switcher is tree-shaken the same way, so it never appears in the installed
  app even when debug mode is on.
- **The Debug panel** docks into the same trailing-panel slot as the profile and thread panes. In the
  same window it shares every store and the IndexedDB cache, so it shows the live app state while the
  reader keeps chatting; on a wide window it sits in the flow and the chat pane shrinks beside it, below
  that it overlays (see [trailing panels](../shell/trailing-panels.md)). Its **Clouds** tab shows every
  source the cloud switcher builds a row from (the relay catalog, the local cache whose name wins, the
  invite-joined clouds, the rail entries) raw, so an untitled or suspended row is diagnosed by finding
  which source it came from, and one copy action carries all of them for a report from another machine.
- **Custom web bundle (desktop shell only).** The Debug panel can swap the whole UI for a downloaded ZIP.
  Applying reloads the window into the bundle, so the panel disappears with it; the way back is the
  shell's own "Reset custom UI" in its menu bar and tray, which live in the main process and survive
  whatever the bundle does. A button inside the bundle would not. A production shell does not take
  bundles, and the panel hides Apply there. A failed read of the status is shown, not swallowed:
  an unhandled rejection would leave the status empty, which renders as "inactive", a confident answer
  the panel does not have.
