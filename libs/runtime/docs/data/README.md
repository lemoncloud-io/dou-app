# data — the React surface over the repository graph

The graph itself — `DataManager`, the factories, the scoped graphs, the outboxes, invited and paired
clouds, the cache clear — is the runtime's assembly and lives in `@chatic/runtime-core`: see
[runtime-core docs/data](../../../runtime-core/docs/data/README.md). What stays here is what React
reads it through, and the `data` group of the `runtime` facade that sells both. All of it goes through
the engine (`runtimeEngine().data`, in runtime-client's `data/dataCommands.ts`), never the data manager: on the phone the
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

`holdCloud(cid)` — the engine's hold on a cloud's socket, until the returned release is called — is
not on the package's surface: it is what `useSendImages` holds a cloud with, through runtime-client's
`withCloudHold(cid, work)`, which takes the hold, runs `work` against that cloud's chat repository and
releases the hold when `work` settles. The two cloud-name hooks below are React triggers over
runtime-client's once-per-cloud gates (`createInvitedCloudNameSync`, `createPairedCloudNameSync`). Sending media
reaches the session only through the engine: the hold, the upload targets, the completion and the send.
The files stay in the page, which uploads their bytes itself, so nothing that cannot cross a bridge is
handed to the engine ([image-send.md](./image-send.md)).

## The hooks

| Hook                               | Returns                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRuntimeRepositories()`         | The page's graph (`PageRepositories`), bound to the current scope                                                                           |
| `useGlobalCacheSearch()`           | `{ search, resolveContext }` — a search across every cloud's partition                                                                      |
| `useInvitedCloudNameSync()`        | Fills in an invited cloud's name once its socket verifies. Native only                                                                      |
| `usePairedCloudNameSync()`         | Reads a paired cloud's name once per entry. Browser and shells alike                                                                        |
| `useRegisterDeviceTokenMutation()` | Push registration by hand, for apps/web's push debug screen — sold through the `push` group; the runtime's own registration does not use it |

Both name hooks read the name from the relay, so each waits for the relay slot to be verified as well as the
cloud's own: the active slot being verified says nothing about the relay, and the run is spent once it starts,
so starting on the cloud's socket alone would leave the name unsynced for the whole visit. A failed paired-cloud
read waits for the next entry into the cloud instead of retrying in a loop. The invited-cloud hook runs only in
the phone app, decided by the injected `ReactNativeWebView` handle (can the page reach the shell?) rather than a
user agent, so a browser tab and the desktop shell's message handler leave the name alone; `isNativeApp()` asks
the same question.

`cloudsKeys` is the only query key left here, because the runtime is one of the things that
invalidates it — `useLogin` does, right after a login — while the apps invalidate it after their own
cloud-changing actions. The other REST hooks went down to the app layer, where their only
consumers were screens and react-query was the whole cache; keeping a catalogue copy per app is
deliberate duplication, and what is shared is the repository call.

## Further reading

- [runtime-core docs/data](../../../runtime-core/docs/data/README.md) — the graph these hooks read
- [image-send.md](./image-send.md) — `useSendImages`: the pending row, the file memory, retry, leftovers and upload progress
