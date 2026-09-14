# remote — outbound server calls

> Status: Live · Last updated: 2026-09-14 · Overview in the [lib README](../../README.md) · Canonical code: [gateways/](../../src/remote/gateways/) · Per-axis detail in [socket.md](./socket.md) · [http.md](./http.md)

The remote layer handles **outbound server calls** and nothing else. It is a thin gateway wrapper; it
knows nothing about the socket connection's lifecycle, reconnection, or sync timing.

This document holds what the two axes **share**. Per-domain mapping tables and axis-specific traps live
in the axis documents.

## Two axes

`remote` is the **axis** (the opposite side of local), and the names under it say the **transport**.

```text
remote/
  gateways/
    socket.ts              SocketGatewayBundle + per-domain Pick<>
    http.ts                HttpGatewayBundle + per-domain Pick<>
    index.ts               barrel
    __mocks__/             createMockSocketGateways (socket axis only)
  socket-data-sources/     11 SocketDataSources + createSocketDataSources
  http-data-sources/       5 HttpDataSources + createHttpDataSources
```

The two are deliberately symmetric. What one axis does, the other does in the same place.

|                     | Socket axis                              | HTTP axis                              |
| ------------------- | ---------------------------------------- | -------------------------------------- |
| Gateway types       | `gateways/socket.ts`                     | `gateways/http.ts`                     |
| Bundle              | `SocketGatewayBundle` (11 domains)       | `HttpGatewayBundle` (5 domains)        |
| Data sources        | `socket-data-sources/` (11)              | `http-data-sources/` (5)               |
| Factory             | `createSocketDataSources({ gateways })`  | `createHttpDataSources({ gateways })`  |
| Composition root    | app-runtime `factories/socketFactory.ts` | app-runtime `factories/httpFactory.ts` |
| Types come from     | `@lemoncloud/chatic-sockets-lib`         | `@chatic/http`                         |
| Mirrors local cache | some domains do (`getCloud` and friends) | **never** — react-query owns it        |
| Test mocks          | shared `createMockSocketGateways`        | built inline per test                  |

| Document                 | What it covers                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| [socket.md](./socket.md) | 11 gateway mappings, where absence is the contract, routing (`RoutedGateway`), request limits |
| [http.md](./http.md)     | 5 gateway Picks, why it holds no cache, the admin console surface, the report lane            |

## The shared contract

### Gateways are injected through the constructor

A data source knows exactly one gateway type — its own. It does not know socket action strings, HTTP
paths, or routing rules.

```ts
export class ChatSocketDataSource implements IChatSocketDataSource {
    constructor(private readonly gateway: ChatSocketDomainGateway) {}
}

export const createSocketDataSources = ({ gateways }: { gateways: SocketGatewayBundle }): SocketDataSources => ({
    chat: new ChatSocketDataSource(gateways.chat),
    // ...
});
```

### `Pick<>` makes the consumer own the contract

The original gateway is never taken whole. Only the capabilities a domain actually uses are picked into
a domain gateway type. **The calling side's own type says what is available.**

