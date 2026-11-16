# @chatic/host

**How a feature reaches the host it runs in.** The phone app, the desktop app, a browser tab and the
development shells can each do different things: pick photos, sell through a store, open a URL outside,
keep a vault. A feature does not ask which host it is in. It asks a **port** — an interface with one
implementation per host — and the app's entry point chooses those implementations once, from what the
host declared before the page ran. Only that entry point and `@chatic/bridges`' host profile ask the
host what it is; lint holds the rest of the code to the ports.

The decision and its reasoning are ADR-0324. This package is its frame: the facade and the port type.
**No port is defined yet.** Each arrives with the step that moves its domain's features onto it —
`checkout` first — and is then documented here.

## Who imports it

`apps/web` and `apps/desktop-web`, each from one file: `src/app/host/publishHostPorts.ts`, which
`main.tsx` calls right after `config.init()`, before the first render. Features will import `host` to
read a port; none does yet.

```bash
git grep -n "@chatic/host" -- apps libs ':!*.md'
```

## The facade

```ts
import { host } from '@chatic/host';

host.publish({
    /* one implementation per port */
}); // the entry point, once
host.ports.checkout; // a feature, at the point of use (once the port exists)
```

- **Published once.** A second `publish` throws rather than replacing the first: every caller that had
  already read a port would keep the old one, with nothing to show it.
- **Read at the point of use, never at module scope.** A module evaluated before `publish` would throw,
  and one evaluated after would keep what it read first. `config.get()` follows the same rule.
- **A module facade, not a React context.** Logging, the boot sequence and other plain modules need the
  host too, and a context cannot reach them.
- `host.isPublished` lets a caller that can do without the host — a crash screen — check first.
  `host.resetForTests()` is for tests only.

## Rules

1. **Every port field is required.** A host that cannot do something gets an implementation that says
   so (`checkout.kind === 'none'`, a picker that answers `unavailable`), never a missing field that a
   feature then fills with a browser's answer.
2. **A port talks to the host, not to the relay.** The package is tagged `layer:host`; the root lint
   config keeps it off the data layer, the runtime and its adapters, the React surface and React itself.
   It may use `@chatic/bridges` (the host profile, the bridge) and `@chatic/bridge-messages`.
3. **Product rules stay out.** What a membership allows, which tier sits next to which, who bills a
   membership — those stay pure, in the feature, and take a port's facts as input. Only "what this host
   can do" comes from a port.
4. **Implementations only one app uses stay in that app** — the desktop ones in `apps/desktop-web`, the
   fakes beside the virtual shell and the e2e suite. Implementations both apps use live here.

## The lint rule

`@nx/workspace-host-facts` ([`tools/eslint-rules/host-facts.js`](../../tools/eslint-rules/host-facts.js))
reports any use of `isNative()` (or of app-runtime's `isNativeApp()`, the same question asked
again) and any read of a `CHATIC_APP_*` global off `window` — directly, through a local name for
`window`, or through a function that returns it — outside the allowed files. Its allow-list,
[`tools/eslint-rules/host-facts-allowlist.js`](../../tools/eslint-rules/host-facts-allowlist.js),
started with every file that did either when the rule arrived. A domain that moves onto its port takes
its files off, so the list is the migration's progress. The debug overlay stays on it, because
showing the raw host facts is its job.

## How to verify

```bash
npx nx test @chatic/host
npx tsc -b libs/host/tsconfig.json
npx nx test eslint-rules
```
