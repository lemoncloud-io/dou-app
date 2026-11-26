# @chatic/ports

**The contracts between the runtime, the features and the platform they run on.** A port is a type: what
one side asks of the other, with no implementation. This package collects every port in one place so
that an implementation (a browser, a mobile shell, a desktop shell, a Node process) can be written
against the contract alone, without the runtime's assembly in reach and, for the host ports' own
members, without the shell's wire format (the gaps are listed at the end)
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

```text
libs/contracts/ports/src/
├── index.ts          the package barrel — every name below
├── runtime.ts        RuntimePorts: what the engine borrows from the platform
└── host/             HostPorts: what a feature asks of the host
    ├── ports.ts      HostPorts, HostPortName, ShellOrBrowser, HostOs
    ├── checkout.ts   CheckoutPort — store · web · none
    ├── media.ts      MediaPort — picker, photo library, video conversion, camera permission
    ├── files.ts      FilesPort — put, and the app's file transfers
    ├── links.ts      LinksPort — open, copy, share sheet and intake, contacts, SMS, link preview, sub web view
    ├── appShell.ts   AppShellPort — the frame around the app: haptics, preferences, badges, icons, updates
    ├── signIn.ts     SignInPort — provider sign-in and sign-in through the OAuth relay
    ├── diagnostics.ts DiagnosticsPort — debug switch, boot metrics, pending reports
    └── push.ts       PushPort — notification feed, device token, renewal, local banner
```

## Two kinds of port

|                          | Runtime ports                                                                                              | Host ports                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Type                     | `RuntimePorts`                                                                                             | `HostPorts`                                                                               |
| Members                  | `storage` · `transport` · `auth` · `cache` · `foreground`                                                  | `checkout` · `media` · `files` · `links` · `appShell` · `signIn` · `diagnostics` · `push` |
| Read by                  | the engine (`@chatic/runtime`'s `createRuntime`)                                                           | features, as `runtime.<port>`                                                             |
| When a platform lacks it | not possible: every field is required, and `RuntimePortsAreRequired` stops compiling if one turns optional | the member is `null`, or `checkout.kind` is `'none'`                                      |
| Published by             | the app's entry, through `startRuntime` (which calls `createRuntime`)                                      | the app's entry, through `startRuntime` (which calls `host.publish`)                      |

Each runtime port has a short name beside the one its owning package gave it: `StoragePort`
(`SessionStoragePorts` and the runtime's `device` store), `TransportPort` (`TransportPlatformPorts`),
`AuthPort` (`AuthPlatformPorts`), `CachePort` (`LocalCachePorts`) and `ForegroundPort`. The older names
stay as aliases (`ForegroundSignal`, `RuntimeStorePorts`, and the core packages' own), so nothing that
already names a port changes.

`@chatic/runtime` re-exports these types from the modules that used to define them (`src/engine/ports.ts`,
`src/api/host/`), under the same names, and so do `@chatic/runtime-core` and `@chatic/runtime-client`, which
re-export those folders. A caller can keep importing from there; a new implementation imports
from here.

## Rules

- **Types only.** No value, no function, nothing that runs. A bundler or a test runner never has to
  resolve this package: every import of it is erased. The one value the host ports need,
  `HOST_PORT_NAMES`, stays in `@chatic/runtime` (`src/api/host/ports.ts`), which publishes the ports.
- **Below the runtime, above the core.** Tagged `layer:contract · platform:any · formfactor:any`. It may
  take types from `layer:foundation` and `layer:core-lib` packages and nothing else; the core packages
  may not depend on it. The root `eslint.config.mjs` holds both: the layer constraint, and a
  `no-restricted-imports` block that lets this package import a `@chatic/*` package only with
  `import type`.
- **Domain types, not bridge payloads.** `@chatic/bridge-messages` is refused outright. A port member
  that used to take a bridge payload takes a domain type of the same shape declared here
  (`PickedAttachments`, not `OnPickAttachmentsPayload`), so an implementation outside a WebView does not
  need the wire vocabulary. Converting a payload to a domain type belongs in the implementation that
  speaks the wire. While the shapes are equal, an adapter that passes a payload through compiles
  unchanged; `@chatic/runtime`'s `src/api/host/contractShapes.spec.ts` checks at typecheck that every one
  of them is still exactly equal (no extra optional field, `readonly` or `any` slips through).
- **No UI framework.** React and React Native are refused. The one exception is
  `checkout.ts`, whose store product and purchase are still `react-native-iap`'s own types, imported as
  types with an `eslint-disable` that says why. They become domain types when the app-store checkout
  family owns that conversion.

## What is still shaped like the wire

The domain types copy the payload shapes exactly, so these still read as the shell's answers rather
than a platform-neutral model:

- `ProviderSignInOutcome` is the whole `OnOAuthLogin` message — `type`, `success`, `error`, `data`, and
  the envelope's optional `refId`, `version` and `nonce` — because a screen's handler takes that message
  as it is.
- `StoreProduct` and `StorePurchase` are `react-native-iap`'s types (above).
- `CachePort` is `@chatic/data`'s `LocalCachePorts`, keyed by the bridge's `CacheType`, and `FilesPort`'s
  `put` and `putShellFile` come from `@chatic/data`'s upload types, which import bridge-messages: the
  wire vocabulary still reaches a contract reader through `@chatic/data`.
- `SmsResult`, `UrlMetadata` and `ContactsReadout` carry a `success` flag or a `permission` field the
  way the shell reports them.

Narrowing any of them changes an adapter or a screen, so each waits for the step that moves its
implementation.
