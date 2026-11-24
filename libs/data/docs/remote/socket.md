# remote/socket — the socket axis

> Status: Live · Last updated: 2026-11-24 · Shared contract in the [remote README](./README.md) · Canonical code: [gateways/socket.ts](../../src/remote/gateways/socket.ts) · [socket-data-sources/](../../src/remote/socket-data-sources/)

The remote axis that uses socket transport. It has 14 domains. For the HTTP axis see [http.md](./http.md).

## Layout

```text
remote/
  gateways/socket.ts       SocketGatewayBundle + per-domain Pick<>
  socket-data-sources/     14 SocketDataSources + createSocketDataSources
```

Bundle keys are **app-side domain names**, not wire module names. Just as `join` folds in `chat.read`, and
`place` pulls in `user.mySite`, `connection` binds to the wire module `sockets`
(action `sockets/find-connection`). The wire name survives in exactly one line — `socketFactory`'s
`createDomainGateway('sockets', …)`.

## Gateway mapping

`gateways/socket.ts` picks only the capabilities each socket domain uses and builds a domain gateway
type from them. Some domains bundle several source gateways (`join`, `place`, `user`).

| Domain gateway                  | Type definition                                                                                                                                                                                                                                                                                                    | Consumed by                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `AuthSocketDomainGateway`       | `Pick<AuthGateway, 'linkAccount'>`                                                                                                                                                                                                                                                                                 | `AuthSocketDataSource`       |
| `ChannelSocketDomainGateway`    | `Pick<ChannelGateway, 'mine' \| 'sync' \| 'update' \| 'delete' \| 'create' \| 'invite' \| 'leave' \| 'getSelf' \| 'startDm'> & { get }` — `channel.get` has no typed SDK wrapper, so the composition root binds it through `createDomainGateway('channel').request('get', …)`                                      | `ChannelSocketDataSource`    |
| `ChatSocketDomainGateway`       | `Pick<ChatGateway, 'send' \| 'feed' \| 'get' \| 'update' \| 'delete' \| 'reaction'>`                                                                                                                                                                                                                               | `ChatSocketDataSource`       |
| `JoinSocketDomainGateway`       | `Pick<JoinGateway, 'update'> & Pick<ChatGateway, 'read'>`                                                                                                                                                                                                                                                          | `JoinSocketDataSource`       |
| `PlaceSocketDomainGateway`      | `Pick<PlaceGateway, 'create' \| 'update' \| 'delete' \| 'leave' \| 'get'> & Pick<UserGateway, 'mySite'>`                                                                                                                                                                                                           | `PlaceSocketDataSource`      |
| `UserSocketDomainGateway`       | `Pick<ChannelGateway, 'listUser' \| 'syncUsers'> & Pick<UserGateway, 'update' \| 'profile' \| 'invite' \| 'inviteBatch' \| 'listDevice' \| 'unlinkDevice'> & { listPlaceUser }` — `listPlaceUser` is `PlaceGateway.listUser` (`place.list-user`), renamed because `listUser` already names the channel roster here | `UserSocketDataSource`       |
| `InviteSocketDomainGateway`     | `Pick<InviteGateway, 'create' \| 'get' \| 'list' \| 'accept' \| 'cancel' \| 'reject'>`                                                                                                                                                                                                                             | `InviteSocketDataSource`     |
| `DeviceSocketDomainGateway`     | `Pick<DeviceGateway, 'save' \| 'read' \| 'sync' \| 'updateRemote'>` — enters the bundle as a `RoutedGateway<>`                                                                                                                                                                                                     | `DeviceSocketDataSource`     |
| `CloudSocketDomainGateway`      | `Pick<CloudGateway, 'update' \| 'get'>`                                                                                                                                                                                                                                                                            | `CloudSocketDataSource`      |
| `ProfileSocketDomainGateway`    | `Pick<ProfileGateway, 'get' \| 'getMine' \| 'set' \| 'sync'>`                                                                                                                                                                                                                                                      | `ProfileSocketDataSource`    |
| `ConnectionSocketDomainGateway` | `Pick<DomainGateway, 'request'>`                                                                                                                                                                                                                                                                                   | `ConnectionSocketDataSource` |
| `UploadSocketDomainGateway`     | `Pick<UploadGateway, 'start' \| 'complete'>`                                                                                                                                                                                                                                                                       | `UploadSocketDataSource`     |
| `MiniAppSocketDomainGateway`    | `Pick<MiniAppGateway, 'list' \| 'create' \| 'update' \| 'delete'>` (all of it)                                                                                                                                                                                                                                     | `MiniAppSocketDataSource`    |

