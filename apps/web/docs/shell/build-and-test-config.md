# build and test config — the traps behind the web's config files

Short notes on `jest.config.js`, `jest.setup.ts`, `tailwind.config.js`, `vite.config.mts`, the font setup
and the translation cache. Each item is something that fails quietly if undone.

## Jest

- **Mapper order matters.** The generic `^@chatic/(.*)$` rule maps to `libs/$1/src/index.ts`, so it
  captures a subpath like `config/react` and points at a file that does not exist (the real entry is
  `libs/config/src/react/index.ts`). Subpath entries therefore come first: `@chatic/ui-kit/*`,
  `@chatic/config/*`, `@chatic/shared/phone` (kept out of the root barrel because of libphonenumber's
  metadata) and `@chatic/runtime/testing` (the runtime's test fake, kept out of its barrel). The same
  trap bit `libs/config`'s own Jest config.
- **`@chatic/assets` lives at the repository root**, so the greedy fallback would resolve it to a
  `libs/assets/` that does not exist. It is stubbed with a recursive `Proxy` (`__mocks__/assetsMock.js`)
  rather than a fixed object: the module's exported maps grow over time, tests only pass these values to
  `src`/`href`, and any nested property answers with the stub, which also coerces to a usable string.
  The web ui-kit re-exports SVG and image assets from its barrel, so images and styles are stubbed too.
- **`uuid` is ESM-only.** The runtime's session hooks pull it in through `useDynamicDeviceId`, so it is in
  the `transformIgnorePatterns` exception list and transformed rather than required as CommonJS.
- **jsdom has no layout engine and no `ResizeObserver`.** The overlay-chrome layouts
  (`KeyboardAwareLayout` through `useChromeInsets`) construct one on mount, so `jest.setup.ts` installs a
  no-op stub. Heights simply stay at their initial 0, which no test asserts on. Tests that depend on
  geometry stub it themselves.
- Some modules read `import.meta`, which the CommonJS test transform cannot parse; they are kept in
  leaf files tests replace (`viteEnv.ts`, `utils/buildEnv.ts`) and imported by concrete path rather than
  through a barrel that would drag them in.

## Tailwind

- **The app column is a token, not a width.** `max-w-app` is `var(--app-width, 600px)`. The app fills a
  phone and stops there; on anything wider (an unfolded foldable, a tablet, a desktop browser opening an
  invite link) the column centres with a margin either side instead of stretching a phone layout. Pair it
  with `w-full` and `mx-auto`.
- **`max-w-reading` (30rem) bounds read-only prose** such as onboarding copy, terms and guidance paragraphs.
  It is not a layout width: the column still fills the device. Past roughly 40 Korean characters a line
  is scanned rather than read, and the column is now wide enough to cross that on its own. Form fields
  and actions do not use it.
- **`primary-ink` is the text form of the brand colour.** `--primary` is a lime surface fill and is
  illegible as text on white, so mentions and links in the shared message renderer resolve to
  `primary-ink` and `link` instead. They are separate tokens so each app can give links their own hue.
- **The block-kit type scale reuses desktop's names.** The shared renderer asks for names like
  `text-body`, and each app answers with its own value. Body is 16px here because that is what a message
  bubble already uses; copying desktop's 15px would make block text smaller than the text beside it. Only
  the steps the renderer uses are defined.
- **The snackbar keyframes** slide from the toast's own height plus `--snackbar-offset`, so it enters and
  leaves from fully below the screen edge. The exit starts from where a swipe let go
  (`--radix-toast-swipe-end-y`, unset on a timed close) so a swiped toast keeps moving down instead of
  jumping back up first.
- Content globs name the shared libs outright. `createGlobPatternsForDependencies` reads the Nx project
  graph and returns an empty list when Vite runs without one, and the block-kit card's type sizes are
  classes only that lib writes, so a missed scan would draw every card at inherited sizes.

## Vite

- **pdf.js data files** (CMaps, standard fonts, ICC profiles and the image-decoder wasm) are served at
  `/pdfjs/<dir>/` in dev and emitted there in a build. Without them a PDF that names fonts without
  embedding them (common in Korean files) draws without its text or images. Only an exact match against
  the known file list is answered, so no requested path can reach outside those folders. The script-engine
  wasm is left out; the viewer never runs a PDF's scripts.
- **Source maps** are `hidden` for a production build and public otherwise, so no bundle points at a file
  that is not served. Deploy excludes `*.map` and CI archives them, which is what makes this safe.
- **The translation version is the build time.** `process.env.I18N_VERSION` is `Date.now()` in a build and
  `dev-<time>` in the dev server. A fixed dev key would keep stale locale JSON alive after a new key is
  added; a fresh namespace per dev-server process makes the browser fetch it again without anyone clearing
  site data.

## Fonts

Pretendard is named first in the font stack for a device that has it installed, and no remote stylesheet
is `@import`ed for it. Google Fonts does not serve that family, so the request answered 400 on every boot,
the failure was logged as a resource error, and the `@import` held the first paint until the refusal
came back. `fontLoading.test.ts` reads `styles.css` and `index.html` to keep both out.

## Translations

- The translation cache lives in the `device` store (not whichever web storage the plugin would pick),
  keyed by the build version, and expires after 5 minutes in development and an hour in production.
- **A locale key missing from `en` is worse than one missing from `ko`.** `fallbackLng` is `en`, so a
  missing `ko` key quietly falls back to English, while a missing `en` key has nowhere to fall back to
  and i18next renders the key itself. That shipped once: a key that existed only in `ko` made a confirm
  button read as its raw dotted name, and because that is one long unbroken token it also pushed the
  dialog's two-button row past its edge and cut the label off. No compiler or lint rule can see it, since
  `t('some.key')` is just a string.
  `localeParity.test.ts` therefore requires the same keys in both files, reports sorted lists so a failure
  names the missing paths, and refuses empty strings, which look the same as a missing label.
