# @chatic/host

**A transition shim.** The host's capability ports — `checkout`, `media`, `files`, `links`, `appShell`,
`signIn`, `diagnostics` and `push`, ADR-0324's — no longer live here. This package re-exports them under
the names it had, so code still on `host.ports.<port>` and code already on `runtime.<port>` read the very
same objects while imports move over. Once nothing imports `@chatic/host`, it is deleted.

| What                                                                                                         | Lives in                                                                                                   | Read by the call part as                                              |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The port contracts (`HostPorts`, `CheckoutPort`, `ShellOrBrowser`, …) and the one holder `host`              | [`@chatic/runtime-client`](../runtime-client/README.md#the-host-ports), `src/host/`                        | `runtime.<port>` from `@chatic/runtime`; `runtime.push.kind` for push |
| Reading the shell's declaration (`resolveCheckoutMethod`, `resolveShellOrBrowser`, `hostOsOf`, the versions) | [`@chatic/runtime-web`](../runtime-web/README.md#the-host-ports-a-page-publishes), `src/hostCapabilities/` | — the entry point's alone                                             |

Both are taken from their `/host` entries (`@chatic/runtime-client/host`, `@chatic/runtime-web/host`)
rather than the package barrels: a barrel carries the whole engine, and a module that only asked the host
what it can do never loaded that through this package before. `src/index.spec.ts` checks that every name
here is the owner's own object.

## What still holds

The ports moved; their rules did not, and the module docs above carry them:

- **Every port field is required.** A host that cannot do something gets an implementation that says so
  (`checkout.kind === 'none'`, a picker that answers `unavailable`), never a missing field a feature then
  fills with a browser's answer.
- **Published once, read at the point of use.** A second `host.publish` throws. A module that read a
  port at module scope would throw before the publish, or keep what it read first after it.
- **Product rules stay out.** What a membership allows, which tier sits next to which, who bills a
  membership — those stay in the feature, and take a port's facts as input.
- **Libraries do not read the ports.** `@chatic/runtime` and `@chatic/theme` are also rendered by apps
  that publish none (`apps/admin`, `apps/landing`), where a read would throw. They read `@chatic/bridges`'
  host profile instead.

The package is tagged `layer:host`. While it is a shim, the root lint config lets it reach the client
and adapter layers it re-exports from, and still keeps it off the React surface and React.

## The lint rule

`@nx/workspace-host-facts` ([`tools/eslint-rules/host-facts.js`](../../tools/eslint-rules/host-facts.js))
reports any use of `isNative()` (or of `@chatic/runtime`'s `isNativeApp()`, the same question asked
again) and any read of a `CHATIC_APP_*` global off `window` — directly, through a local name for
`window`, or through a function that returns it — outside the allowed files. Its allow-list,
[`tools/eslint-rules/host-facts-allowlist.js`](../../tools/eslint-rules/host-facts-allowlist.js), holds
only the permanent entries now: the reader (`@chatic/bridges`), the two entry points that publish the
ports, and the debug overlay, because showing the raw host facts is its job. The rule outlives this
package; its messages name the ports wherever they are read from.

## How to verify

```bash
npx nx test @chatic/host
npx tsc -b libs/host/tsconfig.json
npx nx test eslint-rules
```
