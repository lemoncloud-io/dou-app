# account and invite reads — the relay account, memberships and invite codes

App-wide hooks that read or write the **relay account**, as opposed to whichever cloud is active. The
field-level contracts of account linking and the invite screens are in
[`feature/auth`](../feature/auth/account-linking.md) and [`feature/invite`](../feature/invite/README.md);
this page is the rules the hooks share.

## The account is the relay account, not the active cloud's user

- **`useMyUser` reads the stored relay token, not the user cache.** A cloud session mints a different uid on
  a different backend, and the local cache is keyed `<type>:<cid>:<uid>:<id>` and read under the live scope,
  so while a cloud is active the relay `user` row is out of the repositories' reach. The token is always
  present, always the relay account's, and carries name, photo, email and `link$`, so there is no cache to
  invalidate and no flash.
- Reactivity is the session signal: the session store hands back a fresh context object on each notify, so
  the token is re-read on a refresh and on the hook's own writes.
- A one-shot `user.profile` refresh catches an edit made on another device. It is pinned to the relay slot
  and waits for that slot to be verified (same gate as `useRelayInvites`), because the scoped client throws
  rather than falling back, and firing before the handshake threw `503 SOCKET NOT CONNECTED`. It sits in a
  try/catch because the slot can be torn down between render and effect, and skipping is the recovery
  (the token value is already on screen). Its response is written back into the token (patching the token
  is the update path), limited to the display fields in `ACCOUNT_FIELDS`: a slim response must not
  overwrite the auth carrier, an `undefined` field is dropped so an omission cannot erase it, and `null` is
  kept because it is the server saying "cleared".
- **`useIsAccountGuest` asks about the relay account** and reads the token directly rather than through
  `useMyUser`, which would send a second copy of the `user.profile` refresh on every visit to the My hub.
  `useRuntimeProfile().isGuest` is a different question (it reads the active token, i.e. the delegated cloud
  user), so account screens, and acts the relay account performs whichever cloud is open, use this hook,
  and screens asking what the user may do in the connected cloud (permissions, the room, home) keep using
  `useRuntimeProfile`. No relay account counts as a guest: the guest card invites a sign-in and recovers,
  while the signed-in card would render a row with no name.
- `useSeedMyUserCache` seeds the user cache from the active session profile only when there is no row, so
  `useRuntimeProfile` has something to emit on subscribe and never clobbers an edited value. It does not feed
  the My page.

## Guests have no catalog and no membership

`useCloudSessionCatalog` and `useMembership` answer a guest from a constant (`GUEST_CATALOG` and
`GUEST_MEMBERSHIP`) without a request: a guest cannot own a cloud or buy a membership, so the answer is
always empty.

- They answer instead of being disabled because callers read `isPending` and `hasCloudCatalog`, and the
  website hand-off waits for a membership that was _read_; a disabled query would leave them waiting for
  good, and `refetch` ignores `enabled` anyway.
- The guest's answer has its own query key, so signing in moves the query to the account's key rather than
  keeping the guest's empty list.
- The catalog and membership are react-query-only reads; nothing local backs them. The catalog mixes owned
  and invited clouds and would poison `cloudType` classification if it landed in the local cache.
- A membership receipt is validated only server-side when the membership is created or renewed; the client
  never calls the platform validators directly, which is why the purchase flow is `useValidateMembership`
  alone. Marking clouds for removal when the quota shrinks sends the final set (a cloud left out is
  unmarked, an empty list clears all), then invalidates both the cloud list and the membership.

## Linked credentials

- **`useLinkedAccounts` returns `'linked'`, `'unlinked'` or `'unknown'`.** `'unknown'` is the only honest
  answer when the profile has not landed yet, or when the server never built the `link$` slot (the backfill
  for older accounts may not have run). Collapsing it into `false` would ask a social user to link social
  (`403 type-linked`) or a phone user to verify a number they own. Treat it as a hint and fall back, never
  gate on it; the server's `verify` answer and a 409/403 from `confirm` are the real contract. It reads
  `link$` off the relay account because `auth.linkAccount`, the write it gates, is relay-pinned too.
