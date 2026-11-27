# @chatic/host-node

**The host ports for a Node process, at their minimum.** A Node tool has no screen, no shell and no
store, so most of what a feature asks of the host is absent: links are printed, files are sent with
`fetch`, and every other member is `null` (checkout is `none`)
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)). The contract is `HostPorts` from [`@chatic/ports`](../../contracts/ports/README.md).

Tags: `layer:adapter` · `platform:node` · `formfactor:any`.

| Port                                          | In Node                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `links`                                       | `openUrl` writes the address as a line (stdout unless `writeLine` is given); `copyText` answers `false`; the rest `null` |
| `files`                                       | `put` sends the file with `fetch` (`fetchPut`); `transfers` is `null`                                                    |
| `checkout`                                    | `{ kind: 'none' }`                                                                                                       |
| `signIn`                                      | `sessionScope: 'device'`, `requestsPairing: true`, no provider sign-in, no relay OAuth, no approving of pairings         |
| `media` · `appShell` · `diagnostics` · `push` | every member `null`; `os` is `null`                                                                                      |

```ts
import { nodeHostPorts } from '@chatic/host-node';

const host = nodeHostPorts({ writeLine: line => console.error(line) });
```

## Signing in: `pairNode`

`pairNode({ writeLine, onChange, signal })` signs a Node process in by device pairing, the way the web does. It opens a guest relay session for the device, requests a pairing, writes `pairing code: <code>` and polls the claim, with `createPairingRequestFlow` from `@chatic/runtime/api` as the state machine. It resolves with the final state: `done`, `denied`, `expired`, `lost` or `failed`; an aborted `signal` rejects.

| Approval              | What the run does                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| relay (whole account) | applies the session the claim carries; the process becomes that account                                                 |
| cloud                 | the claim carries no session, so the run enters the cloud through the guest session (`delegate-cloud`), as the web does |

The runtime must be started first (`startRuntime` publishes the engine `pairNode` reads). The tests in `src/pairing/pairNode.test.ts` run both approvals against a fake relay.

**A stdio protocol needs `writeLine`.** The default writes to stdout; a process whose stdout carries a
protocol (a local MCP server over stdio) passes `writeLine` that writes elsewhere, such as stderr.

**`kind` is `'browser'`.** The contract's `ShellOrBrowser` has no third value; `'browser'` is the one
that means "no shell", which is what features branch on. Widening the contract is a change to
`@chatic/ports`, not made here.
