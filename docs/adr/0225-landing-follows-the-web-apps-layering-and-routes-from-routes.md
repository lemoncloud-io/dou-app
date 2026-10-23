# ADR-0225: Landing follows the web app's layering and routes from `ROUTES`

> Status: Accepted · Decided: 2026-10-23 · Implemented: `refactor/landing-structure`
> · Scope: `apps/landing/src/app` (`app.tsx`, `routes/`, `config/`, `features/`) · `apps/landing/tsconfig*.json`
> · `.github/workflows/verify.yml` (the landing exclusions)
> · Builds on [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) (feature ownership, barrels)
> · The module doc is [the landing README](../../apps/landing/README.md#layering)

## Context

`apps/landing` serves `app.chatic.io`: the marketing home page, the three policy pages and the
`/s` · `/i` invite bounce page. It grew one file at a time, and by October 2026 its structure was
its own, written down nowhere:

- an `app/shared/` folder of eight files: two barrels, four components used only by the home
  page, and `Toast` and `useToast`, used by nothing;
- the bounce page importing the home page's store URLs, so one feature reached into another;
- the stage (dev or prod) read from `import.meta.env.DEV` and the hostname inside the bounce
  page's constants file;
- absolute paths typed as strings in five files;
- the theme provider assembled in `main.tsx`;
- no `errorElement` anywhere, so a route that threw showed the router's built-in developer screen;
- every feature in the entry chunk, the full legal text of three policies included;
- a typecheck that was red — 32 errors — and that CI did not run, together with the
  app's tests.

A feature added on top of this would have its layout invented as it went, and a third convention
would sit beside the web app's and this one.

The repo has exactly one written structure for a React app: `apps/web/docs/README.md`, the web app's
layering contract, with ADR-0046 behind it. `desktop-web` and `admin-v2` each have a shape, but no
document says what it is or why.

## Decision

1. **Landing adopts the web app's layering contract instead of writing its own.** Features do not
   import each other, the app level (`app/config`, `app/ui`, `app/hooks`, `app/utils`) imports no
   feature, there is no `shared/` wrapper folder, and a file moves up on its second consumer. The
   landing README says what the contract comes to in this app and points at the web document for
   the rest; it does not restate it.
2. **Absolute paths come from `ROUTES`** in `app/routes/paths.ts`. The route table keeps its own
   patterns (`policy/*`), as the web app's does.
3. **One router, built in `routes/index.tsx`**: the features' routes, then a catch-all to `/`, with
   the same `errorElement` on every top-level route. The policy pages load lazily; home and the
   bounce page stay in the entry chunk, the bounce page because it tries the app as soon as it
   mounts.
4. **`app.tsx` assembles the providers**; `main.tsx` initialises i18n and renders `<App />`.
5. **`app/config/stage.ts` is the only module that reads `import.meta` or the hostname**, and no
   barrel re-exports it. `app/config/links.ts` is the site's one list of outside addresses: it moved
   up because the store listings have two consumers, and the web app's origin and the support address
   came with it.
6. **Feature constants live in `consts/`**, the web app's name for the folder.
7. **A test fails when a copy key exists in one language and not the other**, for every `ko` / `en`
   pair under `src/i18n/locales/`.
8. **CI typechecks and tests landing.** The 32 errors are fixed rather than suppressed — the global
   `JSX` namespace React 19 removed is imported from `react`, the unused `Toast` is deleted, the
   locale JSON is included — and a spec tsconfig puts the test files under the typecheck too.
9. **The boundaries are checked by grep, as the web app checks its own.** The commands are in
   the landing README; each prints nothing when its rule holds.

The change keeps every URL, redirect — including that an unknown path is pushed onto history rather
than replaced — screen, and existing copy key and value. What changes is when code loads and what a route that
throws shows (see Consequences) — the one addition to the copy is that screen's four keys. A table of every URL and where it ends up is a test now, and screenshots of each URL before
and after were compared pixel by pixel.

Three things stay different from the web app on purpose. The copy is bundled rather than fetched,
because a crawler and a first-time visitor need it with the page. The route error screen is
landing's own, because the shared one is built from UI-kit components whose design tokens this
site's Tailwind config does not have; it looks its copy up under `error.screen.*` with English as
the default, the same rule the shared screens follow, and its four keys carry the web app's values
in both locale files. And there is no `docs/feature/` tree: the README is this app's documentation.

## Alternatives

- **Write down landing's existing shape as its own convention.** Cheapest today, and it leaves two
  conventions that disagree on where a shared component goes (`shared/` here, promoted to `app/ui`
  there). Every contributor moving between the apps would have to know which one they are in.
- **Follow `desktop-web` or `admin-v2`.** Neither has written rules, so "follow" would mean copying
  whatever their trees happen to look like now.
- **Use the shared `RouterErrorFallback`.** It needs the shadcn tokens (`primary`, `ring`, `input`, …)
  defined in landing's Tailwind config. Adding them for one error screen would bring in a second
  token vocabulary the rest of the site does not use.
- **Check the boundaries with an ESLint rule** (`no-restricted-imports` per folder, or Nx module
  boundaries with tags). The web app checks the same rules by grep, and a lint rule for one app's
  internal folders would make the two apps' checks differ in kind. A grep has a trap of its own:
  given a pathspec with a trailing glob it matches no file and passes whatever the code imports.
  The README spells out the form that works.
- **Load the bounce page lazily too.** It would take 13.7 kB (4.7 kB gzipped) out of the entry chunk,
  and it would put a chunk fetch between an invitee's tap and the automatic app launch: a later
  launch on a slow in-app browser, and a failed fetch landing on the error screen instead of the
  invite. The web app keeps its invite entry screen out of lazy loading for the same reason.
- **Make the catch-all redirect `replace` while touching it.** It would stop an unknown path from
  leaving a history entry that redirects again on back, and it is a behaviour change. It is left for
  a change that is about behaviour.
- **Keep `Toast` and `useToast` for a later screen.** Nothing has used them; git keeps them.

## Consequences

- **CI now fails on a landing type error or a failing landing test.** The `JSX` annotation is the
  one most likely to come back: `: JSX.Element` without the import is TS2503 again.
- **A policy page makes one more request**: its 48 kB (12.2 kB gzipped) of legal text loads on its
  own, and the entry chunk no longer carries it. If that chunk fails to load, the reader lands on
  the error screen instead of the router's developer screen. The bounce page and home load exactly
  as before.
- **A new landing feature has a known shape**: an `index.ts` exporting `<Name>Routes`, an entry in
  `CommonRoutes.tsx` (lazy unless something is timed against its mount), a row in the URL table
  test, its paths in `ROUTES`, and its name added to the cross-feature grep, whose feature list is
  typed out and has to be kept current.