- **`useLinkAccount`: the request declares intent, the response does not.** `mode: 'login'` promotes a
  device user and comes back with a token, so its confirmation belongs to the session
  (`runtime.session.confirmPhoneLogin`); this hook's `confirm` handles `link` only and returns no token.
  Callers choose the mode from the session role, which keeps the two mismatch errors (main user + login is
  400, device + link is 403) out of reach.
- `verify` never changes anything; it only reports `linkable` and a `reason`, so a linking screen can show
  that confirming is blocked. The login flow skips it and confirms directly.
- There is no "extend the timer" step: the extend action resends, which issues a new code and a new
  `expiredAt` but does not reset the wrong-answer counter.
- Rate limits (60 s cooldown, 10 a day per number, 20 a day per device, 5 wrong answers) all reject with
  429, a wrong code with 403, and a `login`-mode number that does not match the invite rejects at send time
  with 400 and dispatches no code. Read the status with `getSocketErrorCode`, never the message.
- Phone numbers and codes stay in the request body: never in logs or query keys. The send-versus-resend
  choice and the omitted-switch rule live in the repository, not the hook.

## Relay invites

**Sending (`useRelayInvites`, `useRelayInviteMutations`).**

- **A cache reader by default.** The hook renders the local invite cache (which `invite.list`,
  `invite.create` and `invite.cancel` all mirror into) and puts nothing on the wire unless the caller
  passes `remote` or `pollIntervalMs` (which implies it). Home mounts this for every user, and the old
  fetch-on-mount-and-focus default, doubled by the app's `retry: 1`, made it the most frequent relay-pinned
  read and the packet that surfaced every connection-auth desync as `401 UNAUTHORIZED - not authenticated`.
  Freshness for a cache reader comes from `useBackgroundSync` re-asking `invite.list`; a surface that needs
  its own cadence (the waiting screen) passes `pollIntervalMs`.
- **Poll through react-query, not a timer calling `refetch()`.** `refetch()` fires even for a disabled
  query, so a hand-rolled poll punches through the relay gate and hits the socket unauthenticated. The
  built-in interval is per observer and pauses in the background.
- **The query is enabled only when all three hold:** the relay slot is verified (re-fires on the
  false-to-true edge), the caller wants the server, and `enabled !== false`. The 1:1 room passes
  `enabled: false` for non-1:1 stereos so opening a group or self room does not fire `invite.list`.
  Standing down stops the work, but does not empty the return: react-query's data is per query, so a list
  another screen fetched still comes through.
- **`staleTime: 0` and focus refetch must stay together.** The app's `QueryClient` defaults to
  `staleTime: Infinity`, under which a focus refetch never fires. An invite changes on the recipient's
  device and no packet announces it, so coming back to the screen has to re-ask. The query is never retried
  (a retry would send two packets for a read the next edge re-asks anyway).
- **A guarded `refetch`.** The returned `refetch` waits up to 3 s for the relay handshake and, on timeout,
  answers from data already in hand instead of sending a doomed packet; the raw `query.refetch` produced
  `401` twice per tap under `retry: 1`. Cancel and re-issue taps need it because cache rows never carry the
  `code`.
- **Merge rule.** The server's response wins per id for server-owned fields and keeps its order; cache-only
  rows (outside the window, or not yet confirmed) follow in the cache's newest-first order. `dismissedAt`
  is local-only, so it is copied from the matching cache row, or a server refresh would erase a dismiss.
- **`INVITE_LIST_LIMIT` = 100** is explicit because the hook does not page: a sent invite beyond the
  server's default window would vanish and the re-invite check would offer the wrong copy.
- **Lifetime is applied centrally** (`INVITE_EXPIRES_DAYS` = 1, 24 hours) so a new invite and a re-invite
  cannot drift apart, and so a relay server that predates the 24 h default does not hand out a longer-lived,
  phone-bound link. Screens show the returned `expiredAt`, never the number.
