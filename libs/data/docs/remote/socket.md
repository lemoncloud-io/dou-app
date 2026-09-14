# remote/socket — the socket axis

> Status: Live · Last updated: 2026-09-14 · Shared contract in the [remote README](./README.md) · Canonical code: [gateways/socket.ts](../../src/remote/gateways/socket.ts) · [socket-data-sources/](../../src/remote/socket-data-sources/)

The remote axis that uses socket transport. It has 11 domains. For the HTTP axis see [http.md](./http.md).

## Layout

```text
remote/
  gateways/socket.ts       SocketGatewayBundle + per-domain Pick<>
  socket-data-sources/     11 SocketDataSources + createSocketDataSources
```

Bundle keys are **app-side domain names**, not wire module names. Just as `join` merges `chat.read` and
`channel.join`, and `place` pulls in `user.mySite`, `connection` binds to the wire module `sockets`
(action `sockets/find-connection`). The wire name survives in exactly one line — `socketFactory`'s
`createDomainGateway('sockets', …)`.

## Gateway mapping

`gateways/socket.ts` picks only the capabilities each socket domain uses and builds a domain gateway
type from them. Some domains bundle several source gateways (`join`, `place`, `user`).

| Domain gateway                  | Type definition                                                                                                               | Consumed by                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `AuthSocketDomainGateway`       | `Pick<AuthGateway, 'linkAccount'>`                                                                                            | `AuthSocketDataSource`       |
| `ChannelSocketDomainGateway`    | `Pick<ChannelGateway, 'mine' \| 'sync' \| 'update' \| 'delete' \| 'create' \| 'invite' \| 'leave' \| 'getSelf' \| 'unreads'>` | `ChannelSocketDataSource`    |
| `ChatSocketDomainGateway`       | `Pick<ChatGateway, 'send' \| 'feed' \| 'get' \| 'update' \| 'delete' \| 'reaction'>`                                          | `ChatSocketDataSource`       |
| `JoinSocketDomainGateway`       | `JoinGateway & Pick<ChatGateway, 'read'> & Pick<ChannelGateway, 'join'>`                                                      | `JoinSocketDataSource`       |
| `PlaceSocketDomainGateway`      | `Pick<PlaceGateway, 'create' \| 'get' \| 'update' \| 'delete'> & Pick<UserGateway, 'mySite'>`                                 | `PlaceSocketDataSource`      |
| `UserSocketDomainGateway`       | `Pick<ChannelGateway, 'listUser' \| 'syncUsers'> & Pick<UserGateway, 'update' \| 'profile' \| 'invite' \| 'inviteBatch'>`     | `UserSocketDataSource`       |
| `InviteSocketDomainGateway`     | `Pick<InviteGateway, 'create' \| 'get' \| 'list' \| 'accept' \| 'cancel' \| 'reject'>`                                        | `InviteSocketDataSource`     |
| `DeviceSocketDomainGateway`     | `Pick<DeviceGateway, 'save' \| 'read' \| 'sync' \| 'updateRemote'>` — enters the bundle as a `RoutedGateway<>`                | `DeviceSocketDataSource`     |
| `CloudSocketDomainGateway`      | `Pick<CloudGateway, 'update' \| 'get' \| 'delete'>`                                                                           | `CloudSocketDataSource`      |
| `ProfileSocketDomainGateway`    | `Pick<ProfileGateway, 'get' \| 'getMine' \| 'set' \| 'sync'>`                                                                 | `ProfileSocketDataSource`    |
| `ConnectionSocketDomainGateway` | `Pick<DomainGateway, 'request'>`                                                                                              | `ConnectionSocketDataSource` |

Design points:

- **Join** takes the first-class `JoinGateway` (single-item `join.get` / `join.update`) and folds in two helper commands (`chat.read`, `channel.join`).
- **Place** adds `UserGateway.mySite` for listing on top of `PlaceGateway`'s CRUD. The Site domain was unified into Place, and the physical cache slot reuses the existing `site` ([scope and cache slots](../local/README.md#scope-and-cache-slots)).
- **Cloud** exposes `get` / `update` / `delete` only. `cloud.create` is not in the bundle.
- **User** includes the account profile (`user.profile`). The site (place) profile is a separate domain, owned entirely by `ProfileSocketDomainGateway`.
- **Auth**'s `linkAccount` is the unified account-proof packet: phone/email/social × link/login × send/resend/verify/confirm in one. Three things are left out of it, all deliberately → [where absence is the contract](#where-absence-is-the-contract).
- **Connection**'s bundle key is `connection` while its wire module is `sockets` (action `sockets/find-connection`).

### Where absence is the contract