The socket axis goes one step further and uses the **absence** in a `Pick<>` as a seal — it leaves
live-but-`@deprecated` actions out so callers cannot reach them. The HTTP axis does not do this. That
is the only difference between the two axes, and
[socket.md](./socket.md#where-absence-is-the-contract) and [http.md](./http.md#gateway-pick) each cover
their side.

### view → domain happens once, here

The data source is where a server view becomes a domain model. Callers receive domain shapes only. The
exception is session material, where mapping would drop the very thing the caller wants; those pass
through raw, and the axis documents name each one.

### `context: DataContext` is the request-time scope

The `context` in a method signature is the request-time scope **the caller captured and passed in**. It
keeps a late response from poisoning a scope that has since switched. Capturing it is the repository's
job (`BaseRepository.getRequestContext()`).

HTTP domains that hold no cache still take this argument. Today it only carries mapping metadata, but
keeping the signatures symmetric means the interface will not change when cache semantics arrive.

## Usage

### This layer is not a surface the app calls

Every data call goes through a repository (ADR-0036). Even the composition root does not hand the
gateway bundle back — the bundle exists only long enough to build the data sources, then is dropped.

The entry point, the rules that hold, and the wiring map belong to
[the lib README's Usage](../../README.md#usage). What follows here is only the procedure for **adding**
something to this layer.

### Adding a server call

This is the case of adding one action to an existing domain. Work top to bottom.

1. **Put the action in the gateway `Pick<>`** — `gateways/socket.ts` or `gateways/http.ts`. Before you do, read [where absence is the contract](./socket.md#where-absence-is-the-contract) in socket.md. Reviving a name listed there unlocks something that was deliberately sealed.
2. **Touch the composition root — only when needed.** On the socket axis, `auth`, `join`, `place`, `user` and `cloud` are assembled by `socketFactory` as object literals, so a line has to be added there. Every other socket domain and all of the HTTP domains pass their gateway through whole, so **the factory stays untouched**.
3. **Add the method to the data source** — both the `I*` interface and the class. Map to the domain model here if one exists; if mapping would drop a value the caller needs (session material), pass it through raw and leave the reason in a comment.
4. **Expose it on the repository** — capture the scope with `getRequestContext()` before calling remote, and pass that context down to the data source. If the result is written to local, write it under the captured context.
5. **Add tests** — the data source test is the smallest unit. On the socket axis, add a `jest.fn()` for the new action to `createMockSocketGateways` as well (a cast keeps the type checker from catching a missing one).

The barrel needs no changes. `index.ts` is `export *`, so new symbols leave on their own.

**For a new domain** three more places apply — the key in `SocketGatewayBundle` (or `HttpGatewayBundle`),
the `SocketDataSources` interface plus its construction line in `createSocketDataSources`, and
`buildRepositories` and `dispose()` in `repositories/index.ts`.

### What not to do

- **Call a data source or a gateway from the UI.** Call a repository (ADR-0036).
- **Render a remote response directly.** Reads always come from a local stream. Write the remote return value to local, and let the screen see what `observe*` re-emits.
- **Read the context after the response arrives.** Capture it right before the request. During a cloud switch a late response will otherwise poison the current scope.
- **Wrap errors.** The status code is the input to classification upstream. The report lane especially.
- **Call `remote` from `local`.** The one thing that joins the two axes is a repository.

## Naming history

This layer was renamed once. When a document written with the old names turns up, read it through the
table below. **The bodies of past ADRs are left alone** — they are records of their moment.

### 2026-09-01 — the socket axis moved to a `Socket` prefix

`remote` is the axis (the opposite of local) and the names under it say the transport. The socket axis
used to claim `Remote` while only HTTP said `Http`, which made the classes in
`remote/http-data-sources/` read as "the thing that is not remote". Moving the socket axis to `Socket`
made the two symmetric. The HTTP axis did not change by a single character.

| Before                                              | Now                                                           |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `remote/data-sources/`                              | `remote/socket-data-sources/`                                 |
| `XxxRemoteDataSource` · `IXxxRemoteDataSource`      | `XxxSocketDataSource` · `IXxxSocketDataSource`                |
| `RemoteDataSources` · `createRemoteDataSources`     | `SocketDataSources` · `createSocketDataSources`               |
| `RemoteGatewayBundle`                               | `SocketGatewayBundle`                                         |
| `XxxDomainGateway` (socket)                         | `XxxSocketDomainGateway`                                      |
| `MockRemoteGateways` · `createMockRemoteGateways`   | `MockSocketGateways` · `createMockSocketGateways`             |
| app-runtime `factories/remoteFactory.ts`            | `factories/socketFactory.ts`                                  |
| app-runtime `createHttpDataSourceBundle`            | `createHttpDataSources`                                       |
| `SocketsRemoteDataSource` · bundle key `sockets`    | `ConnectionSocketDataSource` · bundle key `connection`        |
| `SocketDomainGateway`                               | `ConnectionSocketDomainGateway`                               |
| `gateways/index.ts` (socket types + http re-export) | `gateways/socket.ts` ‖ `gateways/http.ts` + barrel `index.ts` |

### 2026-09-14 — the `V2` suffix is gone

V1 had been gone for a long time while the whole data layer still carried `V2`, in directory names and
identifiers alike — and `libs/app-runtime` already used the V2-free names, so the boundary between the
two forced an import alias. Removing the suffix closed that split
([ADR-0081](../../../../docs/adr/0081-libs-data-doc-canon-and-layer-flattening.md) decisions 4 and 5).

| Before                                             | Now                                            |
| -------------------------------------------------- | ---------------------------------------------- |
| `repositories-v2/`                                 | `repositories/`                                |
| `local/data-sources-v2/`                           | `local/data-sources/`                          |
| `XxxRepositoryV2` · `IXxxRepositoryV2`             | `XxxRepository` · `IXxxRepository`             |
| `BaseRepositoryV2` · `DisposableRepositoryV2`      | `BaseRepository` · `DisposableRepository`      |
| `createRepositoriesV2`                             | `createRepositories`                           |
| `DataRepositoriesV2` · `DataRepositoriesV2Options` | `DataRepositories` · `DataRepositoriesOptions` |
| `XxxLocalDataSourceV2` · `IXxxLocalDataSourceV2`   | `XxxLocalDataSource` · `IXxxLocalDataSource`   |
| `BaseLocalDataSourceV2` · `ILocalDataSourceV2`     | `BaseLocalDataSource` · `ILocalDataSource`     |
| `LocalDataSourcesV2` · `createLocalDataSourcesV2`  | `LocalDataSources` · `createLocalDataSources`  |

`V2` that has nothing to do with the data layer (`ClientSocketV2`, `registerUserV2`,
`RegisterUserV2Body`, `useWebSocketV2`, …) was never in scope and is untouched. So is the
`apps/admin-v2` path.

Two things moved in `libs/app-runtime` alongside it. `factories/repositoryFactory.ts` is gone — it was
a 30-line shell whose only job was renaming `contextProvider` to `context`, and once both sides said
`createRepositories` it would have collided with the thing it wrapped; `DataManager` now calls
`@chatic/data`'s `createRepositories` directly. `factories/localFactory.ts` stays, and **so does its
import alias** (`createLocalDataSources as createDataLocalDataSources`): ADR-0081 expected the alias to
disappear with the suffix, but app-runtime's own `createLocalDataSources` — the one that does storage
routing — now has exactly the same name, so the collision is real regardless of `V2`.
