# ADR-0323: A sub WebView page reads its cloud from the server, and its hello waits for the user

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/mini-app-runtime-chat-send`
> · Scope: `libs/runtime-core/src/bridge/subWebViewWhitelist.ts` (`cloud.getCloud`, the `false` argument
> guard); `libs/chatic-apps-sdk/src/runtime.ts` (`connect` without a timeout)
> · The behaviour is documented in [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md#runtime-reads-2260),
> [libs/runtime-core docs/bridge](../../libs/runtime-core/docs/bridge/README.md#a-sub-webview-page-a-whitelist-of-reads)
> and [libs/chatic-apps-sdk README](../../libs/chatic-apps-sdk/README.md)
> · Amends: [ADR-0320](./0320-a-sub-webview-page-reads-the-current-cloud-through-a-whitelist-of-runtime-requests.md)
> decisions 2–5 — `cloud.getCloud` is open with `{ cache: false }`, a fourth server read, 29 methods —
> and decision 11 — `connect()` waits for the user with no timeout

## Context

ADR-0320 opened the current cloud to a reviewed page through the app's runtime. Under the `cloud`
permission it opened the two cache reads, `cloud.cacheRead` and `cloud.observeItem`, held to the
current cloud's id, and it closed `cloud.getCloud` as a read that writes what it fetched into the cache.

On a device, a page opened in a cloud the user owns got `null` from both. The app names an owned cloud
from the relay catalog, and the catalog is never written into the cache, because it mixes owned and
invited clouds and would mislabel a row's type. So the cache holds an owned cloud only after something
read it from the server, and then only its name. A page asking "which cloud am I in" had no read that
answered it.

The same check found a second fault, in the library pages use. ADR-0320 decision 9 says the hello is
not answered until the user has answered the consent question. The library sent the hello with its
default ten-second request timeout, so `connect()` failed with `TIMEOUT` while the question was still
on screen, and the page had to ask again after the user said yes.

## Decision

1. **`cloud.getCloud` is open under `cloud`, as `({ id }, { cache: false })`.** With `cache: false` the
   read asks the server and writes nothing, so it meets ADR-0320's rule — read only, in what it does —
   by construction rather than by trust. Three argument guards hold it there: `id` must be the session's
   current cloud, the payload must not carry a `cid`, and the second argument must carry `cache` and
   it must be `false`. Without the option the read would write, so a page that leaves it out is
   refused (`RUNTIME_NOT_ALLOWED`, reason `guard`). It is a server read, inside the view's budget.
   What it answers crosses unfiltered, as ADR-0320 decision 1 has every allowed method answer: the
   relay's view of the cloud, which for a cloud the user owns carries its owner, verified email,
   linked account, subscription id, the cloud server's AWS account id (`accountNo`) and its service
   endpoints (`$envs`), and for any other cloud the relay's minimal `{ id, name, status }`.
2. **A new guard kind, `false`.** An argument's field must be present and be `false` — an option the
   page has to turn off itself. The runtime's own callers default to writing; the guard makes the page
   say otherwise in so many words.
3. **`connect()` has no timeout.** The library sends the hello as it sends `share` and a permission
   request: without a timeout, because it waits on a person. A hello the app never answers is the
   app's failure to report, not the page's to guess at.

## Alternatives

- **Write the catalog into the cache.** Rejected: that is the write the catalog's own rule forbids,
  for the type classification it would break.
- **Put the cloud's name in the session the page is handed.** Rejected: it changes the runtime
  contract for every reader of the session, and on a launch the app's runtime holds there is no catalog
  in the runtime to take the name from.
- **Cut the answer down to `{ id, name, status }` for this one entry.** Considered, since the owner's
  view carries fields the backend marks internal, and the session a page gets already leaves out the
  cloud server's addresses. Not taken: every allowed method answers the row the main web gets
  (ADR-0320 decision 1), a page needs consent and a reviewed origin to reach it, and none of those
  fields is a credential. A projection stays possible for this entry alone if that changes.
- **Leave the name to the launch parameters.** A page opened from the cloud's mini app list does get
  the cloud's id and name there, but a page opened another way does not, and a page whose reads are the
  runtime's should not need a second source for the cloud it reads.

## Consequences

- A page reads the cloud it is in with one server read, and the cache is no different afterwards. For a
  cloud the user owns, a page that holds `cloud` and the user's consent learns the cloud's linked
  account, subscription id and server details along with its name; the consent question names only
  "the cloud".
- The page needs the cloud's id for the read: from the session, which needs the `session`
  permission, or from the launch parameters when DoU opened the page from the cloud's mini app list.
- The whitelist's server reads are now four, and the spec typecheck lists them by name; a fifth has to
  be argued the same way.
- `connect()` can stay pending for as long as the consent question is up. A page that wants to show
  progress meanwhile does so itself. A page restored from the back-forward cache while it waits gets
  `DISCONNECTED` and connects again, since the reply would go to a host that is gone.
