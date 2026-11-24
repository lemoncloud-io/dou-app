# ADR-0377: Every project carries a layer, a platform and a form factor tag, and folders group families

> Status: Accepted · Decided: 2026-11-25 · Implemented: not yet — in steps — the tags first, new packages in their
> target folder from the start, existing packages moved last
> · Scope: `nx.tags` of every project under `apps/` and `libs/`, the module boundary constraints in the root
> lint config, and the folder layout of `libs/`
> · Amends: [ADR-0301](./0301-the-runtime-splits-into-contracts-assembly-and-platform-adapters-held-by-lint.md)
> and [ADR-0346](./0346-every-app-starts-from-a-declaration-and-its-call-part-sees-only-the-runtime.md)
> decision 5 (renames or retires `layer:runtime-core`, `layer:client`, `layer:react-surface`,
> `layer:bridge` and `platform:native`)
> · Related: [ADR-0375](./0375-platform-implementations-live-in-libs-as-families-of-one-port.md) (families)
> and [ADR-0376](./0376-the-runtime-is-one-headless-package-a-react-binding-and-platform-adapters.md) (the
> runtime's packages)

## Context

ADR-0301 and ADR-0346 gave the runtime's packages layer tags and lint constraints, and the constraints have
held. But the tags cover part of the repo and one question each:

- Five libraries and every app carry no tag at all, so nothing stops them from importing across any
  boundary.
- The platform axis has two values, `web` and `native`. There is no way to say "runs anywhere", nothing for
  Node, and `native` does not say which native platform: the phone and the desktop are both native, and
  must not import each other.
- Whether a screen part is built for a phone-sized or a desktop-sized layout is a question of its own. The
  web app and desktop-web both run on the web platform but have different layouts, and today each keeps
  its own copy of the design values because nothing says which parts are shared.
- `libs/` is a flat list. A package's folder says nothing about what it is, so finding every
  implementation of one port means reading every package.

## Decision

### 1. Three tag axes, on every project

| Axis           | Values                                                                                                | Rule                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `layer:*`      | `foundation` · `core-lib` · `contract` · `runtime` · `binding` · `adapter` · `feature` · `ui` · `app` | a project depends on its own layer or a lower one; `binding` and `adapter` are siblings and never import each other |
| `platform:*`   | `any` · `web` · `mobile` · `desktop` · `node`                                                         | a project depends only on projects whose every platform value is `any` or one of its own                            |
| `formfactor:*` | `any` · `mobile` · `desktop`                                                                          | `mobile` and `desktop` never import each other                                                                      |

Every project under `apps/` and `libs/` carries at least one value on each axis, and lint fails a project
that does not. A package that runs on more than one platform carries each (the file store and the Node
SQLite driver are `node` and `desktop`; the shell end of the bridge is `mobile` and `desktop`). `platform:native` becomes `platform:mobile`. `layer:runtime-core` and `layer:client` become
`layer:runtime` when those packages merge (ADR-0376); `layer:react-surface` becomes `layer:binding`. The
bridge family's packages (ADR-0375) are adapters, so `layer:bridge` goes when today's bridge package is
split into that family.

Platform names the environment code runs in: `web` is JavaScript in a browser or a WebView, `mobile` the
phone shell's React Native process, `desktop` the desktop shell's process, `node` a Node process. Form
factor names the layout a screen part is built for; it matters to the design system and the apps, and is
`any` for everything else.

### 2. Folders group families; tags hold the boundaries

A folder under `libs/` is a family — the implementations of one port (ADR-0375) — or a layer of shared
pieces. One family's packages may sit in different layers: the folder says what a package is about, the
tags say what it may import.

```text
libs/
├── foundation/      config · logger · http · perf · bridge-messages · format
├── core/            session · transport · sync · auth · subscription · data/{model,api,local,repositories}
├── contracts/ports
├── runtime/         core · react · adapters/{web,hybrid-web,mobile,node}
├── host/            web/{browser,mobile-shell,desktop-shell} · mobile · desktop · node
├── bridge/          client · host · fake-shell
├── storage/         memory · web-local · web-session · vault-bridge · keychain · safe-storage · mmkv · file · compose
├── db/              memory · indexeddb · sqlite · sqlite-op · sqlite-node · bridge
├── checkout/        web · store
├── subscription/    ui
├── push/            mobile · desktop
├── sign-in/         mobile
├── mini-app/        protocol · host · sdk · devtools
├── design-system/   tokens · assets · theme · primitives · components · patterns · chat
└── features/        policy-content · preferences
```

Folder names are short (`runtime/react`); package names are full (`@chatic/runtime-react`), and the
design packages are named `@chatic/design-system-*`. Inside `design-system/`, `mobile` and `desktop` are
form factors; in every other family they are platforms.

The packages that do not survive as they are: runtime-core and runtime-client (merged into
`@chatic/runtime`), data (split into model, api, local and repositories), shared (scattered by topic),
bridges (split into the bridge family), web-checkout (split into `@chatic/subscription` and
`checkout/web`), and ui-kit, web-ui-kit, theme and block-kit (into `design-system/`).

### 3. Imports go through a package's entry, never into its folders

A deep import into another package's source is a lint error. A package can then move to its family folder
without any importer changing, and a package's public surface is what its entry exports.

### 4. New packages start in their target folder; existing packages move last

A package created from now on is created in its family folder. An existing package keeps its folder until
the restructure's last step, which moves them all at once, so that the earlier steps each change one thing
and a reviewer reads a move as a move.

### 5. Nothing new is published to npm

The packages are workspace packages. The mini-app SDK, already published, keeps its package name and its
release when it moves into `mini-app/`.

## Alternatives

- **One tag axis with combined values** (`web-mobile`, `node-any`). Every combination would need its own
  constraint, and a new platform would multiply them.
- **Folders by layer** (`libs/adapters/…`). The implementations of one port would scatter across layers,
  which is the search this record is meant to remove.
- **Folders by platform** (`libs/mobile/…`). Puts the keychain and the store purchase SDK side by side and
  hides that `storage/keychain` and `storage/web-local` fill the same port.
- **Move every package at the start.** One review of hundreds of moved files, with nothing else
  verifiable in it.

## Consequences

- An untagged project fails lint, so a new library cannot skip the boundaries by omission.
- The phone and the desktop shell code can no longer import each other, and a phone-sized screen part
  cannot import a desktop-sized one.
- The tags are added before any package moves, and each later step keeps lint green with the tags it
  touches.
- Deep imports into the UI kit from desktop-web go through the kit's entry instead, in the same change that
  turns on the deep-import rule for it.
