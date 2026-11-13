# data — the React surface over the repository graph

The graph itself — `DataManager`, the factories, the scoped graphs, the outboxes, invited and paired
clouds, the cache clear — is the runtime's assembly and lives in `@chatic/runtime-core`: see
[runtime-core docs/data](../../../runtime-core/docs/data/README.md). What stays here is what React
reads it through, and the `data` group of the `runtime` facade that sells both. All of it goes through
the engine (`runtimeEngine().data`, in `dataCommands.ts`), never the data manager: on the phone the
repositories and their cache may live in another process.

The graph a screen gets is the **page's graph** (`PageRepositories`): every repository, minus what
answers with a session's token — the auth repository's token issuers (`login`, `registerDevice`,
`delegateCloud`, the token exchanges, the invite login; `confirmPhoneCode` outside `link` mode) and the
pairing claim — and minus the lifecycle of the graph and of each repository (`withContext`, `dispose`).
Those are left out of the type and refused at run time (`PAGE_REPOSITORY_REFUSED`); the session commands
do the same work and keep the token. The same view comes back for the same graph, so a repository in an
effect's dependencies does not re-run it.

| Function                                                                                       | Does                                                                  |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `getCloudRepositories(cid)`                                                                    | the page's graph of one named cloud, whichever is selected            |
| `sendChatInCloud(cid, payload)` · `waitForCloudSocket(cid, ms?)`                               | a send held on its cloud's socket; a wait for that socket             |
| `recoverInvitedCloudIfMissing(cid)` · `syncInvitedCloudName(cid)` · `syncPairedCloudName(cid)` | by cloud id alone — the engine uses the live scope's cloud repository |
| `clearLocalCaches()` · `requestSyncCursorReset()`                                              | the settings clear; the next-boot cursor retirement                   |
| `setStateOutboxObserver(observer)`                                                             | one state-write observer at a time                                    |
| `getCacheMetricsSource()`                                                                      | `{ read, reset }` over the cache's counts — both asynchronous         |
| `getAcceptorId()`                                                                              | the id an invited cloud row records, read from the session view       |

Sending media (`useSendImages`) still runs in this process: it holds a cloud's socket across work that
is a function, and its files cannot cross a bridge. It becomes a command of its own before a page
mirrors a runtime in another process.

## The hooks

| Hook                               | Returns                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRuntimeRepositories()`         | The page's graph (`PageRepositories`), bound to the current scope                                                                           |
| `useGlobalCacheSearch()`           | `{ search, resolveContext }` — a search across every cloud's partition                                                                      |
| `useInvitedCloudNameSync()`        | Fills in an invited cloud's name once its socket verifies. Native only                                                                      |
| `usePairedCloudNameSync()`         | Reads a paired cloud's name once per entry. Browser and shells alike                                                                        |
| `useRegisterDeviceTokenMutation()` | Push registration by hand, for apps/web's push debug screen — sold through the `push` group; the runtime's own registration does not use it |

`cloudsKeys` is the only query key left here, because the runtime is one of the things that
invalidates it — `useLogin` does, right after a login — while the apps invalidate it after their own
cloud-changing actions. The other REST hooks went down to the app layer, where their only
consumers were screens and react-query was the whole cache; keeping a catalogue copy per app is
deliberate duplication, and what is shared is the repository call.

## Further reading

- [runtime-core docs/data](../../../runtime-core/docs/data/README.md) — the graph these hooks read
- [image-send.md](./image-send.md) — `useSendImages`: the pending row, the file memory, retry, leftovers and upload progress