- **Phone numbers go out as E.164.** The backend's phone hasher reads `countryCode` only on a local number
  and ignores it once the string starts with `+`, so E.164 hashes correctly with or without a trustworthy
  `countryCode`; omitting `countryCode` makes the server default to `KR`. A `channelId` is supplied only to
  re-invite someone into an existing room, which is what keeps a 1:1 one room.
- **The mutations are promise-returning** because every caller is a step in a sequence. Failures reject (branch
  on `getSocketErrorCode`); expiry and prior acceptance arrive as `state`, not as failures. `invite.get` is a
  mutation because it is code-driven and must re-run on each step to catch an expiry mid-flow. Accept is
  idempotent server-side; cancel and reject are final and idempotent, and a 409 means the invite was
  accepted meanwhile, so callers re-ask the list. The code is a credential: never in a query key, a log, or a
  URL other than the deep link.
- `useSentInviteLog` exists because the server view only carries `last4`. It maps the recipient's E.164
  number to the invite id so "you already invited this number" and the waiting screen's reissue can work. The
  storage key is `dou.relayInvite.sentLog.v2`; `.v1` was keyed by local Korean digits, which collide across
  countries, and bumping the key was the migration (the entries are a convenience cache and lapsed). A
  corrupt value reads as an empty log, and a full or blocked store costs the entry, not the send.

**Accepting.**

- `invite.accept` answers without a `channelId`; the room is built asynchronously. Socket push cannot deliver
  it (a room nobody has seen has no registered row) and the background poll is far too slow to hold a
  spinner. `useAwaitInviteChannel` therefore pulls `channel.sync` deltas every `CHANNEL_WAIT_POLL_MS` (3 s)
  for up to `CHANNEL_WAIT_TIMEOUT_MS` (20 s) and watches the cache for a new `dm` channel. It resolves with
  the id or `null` and never rejects, since the accept already succeeded. It borrows the delta watermark
  through the same `channel-sync:<cid>` key as `useBackgroundSync`, so the periodic sync skips nothing. Its
  cache observer is cloud-wide and keyed on the React session's `{cid, uid}`, because a relay 1:1 can be
  filed under another place or none and a place-keyed observer would never see it.
- `useOpenPendingInviteChannel` opens the room an accepted invite handed over, from whatever private screen
  the reader lands on after the accept screen leaves. It is mounted once in the private layout because the
  landing can be any private screen, and it lives in `app/hooks` because the layout may not import a feature.
  It reads the pending store, not the render's captured id, because StrictMode replays mount effects and a
  doubled entry into a room from another channel's thread would over-rewind the stack.

## Invited clouds

`useInvitedClouds` lists the clouds in the local cloud cache with `cloudType === 'invited'`; invited clouds
are not in the relay catalog. It is deliberately non-destructive, and everything downstream (the cloud sheet,
background sockets, unread counts) reads this list.

- A cloud that now appears in the owned catalog is hidden from the invited list, so it is never shown twice.
  The owned clouds also cached as invited are exposed separately for the owned-cloud reclaim.
- A row recorded as accepted by someone else is left out: inside a shell the cache is shared by every guest
  the device has had, and a browser tab's rows survive a logout. A row is this session's when either of its
  two ids matches: the accept records the device guest's `delegatorId`, and a rebuilt row records the relay
  uid. For a guest they are the same, but a signed-in account keeps the guest's `delegatorId` while its relay
  uid is its own, so matching the uid alone would miss every row accepted while signed in. A cloud left in
  the list would be delegated into by a guest the server never granted it to.
- `hasReadInvitedClouds` is false until the cache answers once; before that the list is a stand-in, not an
  answer.
- `useJoinedCloudIds` is the single merge rule (owned first, dedupe, drop empty ids and the relay) for the
  ids a cloud belongs to; it is keyed on content because both inputs are fresh arrays most renders.
