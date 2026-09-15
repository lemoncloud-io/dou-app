# directory-structure — where a new file goes

The [app README](../../README.md) has the full `src/` tree with file counts, and
[`README.md`](./README.md) in this folder has the layering diagram and the "features do not import
each other" rule. This document is neither of those. It answers the question both leave open: given
a new file, which directory does it land in, and what has to be true before it moves to a shared
one.

## Placement decision tree

1. **Bootstrap, platform connection, or routing?** (session/socket lifecycle, the native bridge,
   route tables, web-vitals instrumentation) → `app/runtime/`, `app/bridge/`, `app/routes/`,
   `app/utils/webVitals*`.
2. **Used by exactly one feature?** → `app/features/<feature>/`, in the matching subfolder (below).
3. **Used by two or more features already?** → cross-cutting: `app/ui/{components,layouts}`,
   `app/hooks/`, `app/stores/`, `app/utils/`.
4. **Unsure, or only one consumer so far?** Keep it in the feature. Promote on the **second**
   consumer, not in anticipation of one.
5. **Needed by two features but carries domain logic (a repository call, a domain type)?** Split it
   — see [Splitting a shared component](#splitting-a-shared-component) — because nothing lets a
   whole component move: `ui/` may not know a domain entity, features may not import each other, and
   there is no `shared/` wrapper directory to dump it in instead.

A domain hook such as `useChannelRoom` is always case 2 (`features/channels/hooks`), never
`app/hooks`, unless a second feature ends up needing the exact same hook.

`app/hooks/` and `app/ui/hooks/` are both flat today (43 and 5 files) — group them into
sub-folders only once a category is crowded enough to need one; an empty category folder created in
advance is exactly the YAGNI violation this rule exists to prevent. The distinction between the two:
`app/ui/hooks` is UI mechanics with no data access (focus, insets, keyboard); a hook that touches
data, session or the bridge is `app/hooks` even if it also does UI work.

## Feature-internal structure

```text
features/<feature>/
├── pages/       route-entry screens
├── components/  UI used only inside this feature
├── hooks/       logic hooks that wrap @chatic/data / @chatic/app-runtime for this feature
├── types/       domain types and state — this feature's entities
├── consts/      this feature's constants
├── routes/      this feature's own route table (only where the feature owns one — see below)
└── index.ts     the public barrel; everything outside imports through it
```

There is no `api/` folder: server access goes through `@chatic/app-runtime` / `@chatic/data`, and a
feature's `hooks/` is where that gets wrapped. There is no separate `entities/` or `model/` layer
either — `types/` is the entity layer, promoted to a cross-cutting `types` only on a second
consumer.

The 13 feature folders do not all use the same subset. Counting actual subfolders under
`app/features/*/`: `components` (12), `pages` (11), `hooks` (11), `routes` (7), `lib` (6), `utils`
(4), `types` (4), `consts`/`constants` (3), `stores` (2), plus one-offs (`invite/accept`,
`debug/overlay`, `debug/metrics`). `routes/` appears only in features that export their own
`<Feature>Routes` for the top-level route tables to lazy-compose; `lib/`, `utils/` and `stores/` show
up where a feature's own logic outgrows `hooks/`. Treat the skeleton above as the common case, not a
fixed shape — add the subfolder a feature actually needs rather than forcing every feature to carry
all five.

```bash
find apps/web/src/app/features -mindepth 2 -maxdepth 2 -type d | sed 's#.*/features/[^/]*/##' | sort | uniq -c | sort -rn
```

### Colocation inside a feature

A feature with several screens re-applies the same decision one level down: a component or hook
used by one screen lives beside that screen (`pages/<Screen>/`), one used by two or more screens
moves to the feature's own `components/`/`hooks/`, and one needed by another feature is a candidate
for promotion (previous section). Start a screen as a single `pages/Foo.tsx` file; split it into a
folder only once it grows screen-local parts. Do not pre-create empty `components/`/`types/` folders
for a screen that does not need them yet.

### Naming

A folder that wraps a single component takes that component's PascalCase name
(`ChannelRoomPage/ChannelRoomPage.tsx`). A folder that names a domain, layer, or standard bucket
(`channels/`, `pages/`, `hooks/`) is lowercase. Keep this distinction consistent — Linux CI is
case-sensitive even when a contributor's filesystem is not.

## Splitting a shared component

When a component two or more features want mixes presentational UI with a domain call, split it by
what each part depends on, not by where it currently sits:

| Part                               | What it looks like                              | Goes to                                |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------- |
| Form/dialog body                   | Takes copy, initial values, `onSubmit` as props | `app/ui/components`                    |
| The repository call                | e.g. a `setMyProfile` write                     | `app/hooks` (once 2+ features call it) |
| Per-screen copy and open condition | That screen's own concern                       | Stays in `features/<feature>/`         |

The test: delete every `@chatic/data` / `useRuntimeRepositories()` / domain-type import from the
component. What is left is the presentational part that belongs in `ui/components`; if that is
nearly the whole component, it was already decomposed and only needed to move.

This is also why promoting a shared component is never just the component: constants and pure
helpers it depends on (a code-length constant, a countdown formatter) move with it, or the
cross-cutting piece ends up reaching back into a feature for them — a `shared → feature` import with
a different shape.

## Barrels and the test transform

Four `app/` barrels do not load under Jest: `app/hooks`, `app/bridge`, `app/ui/components`,
`app/ui/layouts`. Each pulls in a module (elsewhere in the tree) that reads `import.meta.env`, which
`tsconfig.spec.json`'s `commonjs` target cannot compile. `app/utils/index.ts` sidesteps this by
deliberately excluding `webVitals`/`buildEnv`/`phoneNumber` from its own barrel — that is the pattern
to copy for a new cross-cutting file that itself reads `import.meta.env`.

A spec that needs something from one of the four broken barrels imports the concrete path instead,
with a comment naming what it avoided. Before adding another such comment, check whether the cause
already has a fix — the `@chatic/assets` alias is mapped to a stub in `jest.config.js` for exactly
this reason, so a barrel that only touched that package no longer needs to route around it. A stale
bypass comment for an already-fixed cause is worse than the bypass: it hides that the barrel now
works.

## Detecting a placement violation

```bash
# feature importing another feature directly (targets vary; keep the feature list current)
grep -rnE "from '(\.\./)+(account|appUpdate|auth|channels|debug|feedback|home|invite|mypage|onboarding|place|search|subscription)(/|')" \
    apps/web/src/app/features --include='*.ts*' | grep -v '\.test\.'

# a barrel bypassed because of the test transform, not because of layering
grep -rn "not the .*barrel\|Direct path\|Concrete module" apps/web/src/app --include='*.ts*'
```

The cross-cutting-imports-a-feature check lives in [`README.md`](./README.md#the-shared-contract) —
it is a layering rule, not a placement one, so it is not repeated here.
