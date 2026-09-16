# state — how data reaches a screen

`apps/web` owns no session, socket, cache or repository — those are `@chatic/app-runtime` and
`@chatic/data`. What it does own is the wiring: which store holds transient client state, how a
screen observes server data, and who decides that data is stale.

A document belongs here if it answers "where does this value come from, and when does it change?"
The rule about which directory a store may be imported from is layering, and lives in
[the layering contract](../README.md#the-shared-contract).

| Document | Owns |
| --- | --- |
| [data-flow.md](./data-flow.md) | Runtime bootstrap, reading through `observe*`, writing through a repository, and refresh timing |
| [stores.md](./stores.md) | The transient zustand stores, and the preference plumbing on top of `@chatic/config` |

The split between them is durability: `data-flow.md` is server data passing through, `stores.md` is
what the client keeps.
