# ADR-0375: Platform implementations live in libs, as families of one port

> Status: Accepted · Decided: 2026-11-25 · Implemented: not yet — in steps, one pull request each, none of which changes
> behaviour or a bridge message
> · Supersedes the placement sentence of decision 1 of [ADR-0359](./0359-every-host-port-carries-its-work.md),
> decision 3 of [ADR-0352](./0352-a-host-port-carries-its-work-and-features-never-ask-which-side-does-it.md),
> the last sentence of decision 2 of [ADR-0343](./0343-each-app-declares-its-runtime-and-libraries-never-choose.md)
> and decision 4 of [ADR-0346](./0346-every-app-starts-from-a-declaration-and-its-call-part-sees-only-the-runtime.md)
> ("an adapter only one app needs lives in the app")
> · Scope: `libs/` (new family folders and `@chatic/ports`), the implementations now under
> `apps/web/src/config/adapters/`, `apps/desktop-web/src/config/adapters/`, `apps/mobile/src/app/services/`
> and `apps/desktop/src/main/`
> · Builds on: [ADR-0301](./0301-the-runtime-splits-into-contracts-assembly-and-platform-adapters-held-by-lint.md)
> (contracts, assembly and adapters), [ADR-0343](./0343-each-app-declares-its-runtime-and-libraries-never-choose.md)
> (apps choose, libraries never do) and ADR-0359 (every host port carries its work)
> · Related: [ADR-0376](./0376-the-runtime-is-one-headless-package-a-react-binding-and-platform-adapters.md)
> (the runtime's packages) and
> [ADR-0377](./0377-every-project-carries-a-layer-a-platform-and-a-form-factor-tag-and-folders-group-families.md)
> (tags and folders)

## Context

The runtime already has the shape a new app needs: contracts, an assembly, platform adapters, and lint
that keeps them apart. What it does not have is the implementations in a place a new app can take them
from. A command-line tool, an MCP server, a service that sends push notifications or a custom app built on
the same backend would each have to start by copying code out of another app:

- the web's and desktop-web's host port implementations live in each app's `src/config/adapters/`;
- the mobile app's store purchases, push, social sign-in, keychain, key-value store and SQLite database
  live in `apps/mobile/src/app/services/` and `apps/mobile/src/app/database/`;
- the desktop shell's secure storage, notifications and bridge handlers live in `apps/desktop/src/main/`,
  wired by hand in a 900-line `index.ts`;
- the sub web view host is written three times, once in each shell and once in the web.

ADR-0352 decision 3 put the host port implementations in the apps on purpose: the shell side talked to
the app's own bridge wrapper, and the web side needed the app's own data. ADR-0343 and ADR-0346 kept the
same rule for any adapter only one app needed. That was right while each implementation had exactly one
app. It stops being right the moment a second consumer exists, and the reason it gave — the app's own
bridge wrapper — goes away once an implementation takes its bridge client as a parameter.

A second problem sits in the contracts. Every host port contract (in runtime-client's `src/host/`) is typed
with bridge message payloads, so a contract cannot be implemented without the shell's wire
format, even on a platform that has no shell.

## Decision

### 1. A family is the set of implementations of one port

The implementations of one port sit together in a folder in `libs/`, one package per medium or platform:
the **family**. `host/` holds the eight host ports together, and `mini-app/` and `design-system/` are
folders of shared pieces rather than ports. `host/` holds the host ports for `web` (browser, inside the mobile shell, inside the desktop
shell), `mobile`, `desktop` and a minimal `node`; `storage/` the key-value stores; `db/` the table and
query engines; `bridge/` the two ends of the shell bridge; `checkout/`, `push/` and `sign-in/` their own
ports; `mini-app/` the sub web view protocol and host; `design-system/` the visual parts. The full layout
is in ADR-0377.

A family holds implementations only. Two other homes take what is not an implementation:

- **Contracts** go to one package, `@chatic/ports`: the five runtime ports (today in runtime-core) and the
  eight host ports (today in runtime-client). It holds types and no code that runs.
- **Domain rules that do not run anything** go to a core-layer domain package. The subscription rules
  (catalog, change kinds, the payment provider per country, card binding, dates and amounts) become
  `@chatic/subscription`, used by the web checkout, the store checkout, the subscription screens and
  landing alike. A family's packages may depend on it; it never depends on them.

Inside a family there is no "core" package. The only engine is the runtime itself (ADR-0376).

### 2. Implementations move from the apps into their family

An implementation that one app holds today moves into its family, unchanged, and takes what it used to
reach in the app as a parameter: the bridge client, the app's data reader, the logger. An app's
`src/config/` keeps only its declaration — which implementations, modules and form factor it picks — and
the settings and screens that are its own.

This holds for an implementation only one app uses. Where code lives is decided by what it is, not by how
many apps use it today: an implementation of a port is a library, and the declaration that picks it is
the app.

### 3. A capability that brings an external SDK is its own family

A capability whose implementation needs a native or vendor SDK — store purchases (`react-native-iap`),
push (Firebase messaging, notifee, the desktop push receiver), social sign-in — is a family of its own
(`checkout/store`, `push/mobile`, `push/desktop`, `sign-in/mobile`), so an app that does not use it does
not install it. Links, the badge and diagnostics use only the platform's own modules and stay inside
`host/<platform>`. Photo and document pickers and file saving also bring SDKs, but stay in `host/mobile`
for now because every app that hosts the web uses them; they move to a family of their own
(`media/mobile`) when an app needs the host without them.

Store purchases are one package, `checkout/store`, with an `apple` and a `google` strategy chosen once at
start. The split is by store, not by operating system, because it is the store's rules that differ; it
becomes two packages only if the two stores come to need different native SDKs.

### 4. Contracts speak domain types; the bridge stays where the bridge is

`@chatic/ports` types its members with domain types. Converting to and from a bridge payload happens
inside the implementations that cross the bridge (`host/web/*-shell` on the web side, `bridge/host` and
`host/mobile` or `host/desktop` on the shell side). Bridge message names and shapes do not change: an
installed shell keeps sending what it sends, and only the TypeScript names around it move.

When a shell is present, one capability is split across two packages: the web side asks over the bridge
and the shell side does the work. The two shells fill different members of the same port, as ADR-0352
already allowed.

### 5. Storage and the database are two families of two ports, and the cache is a module

Key-value stores and table-and-query engines are different media with different contracts, so they are
two families: `storage/` (memory, web local and session storage, the shell vault over the bridge, the
mobile keychain, the desktop safe storage, MMKV, a file store for Node and desktop, and the wrappers that
compose them) and `db/` (memory, IndexedDB, SQLite with its schema and queries, a SQLite driver per
platform, and the shell's database over the bridge). Neither wraps the other.

The runtime's `storage` port becomes one `StoragePorts` with four role slots — `secret`, `plain`,
`device`, `tab` — each holding one store. The runtime's `cache` port becomes `db`: the outbox and other
rows that must not expire live there too, so the port is the medium, not the policy. Expiry and scope are
the `cache` module's work (ADR-0376). The SQLite schema, migrations and queries are one platform-neutral
package, and only the driver that opens the file is per platform, so the mobile app, a CLI and the desktop
can share one schema.

## Alternatives

- **Keep implementations in the apps until a second app needs one.** The rule ADR-0343 and ADR-0352
  wrote. Every new kind of app would start by moving code out of an existing app, under the pressure of
  its own feature, and the move would be judged against that feature instead of on its own. Rejected:
  the move is cheaper now, when it can be made one behaviour-preserving step at a time.
- **One package per platform holding every capability** (`@chatic/mobile`). Simpler to name, but an app
  that wants the keychain would install the store purchase and push SDKs with it.
- **Name the family after the business domain** (`subscription/` for checkout). The checkout port would
  become subscription-only and a one-off payment would have nowhere to go. The rules are
  `@chatic/subscription`; the port that runs a payment is `checkout`.
- **Put the subscription rules in `@chatic/ports`.** The contract package holds no running code.
- **One storage family with a key-value engine inside `db`.** Two contracts for one medium, and a key
  that could live in either place.

## Consequences

- A new app is assembled from libraries: its declaration imports the implementations its platform needs
  and nothing else.
- Each move is one pull request that changes no behaviour and no bridge message. A move from the web side
  to `runtime-hybrid-web` and the web and desktop-web declarations that use it land in the same pull
  request, or the web inside a shell would quietly fall back to the browser's own stores.
- Supersedes ADR-0352 decision 3, the placement sentence of ADR-0359 decision 1, the last sentence of
  ADR-0343 decision 2 and, with ADR-0376, ADR-0346 decision 4. ADR-0352's other decisions (members carry the work, a missing capability is
  `null`, the lint rule on `kind`) stand.
- The `cache` port's TypeScript names change to `db`; the bridge messages that carry cache requests keep
  their names, because installed shells send them.
- The desktop shell's implementations move in a gradual track of their own, one capability per pull
  request, so each one can be checked in the desktop shell on its own.
- Where the desktop-web's shared screen code (its `src/app/shared`) ends — generic, shared by two apps, or
  the app's own — is not decided here; it is settled before the desktop track reaches it.
