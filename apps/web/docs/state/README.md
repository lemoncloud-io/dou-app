# state — how data reaches a screen

`apps/web` owns no session, socket, cache or repository — those are `@chatic/runtime-react` and
`@chatic/data`. What it does own is the wiring: which store holds transient client state, how a
screen observes server data, and who decides that data is stale.

A document belongs here if it answers "where does this value come from, and when does it change?"
The rule about which directory a store may be imported from is layering, and lives in
[the layering contract](../README.md#the-shared-contract).

| Document                                                           | Owns                                                                                                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [data-flow.md](./data-flow.md)                                     | Runtime bootstrap, reading through `observe*`, writing through a repository, and refresh timing                                              |
| [stores.md](./stores.md)                                           | The transient zustand stores, and the preference plumbing on top of `@chatic/config`                                                         |
| [session-liveness.md](./session-liveness.md)                       | When the app asks the runtime to refresh credentials, recover sockets, report presence and keep background clouds and invited clouds current |
| [active-cloud-data.md](./active-cloud-data.md)                     | The one shared channel/unread observation, other clouds' unread, every room's preview catch-up, and my profile reads                         |
| [account-and-invites.md](./account-and-invites.md)                 | The relay account vs the active cloud's user, guest answers, linked credentials, relay invites and invited clouds                            |
| [app-helper-rules.md](./app-helper-rules.md)                       | Shared judgements on cloud rows, invited-cloud acceptance, place-profile absence, error codes and the soft keyboard                          |
| [app-storage-and-device-info.md](./app-storage-and-device-info.md) | The device and tab stores, preference parsers, device-info stage vocabularies and small app stores                                           |

The split between them is durability: `data-flow.md` is server data passing through, `stores.md` is
what the client keeps.