Design points:

- **Join** takes `join.update` from the first-class `JoinGateway` and folds in `chat.read`. Nothing in the app reads a single join or joins a channel through this layer, so `join.get` and `channel.join` are left out.
- **Place** adds `UserGateway.mySite` for listing on top of `PlaceGateway`'s `create` / `update` / `delete` / `leave` / `get`. `get` is read for one question only — whether a place has been deleted (404). `leave` is `place.leave`, one action for two callers: with `id` alone I leave the place, with a `userId` as well the place owner removes that member. The Site domain was unified into Place, and the physical cache slot reuses the existing `site` ([scope and cache slots](../local/README.md#scope-and-cache-slots)).
- **Cloud** exposes `get` / `update` only. `cloud.create` and `cloud.delete` are not in the bundle — a cloud is made and released over HTTP. Both are pinned to the relay → [routing](#routing--where-a-call-is-sent).
- **User** includes the account profile (`user.profile`). The site (place) profile is a separate domain, owned entirely by `ProfileSocketDomainGateway`.
- **User** also takes `place.list-user`, as `listPlaceUser`. The bundle a call joins is decided by what it answers, not by its wire module: the place's members are users, as `channel.list-user`'s are, so both sit here rather than under Place (which in turn takes `user.mySite` because that answers places).
- **User** also takes my own devices — `user.list-device` and `user.unlink-device`. They go to the **active** slot with the rest of the bundle, not to the relay: on a cloud, the devices that matter are the ones signed in to that cloud, and the relay's list would show someone working there the wrong set. `device.update-remote` is pinned to the relay for the opposite reason (push settings live behind the relay), so the two must not be folded together. Both answers are the SDK views (`UserListDeviceView`, `UserUnlinkDeviceView`) passed through — nothing caches a device row.
- **Auth**'s `linkAccount` is the unified account-proof packet: phone/email/social × link/login × send/resend/verify/confirm in one. Three things are left out of it, all deliberately → [where absence is the contract](#where-absence-is-the-contract).
- **Connection**'s bundle key is `connection` while its wire module is `sockets` (action `sockets/find-connection`).
- **Upload** exposes `start` / `complete` only → [upload](#upload).
- **Chat's `send` takes `-lib`'s `ChatSendInput`.** `@lemoncloud/chatic-sockets-api` and `-lib` both export a type of that name, and only `-lib`'s carries `uploadIds`. Importing the `-api` one still compiles — it just drops attachments from every caller's type — so `domain/mention.ts` imports it from `-lib` on purpose and wraps it in `ChatSendPayload`, which adds the `mention` the chats service takes on `chat.send` and the SDK type does not declare yet. `ChatSocketDataSource` and `ChatRepository` take that wrapper, and the payload goes to the socket as it is.
- **Webhook** is the channel owner's management of the channel's webhooks → [webhook](#webhook).
- **Mini app** is the open cloud's list of mini apps → [mini app](#mini-app).

### Upload

`upload.start` declares the slots of an image message and answers one ticket per slot — a presigned
PUT for the original and, when a thumbnail was declared, one for it. `upload.complete` settles the
slots, failed transfers included, and answers each upload's final status. `upload.read` is left out:
it is owner-only, and `complete` already says everything the send sequence needs.

Two things differ from every other data source here:

- **It maps nothing and caches nothing.** A ticket holds signed URLs, which must not be stored, and
  the message row — not the upload — is what a screen renders. `ChatRepository.startUploads` /
  `completeUploads` pass it straight through.
- **It checks the answer's shape.** The answers are typed by the upload contract the SDK re-exports,
  but the gateway returns them unchecked, so `UploadSocketDataSource` runs each answer through the
  guard in `uploads/types.ts`. An answer that breaks the contract rejects the operation — see
  [the answer guard](../uploads/README.md#the-answer-guard).

### Webhook

`webhook.list` / `make-token` / `update` / `delete` manage the tokens a service uses to post into a
channel. They go to the **active** slot: a webhook belongs to the cloud that owns the channel, like
`channel.*`. The SDK's `webhook.get` (the channel root) is not used — `make-token` already returns
the endpoint to post to as `Location`.

- **The answers are SDK pass-through** (`unknown` on the gateway); `WebhookSocketDataSource` types
  them as `WebhookWireView` and `WebhookRepository` maps them to `DomainWebhook`.
- **The secret is returned once.** `make-token` answers with `Token` on that response only; later reads
  never carry it. `WebhookRepository` has no cache and hands the token back on `DomainIssuedWebhook`
  alone, so no store, cache or log in the data layer ever holds it — a screen keeps it in its own state
  for as long as the issue dialog is open and drops it.
- **`false` and `0` are meaningful.** `update` sends `disabled: false` to resume and `expiresAt: 0` for
  "never", so the repository passes them through instead of dropping falsy values.
- **Only owners are served.** A caller who is not the channel owner is refused by the server; the
  screens hide the section for them rather than showing a failing control.

### Mini app

`miniapp.list` / `create` / `update` / `delete` read and write the open cloud's mini apps — a list of
names and https addresses, up to 10. They go to the **active** slot: the list belongs to the cloud
server the session is connected to, so the cloud is the connection, not an argument. The relay keeps
no list of a customer cloud's mini apps (it answers with its own whatever cloud is asked for), so
nothing here goes over HTTP. `CloudRepository` keeps the cloud id in its four method signatures for
the screens and drops it here. The single link on the cloud record (`fetchMiniAppUrl` /
`saveMiniAppUrl`) is a different thing and stays on the HTTP axis.

- **The list is the server's, in its order, with every status.** An `inactive` (owner turned it off)
  or `held` (an admin holds it) mini app is returned like an `active` one; what a member may see is
  the screen's filter. A missing or unknown `status` reads as `inactive` — reading it as `active`
  could open a held mini app — and an entry without an `id` is dropped. `page` and `limit` are not
  sent: the cap is 10, the server's page size.
- **The wire types are declared in `MiniAppSocketDataSource.ts`.** The SDK leaves the answers as
  `unknown` (they belong to the backend types this app is pinned below), so `MiniAppWireView` names
  only the fields the app reads. The answer also carries `uid` (who added it); nothing reads it yet.
- **`enabled` is the owner's switch** (`state$.use === 'on'`); `status` is what to show. A held mini
  app can be enabled and still not `active`, so screens branch on `status`.
- **Bodies are built field by field, never by spreading a read mini app.** The server refuses a
  non-admin body in which `state$.hold` exists at all, even empty, and a read view carries it — the
  SDK's input type allows `hold`, so the data source builds a fresh `{ use }`. Adding without
  `enabled` sends no `state$` (the server's default, on); an empty update is refused before anything
  is sent.
- **Nothing is checked here.** Names and addresses go as given — the server trims them, and checking
  them before a save is the screen's job, with the same rule the server applies.
- **A refusal becomes a save-rule reason** (`miniAppSaveRefused.ts`). The SDK rejects a server error as
  `new Error('<server message> - <type>')`, so the status is the number leading the text. A 400 for a
  missing or too-long name, an address that cannot be opened (or none), or the hub's own address; a
  409 for the eleventh; and a 403 `NOT ALLOWED - action[update|delete]` for changing or removing a
  mini app someone else added — reject with `MiniAppSaveRefused`, `problem` `nameMissing` ·
  `nameTooLong` · `invalidUrl` · `hubUrl` · `tooMany` · `notAllowed`. Adding, updating and removing
  all convert. The reason is read from the status and the fixed part of the message, never the whole
  message (the address and count are inside it), and `403 NOT ALLOWED - denied by policy` (a
  connection that is not signed in) is not `notAllowed`. Anything else — no place chosen yet, no such
  mini app (404), no socket, a server without these actions — rejects as it came. Each fixed part has
  a test line, but a server that rewords one is only noticed by running against it; until then that
  refusal surfaces as an ordinary error.
- **The reason survives the bridge.** Where the shell's runtime owns the session, a page's repository
  call crosses the bridge and arrives as a plain `Error` carrying only `name`, `message`, `code` and
  the HTTP fields. So `MiniAppSaveRefused` also carries the reason as `code` under the fixed `name`
  `'MiniAppSaveRefused'`, and `miniAppSaveProblemOf(error)` reads it from either side. Screens use
  that, not `instanceof`.
- **The cloud is whichever one is connected.** A request still out when the cloud switches can land
  on the new one; the screens key their queries by the cloud they asked for, so an answer never
  rewrites another cloud's list.

### Where absence is the contract

The socket bundle uses the **absence** of a `Pick<>` entry as a seal. Actions that are alive on the wire
are deliberately left out so that callers cannot reach them. The HTTP axis does not do this
([http.md's gateway Pick](./http.md#gateway-pick)).

| Left out                                | Why                                                                                                                                                                                                                                            | What keeps it out                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `auth.update`                           | It is the socket handshake, owned end to end by the SDK's `AuthController`. A second sender would authenticate a connection the controller does not know it authenticated, leaving its state machine reasoning about a session it did not open | @chatic/runtime `authUpdateAbsence.test.ts` |
| `auth.verifyHashAlias` · `attachSocial` | `linkAccount` replaced them. They remain on the wire as `@deprecated`, and the backend deletes them once the app has no call sites (ADR-0042)                                                                                                  | the absence from this `Pick` itself         |

Read this table before adding an action to the bundle. Reviving a name listed here unlocks something
that was deliberately sealed.

## Routing — where a call is sent

Most gateways are bound to a single active slot. There are two exceptions.

**① The composition root pins the slot.** `socketFactory` binds them to the relay client at construction
time. These are domains that must not follow the active cloud.

| Pinned                    | Slot    | Why                                                                                                                                                                                 |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.linkAccount`        | `relay` | The main user the identity packet resolves to lives in the central backend behind the relay (ADR-0089, ADR-0042)                                                                    |
| the whole `invite` bundle | `relay` | 1:1 DM invite codes are issued and redeemed on the relay (ADR-0089)                                                                                                                 |
| the whole `cloud` bundle  | `relay` | A cloud's name lives on its catalog row, which the relay's backend owns. A cloud server's own copy of that row is never synced with it, so neither `get` nor `update` is sent there |

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
[the transport's slot-pinned routing](../../../transport/docs/socket/README.md).

## Calls by SocketDataSource

| SocketDataSource             | Public methods → gateway call                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthSocketDataSource`       | `sendPhoneCode()` · `verifyPhoneCode()` · `confirmPhoneCode()` · `verifySocialAccount()` · `confirmSocialAccount()` (all `auth.linkAccount`; assembling `type`/`mode`/`step` is this layer's monopoly)                                                                                                                                                                  |
| `ChannelSocketDataSource`    | `fetchChannel()`, `syncChannel()`, `createChannel()`, `startDm()`, `updateChannel()`, `deleteChannel()`, `inviteChannel()`, `leaveChannel()`, `getSelfChannel()`                                                                                                                                                                                                        |
| `ChatSocketDataSource`       | `sendChat()`, `fetchChat()`, `getChat()`, `updateChat()`, `deleteChat()`, `setReaction()` (`chat.reaction`)                                                                                                                                                                                                                                                             |
| `JoinSocketDataSource`       | `updateJoin()` (`join.update`), `readChat()` (`chat.read`)                                                                                                                                                                                                                                                                                                              |
| `PlaceSocketDataSource`      | `fetchPlace()` (`user.mySite`, the list), `createPlace()`, `updatePlace()`, `deletePlace()`, `leavePlace()` (`place.leave` — the answer is returned as it came, `leftChannelIds` and all), `getPlace()` (`place.get`)                                                                                                                                                   |
| `UserSocketDataSource`       | `fetchUsers()` (`channel.listUser`), `fetchPlaceUsers()` (`place.listUser` — one page, `photo` moved to `thumbnail`), `syncChannelUsers()` (`channel.syncUsers`), `getMyProfile()` (`user.profile`), `updateProfile()` (`user.update`), `requestInvite()` (`user.invite`), `inviteBatch()`, `listDevices()` (`user.listDevice`), `unlinkDevice()` (`user.unlinkDevice`) |
| `InviteSocketDataSource`     | `listInvites()`, `createInvite()`, `getInvite()`, `acceptInvite()`, `cancelInvite()`, `rejectInvite()`                                                                                                                                                                                                                                                                  |
| `DeviceSocketDataSource`     | `saveDevice()` · `readDevice()` · `syncDevice()` (`active` slot), `updateRemoteDevice()` (pinned to `relay`)                                                                                                                                                                                                                                                            |
| `CloudSocketDataSource`      | `getCloud()`, `updateCloud()` (both pinned to `relay`)                                                                                                                                                                                                                                                                                                                  |
| `ProfileSocketDataSource`    | `get()`, `getMine()`, `set()`, `sync()`                                                                                                                                                                                                                                                                                                                                 |
| `ConnectionSocketDataSource` | `findConnection()` → `request('find-connection', payload)`                                                                                                                                                                                                                                                                                                              |
| `WebhookSocketDataSource`    | `list()` · `makeToken()` · `update()` · `delete()` (`webhook.*`, `active` slot)                                                                                                                                                                                                                                                                                         |
| `MiniAppSocketDataSource`    | `listMiniApps()` · `addMiniApp()` · `updateMiniApp()` · `removeMiniApp()` (`miniapp.*`, `active` slot)                                                                                                                                                                                                                                                                  |

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
