# data — the React surface over the repository graph

The graph itself — `DataManager`, the factories, the scoped graphs, the outboxes, invited and paired
clouds, the cache clear — is the runtime's assembly and lives in `@chatic/runtime-core`: see
[runtime-core docs/data](../../../runtime-core/docs/data/README.md). What stays here is what React
reads it through, and the `data` group of the `runtime` facade that sells both.

## The hooks

| Hook                               | Returns                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `useRuntimeRepositories()`         | The repository graph, bound to the current scope                         |
| `useGlobalCacheSearch()`           | `{ search, resolveContext }` — a search across every cloud's partition   |
| `useInvitedCloudNameSync()`        | Fills in an invited cloud's name once its socket verifies. Native only   |
| `usePairedCloudNameSync()`         | Reads a paired cloud's name once per entry. Browser and shells alike     |
| `useRegisterDeviceTokenMutation()` | The one REST call the runtime still owns — sold through the `push` group |

`cloudsKeys` is the only query key left here, because the runtime is one of the things that
invalidates it — `useLogin` does, right after a login — while the apps invalidate it after their own
cloud-changing actions. The other REST hooks went down to the app layer, where their only
consumers were screens and react-query was the whole cache; keeping a catalogue copy per app is
deliberate duplication, and what is shared is the repository call.

## Further reading

- [runtime-core docs/data](../../../runtime-core/docs/data/README.md) — the graph these hooks read
- [image-send.md](./image-send.md) — `useSendImages`: the pending row, the file memory, retry, leftovers and upload progress
