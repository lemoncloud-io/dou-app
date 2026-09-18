# remote/http — the HTTP axis

> Status: Live · Last updated: 2026-09-14 · Shared contract in the [remote README](./README.md) · Canonical code: [gateways/http.ts](../../src/remote/gateways/http.ts) · [http-data-sources/](../../src/remote/http-data-sources/)

The remote axis that uses HTTP transport. It has 5 domains. For the socket axis see
[socket.md](./socket.md).

It is the **same file layout and the same pattern** as the socket axis — the same file placement, the
same constructor injection, the same single view→domain boundary. It takes **types only** from
`@chatic/http`.

## Layout

```text
remote/
  gateways/http.ts         HttpGatewayBundle + per-domain Pick<>
  http-data-sources/       5 HttpDataSources + createHttpDataSources
    httpUserMapping.ts     the bridge from the HTTP axis UserView to DomainUser
```

## gateway Pick

`HttpGatewayBundle` in `gateways/http.ts` has 5 domains.

| Domain gateway                  | Picked from                                                                                                                                                                                                                                       | Consumed by                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `AuthHttpDomainGateway`         | `OAuthHttpGateway` — 12: `registerUser` · `registerUserV2` · `findAlias` · `verifyAlias` · `loginInvite` · `inviteInfo` · `registerDevice` · `login` · `verifyNativeToken` · `exchangeCode` · `delegateCloud` · `exchangeToken`                   | `AuthHttpDataSource`         |
| `UserHttpDomainGateway`         | `UserHttpGateway` — `list` · `tryProfile` · `updateProfile` · `registerDevice`                                                                                                                                                                    | `UserHttpDataSource`         |
| `CloudHttpDomainGateway`        | `CloudHttpGateway` — `list` · `update` · `make` · `release` · `verifyEmail`                                                                                                                                                                       | `CloudHttpDataSource`        |
| `SubscriptionHttpDomainGateway` | `SubscriptionHttpGateway` — `plans` · `validateGoogle` · `validateApple` · `receipts` · `receiptDetail` · `membership` · `validateMembership`, plus the admin console's `adminMemberships` · `updateMembershipByAdmin` · `adminClouds` (ADR-0101) | `SubscriptionHttpDataSource` |
| `ReportHttpDomainGateway`       | `ReportHttpGateway` — `reportIssue` · `uploadLogBatch` (all of it)                                                                                                                                                                                | `ReportHttpDataSource`       |