The socket bundle uses the **absence** of a `Pick<>` entry as a seal. Actions that are alive on the wire
are deliberately left out so that callers cannot reach them. The HTTP axis does not do this
([http.md's gateway Pick](./http.md#gateway-pick)).

| Left out                                | Why                                                                                                                                                                                                                                            | What keeps it out                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `auth.update`                           | It is the socket handshake, owned end to end by the SDK's `AuthController`. A second sender would authenticate a connection the controller does not know it authenticated, leaving its state machine reasoning about a session it did not open | app-runtime `authUpdateAbsence.test.ts` |
| `auth.verifyHashAlias` · `attachSocial` | `linkAccount` replaced them. They remain on the wire as `@deprecated`, and the backend deletes them once the app has no call sites (ADR-0042)                                                                                                  | the absence from this `Pick` itself     |

Read this table before adding an action to the bundle. Reviving a name listed here unlocks something
that was deliberately sealed.

## Routing — where a call is sent

Most gateways are bound to a single active slot. There are two exceptions.

**① The composition root pins the slot.** `socketFactory` binds them to the relay client at construction
time. These are domains that must not follow the active cloud.

| Pinned                    | Slot    | Why                                                                                                              |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `auth.linkAccount`        | `relay` | The main user the identity packet resolves to lives in the central backend behind the relay (ADR-0033, ADR-0042) |
| the whole `invite` bundle | `relay` | 1:1 DM invite codes are issued and redeemed on the relay (ADR-0033)                                              |

**② `RoutedGateway` lets the destination be chosen at call time.** Only `device` uses this. The same
gateway is bound once per slot, and the data source picks the destination.

```ts
export type SocketRoute = 'active' | 'relay' | 'cloud';
export type RoutedGateway<G> = Record<SocketRoute, G>;
```

- `active` — the currently active slot (cloud when a cloud is active, else relay). The default.
- `relay` / `cloud` — that specific slot regardless of which is active.

`DeviceSocketDataSource` sends `save`, `read` and `sync` to `active`, and `updateRemote` to `relay`. The
destination is **pinned inside the data source rather than exposed to callers** — push settings are
relay-owned by contract (pushes-api sits behind the relay), so exposing a route would only create a path
for a silent leak to the active cloud. Re-open a route parameter when a second, genuinely
caller-dependent destination appears.

The wiring itself belongs to
[app-runtime's kind-scoped-routing](../../../app-runtime/docs/socket/kind-scoped-routing.md).

## Calls by SocketDataSource

| SocketDataSource             | Public methods → gateway call                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthSocketDataSource`       | `sendPhoneCode()` · `verifyPhoneCode()` · `confirmPhoneCode()` · `verifySocialAccount()` · `confirmSocialAccount()` (all `auth.linkAccount`; assembling `type`/`mode`/`step` is this layer's monopoly)    |
| `ChannelSocketDataSource`    | `fetchChannel()`, `syncChannel()`, `createChannel()`, `updateChannel()`, `deleteChannel()`, `inviteChannel()`, `leaveChannel()`, `getSelfChannel()`, `getUnreads()`                                       |
| `ChatSocketDataSource`       | `sendChat()`, `fetchChat()`, `getChat()`, `updateChat()`, `deleteChat()`, `setReaction()` (`chat.reaction`)                                                                                               |
| `JoinSocketDataSource`       | `getJoin()` (`join.get`), `updateJoin()` (`join.update`), `readChat()` (`chat.read`), `joinChannel()` (`channel.join`)                                                                                    |
| `PlaceSocketDataSource`      | `fetchPlace()` (`user.mySite`, the list), `createPlace()`, `getPlace()`, `updatePlace()`, `deletePlace()`                                                                                                 |
| `UserSocketDataSource`       | `fetchUsers()` (`channel.listUser`), `syncChannelUsers()` (`channel.syncUsers`), `getMyProfile()` (`user.profile`), `updateProfile()` (`user.update`), `requestInvite()` (`user.invite`), `inviteBatch()` |
| `InviteSocketDataSource`     | `listInvites()`, `createInvite()`, `getInvite()`, `acceptInvite()`, `cancelInvite()`, `rejectInvite()`                                                                                                    |
| `DeviceSocketDataSource`     | `saveDevice()` · `readDevice()` · `syncDevice()` (`active` slot), `updateRemoteDevice()` (pinned to `relay`)                                                                                              |
| `CloudSocketDataSource`      | `getCloud()`, `updateCloud()`, `deleteCloud()`                                                                                                                                                            |
| `ProfileSocketDataSource`    | `get()`, `getMine()`, `set()`, `sync()`                                                                                                                                                                   |
| `ConnectionSocketDataSource` | `findConnection()` → `request('find-connection', payload)`                                                                                                                                                |

`syncDevice()` is the only one that returns `void`. It is a fire-and-forget signal and does not wait for
a response.

## Testing

The socket axis has a shared mock that hands back the whole bundle at once.

```ts
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';

let mockGateways: MockSocketGatewayBundle;
let dataSource: ChatSocketDataSource;
const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

beforeEach(() => {
    mockGateways = createMockSocketGateways();
    dataSource = new ChatSocketDataSource(mockGateways.chat);
});

it('sends the chat.send action when sendChat is called', async () => {
    await dataSource.sendChat(payload, context);
    expect(mockGateways.chat.send).toHaveBeenCalledWith(payload);
});
```

Two things to watch.

- The mock ends in an `as unknown as MockSocketGatewayBundle` cast. That means **adding an action to the bundle will not make the type checker flag the mock that is missing it.** When a gateway grows, grow the mock with it.
- `device` carries three slots (`active`/`relay`/`cloud`), each its own `jest.fn()`. To assert routing, look at the mock for the slot you expect.

## Client-side request limits

Callers of a `SocketDataSource` have to be aware of the socket client's client-side backpressure. These
values are owned by `@lemoncloud/chatic-sockets-lib` and **cannot be confirmed from this repo** — what
follows is a consumer's reference; go to that lib when you need exact numbers. Interpreting the outcome
of a call (a reject especially) is the `libs/data` caller's job, which is why this stays here.

| Item                 | Default | Note                                                                     |
| -------------------- | ------- | ------------------------------------------------------------------------ |
| Concurrent in-flight | 32      | Anything beyond this goes pending                                        |
| Pending allowance    | 512     | Waits while in-flight is saturated                                       |
| Request timeout      | 30s     | The client times out when the server does not answer                     |
| Client-side 429      | —       | Past the pending allowance the client rejects, independent of the server |

A client-side 429 is not a server HTTP 429. Sync-loop requests share the same in-flight slots, so callers
have to handle the two kinds of reject separately.