The point of `Pick<>` is that the consumer owns the contract. The socket bundle goes further and uses
**absence as a seal** — it leaves `@deprecated` packets out so callers cannot reach the old vocabulary
([where absence is the contract](./socket.md#where-absence-is-the-contract)).

**The HTTP auth bundle does not.** It carries every session-material action (`login`, `exchangeCode`,
`delegateCloud`, `exchangeToken`, `verifyNativeToken`, `registerDevice`). They used to be excluded —
"session material is not `data`'s to touch" — with `session/auth` driving `OAuthHttpGateway` directly
instead. That exclusion did not hold up: `AuthRepository` was already making a token-producing call on
the socket lane (`confirmPhoneCode` returns a `$token` that IS a new session). So rather than keep a
different rule per axis, the rule was made one.

What holds is the **rule**, not the absence. Nothing under `data/` reads a `Token`, writes to a store, or
flips auth state. Responses pass through raw, and the one caller that interprets and installs them is
`session/auth`.

Two are missing — `refreshCloudToken` and `refreshAuthToken` — and they **cannot be added**: the wire
vocabulary itself no longer has them (ADR-0070 decision 2). That absence is guarded by a test, not a
comment: `gateways/refreshAbsence.spec.ts` in `@chatic/http`.

`ReportHttpDomainGateway` also takes everything. There is nothing on this gateway to withhold, and the
`Pick<>` remains only to keep the contract consumer-owned.

## Calls by HttpDataSource

| HttpDataSource               | Public methods → gateway call                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AuthHttpDataSource`         | `registerUser()` · `registerUserV2()` (the only two that map to `DomainUser`) · `findAlias()` · `verifyAlias()` · `loginWithInviteCode()` (`loginInvite`) · `fetchInviteInfo()` (`inviteInfo`) · `registerDevice()` · `login()` · `verifyNativeToken()` · `exchangeCode()` · `delegateCloud()` · `exchangeToken()` |
| `UserHttpDataSource`         | `listRelayUsers()` (`list`) · `tryFetchProfile()` (`tryProfile`) · `updateProfileHttp()` (`updateProfile`) · `registerPushDevice()` (`registerDevice`)                                                                                                                                                             |
| `CloudHttpDataSource`        | `listClouds()` · `updateCloud()` · `makeCloud()` (`make`) · `releaseCloud()` (`release`) · `verifyEmail()`                                                                                                                                                                                                         |
| `SubscriptionHttpDataSource` | `fetchPlans()` (`plans`) · `validateGoogle()` · `validateApple()` · `fetchActiveSubscriptions()` (`receipts`) · `fetchReceiptDetail()` · `fetchMembershipInfo()` (`membership`) · `validateMembership()` · `fetchAdminMemberships()` · `updateMembershipByAdmin()` · `fetchAdminClouds()`                          |
| `ReportHttpDataSource`       | `submitIssue()` (`reportIssue`) · `uploadLogBatch()`                                                                                                                                                                                                                                                               |

In `AuthHttpDataSource`, only `registerUser` and `registerUserV2` map to `DomainUser`. The rest **pass
through untouched**, because mapping drops `Token` and `cloudId` and those two are exactly what the
caller came for. `loginWithInviteCode` is the clearest case.

Wire-level flag encoding is this layer's monopoly. `makeCloud`'s `dryRun`, `releaseCloud`'s `cascade`
and `updateMembershipByAdmin`'s `auto` all work this way. The caller says `{ dryRun: true }` and never
learns that the relay spells it `1`.

## HttpDataSource and cache semantics

An `HttpDataSource` has the same shape as a socket data source — `implements I*`, gateway injected
through the constructor, one view→domain boundary. One thing differs.

**The HTTP family never writes to the local cache.** It does no mirroring of the kind the socket side's
`getCloud` does with `persistCloud`. The catalogue's cache owner is a react-query adapter on the
consumer side.

`CloudHttpDataSource` has a second reason. The catalogue list mixes invited and owned clouds, and
`CloudRepository.resolveCloudType` would default every new entry to `'owner'`. Writing it to the cache
would put the wrong label on invited clouds.

It takes `context: DataContext` for the same reason a socket data source does — to pin the request-time
context so a late response cannot poison a scope that has since switched. Since the HTTP catalogue holds
no cache, that is mapping metadata today; but keeping the signature symmetric means the interface will
not change when cache semantics arrive.

`SubscriptionHttpDataSource` has no domain model yet. Views pass through unchanged (alias-level). A real
`DomainProduct` / `DomainMembership` / `DomainReceipt` mapping is future work, not something this data
source should invent.

`UserHttpDataSource` carries one more interface split. The consumer of device registration is the device
repository, so `IDeviceRegistrationHttpSource` (a single `registerPushDevice`) is declared separately and
`IUserHttpDataSource` extends it. A repository constructor always takes only the interface it uses — the
device repository takes the narrow one, the user repository the wide one.

## The admin console surface

`apps/admin-v2`'s reads hang off `SubscriptionHttpDataSource` (ADR-0101). Two things differ from the
normal path.

**① `fetchAdminClouds` rides the subscription bundle rather than the cloud one** — even though clouds
have a repository of their own. Going through `CloudHttpDataSource` would map with
`toDomainCloud(view, context)` using the **current session's** context, and `resolveCloudType` would then
label ownership relative to the viewer. Every row an admin lists belongs to somebody else, so that
classification would be quietly wrong. Passing through here keeps the views raw, and keeps the `aggr`
that a domain list result drops.

**② There is a per-call endpoint override.** `AdminEndpointOptions.endpoint` names the relay base.

```ts
export interface AdminEndpointOptions {
    /** Full relay base, e.g. `https://api.example.com/v1`. */
    endpoint?: string;
}
export interface AdminOverrideOptions extends AdminEndpointOptions {
    auto?: boolean;
}
```

**Only the admin calls accept it.** The app's own calls must never leave the relay they were
authenticated against, so this is opt-in per call rather than a mode on the client.

## The two `UserView` types are not assignable to each other

The HTTP axis has one trap in its user mapping. `toDomainUser` (`domain/mappers.ts`) is typed against the
socket axis's `UserView` (`@lemoncloud/chatic-socials-api`), while the same-named type on the HTTP/OAuth
axis (`@lemoncloud/chatic-backend-api`) has a wider `stereo` union (`'#alias'`, `'session'`, `'#code'` —
OAuth-internal markers the socket domain never sees). The identity fields are the same, but the two are
**structurally not assignable**.

`toDomainUserFromHttp` in `http-data-sources/httpUserMapping.ts` joins them with an explicit cast — using
the existing mapper as a bridge rather than creating a new one. The day something needs to branch on the
`stereo` value is the signal to **give the HTTP axis its own `toDomainUser`**, not to widen the cast.

## The report lane

`ReportHttpDataSource` is this layer's exception. **It has no domain to map to and no cache slot.**
Diagnostics are not domain data, but they are a data call, so removing the last exception to ADR-0036's
"every data call goes through a repository" was the choice made (2026-09-02). It is a pass-through layer
— no mapping, no cache, no logging.

Four things changed character in the migration:

1. **A logging exception became a contract instead of a convention.** The commented rule "log upload picks an entry point that skips `withNetworkLog`" became the gateway's `bypass: ['networkLog']`. Callers no longer assemble the transport, so there is no room left to break the rule.
2. **`allowRecordError` is attached to `report-bulk`.** A `dropped` in a 200 body is the server's verdict on individual entries, not a failed call — promoting it through `throwIfApiError` would make the uploader resend a batch that was already accepted.
3. **The endpoint moved from a static env value to a dynamic relay.** The old constant read `WEB_DOU_ENDPOINT` (a build value); the gateway reads `resolveEndpoint('relay')`. The value is the same `DOU_ENDPOINT`; what changes is that the deep-link `?_backend` override now applies to reports too.
4. **One credential recovery was added.** `HttpClient.run` re-sends a request that failed on an expired signature, once, after reissuing. This is the path a flush actually takes after a long spell in the background. The recovery path does log, so "an upload failure produces no logs" holds for **the request itself** only (at most one entry per recovery attempt, no recursion).

Classification (`retry`/`discard`/`ok`) lives in `app-runtime/report/logBatch.ts` — the queue's
vocabulary (`UploadOutcome`) belongs to the logger pipeline and `data` has no reason to know it. So the
data source and the repository **throw errors as they are, without wrapping** (the status code is the
input to classification).

## Testing

The HTTP axis has no shared mock bundle. The `Pick<>`s are narrow enough that building one inline per
test is faster, and `jest.Mocked<>` catches a missing method (the socket axis's shared mock cannot,
because of its cast).

```ts
let gateway: jest.Mocked<CloudHttpDomainGateway>;
let dataSource: CloudHttpDataSource;
const context: DataContext = { cid: 'cloud-a', uid: 'me' };

beforeEach(() => {
    gateway = { list: jest.fn(), update: jest.fn(), make: jest.fn(), release: jest.fn(), verifyEmail: jest.fn() };
    dataSource = new CloudHttpDataSource(gateway);
});

it('listClouds — maps the wire list to DomainCloud[] and preserves total', async () => {
    gateway.list.mockResolvedValue({ list: [{ id: 'c1', name: 'A' }], total: 1 } as any);
    const result = await dataSource.listClouds({ page: 1 }, context);
    expect(gateway.list).toHaveBeenCalledWith({ page: 1 });
    expect(result.list).toMatchObject([{ id: 'c1', name: 'A', cid: 'cloud-a' }]);
});
```

There are three things to assert — which gateway method was called, that the arguments went through
unchanged (flag encoding included), and, where a domain mapping happened, that the `context` landed in
the result.

## REST hook consumers

ADR-0070's numbers are an overcount. Its context section put the consumption of six REST hooks at
`18·22·8·6·4·2`. Those are inflated.
`desktop-web` has **its own `useClouds` of the same name** wrapping `useCloudSessionCatalog`, and the two
were summed.

A full re-count by grep on 2026-08-27 put every hook in single digits, and `useVerifyNativeAppToken` at
zero — a deletion candidate rather than a migration target. That table is not reproduced here: consumers
have kept moving since the migration finished (`libs/web-core` split into four sibling libs in the
meantime), and a number nailed into a document makes its reader wrong. When the current value matters,
count it.
