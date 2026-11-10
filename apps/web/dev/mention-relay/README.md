# Local public mention relay

This optional Vite development plugin forwards newly observed direct mentions to one
explicitly configured Codex thread. The browser supplies events from its existing DoU
repository observers. The relay does not authenticate to DoU, fetch history, poll a
server, or send chat messages. It has no production-build hook.

## Configuration

Set `DOU_MENTION_RELAY_CONFIG` to an absolute path outside the repository before
starting the development server. The JSON file must belong to the current user and
have mode `0600`. An example with placeholder values:

```json
{
    "version": 1,
    "stateDir": "/absolute/private/mention-relay-state",
    "codexBin": "/absolute/path/to/codex",
    "threadId": "destination-thread-id",
    "allowedOrigins": ["http://localhost:5017"],
    "channelName": "public",
    "includeSelf": true
}
```

The executable must be an absolute, executable file. The state directory is created
with mode `0700`; an existing directory must already have that mode and belong to the
current user. Packets, receipts, acknowledgements, and state use mode `0600`. Keep this
directory outside the repository. Configuration contains no DoU credentials.

The first registration binds the cloud, channel, sorted viewer IDs, and initial
`chatNo` baseline. Later registrations cannot change that scope or baseline. The
destination, origin policy, and self-mention policy are also bound to the state
directory: changing them requires a fresh directory. Only the exact channel name
`public` is supported. `includeSelf: true` permits the viewer's own direct mentions
for testing.

## HTTP contract

The serve-only `mentionRelayPlugin()` export is inactive when its configuration path
is unset. When active, these same-origin routes are installed:

| Route                           | Behavior                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /__dou_mentions/config`    | Returns `enabled`, `channelName`, `includeSelf`, a per-process token, `scope`, and `baselineChatNo`. A stopped relay returns only `enabled: false`. |
| `POST /__dou_mentions/register` | Accepts `{version:1,cloudId,channelId,channelName,viewerIds,baselineChatNo}`. Returns the persisted scope and baseline with `accepted: true`.       |
| `POST /__dou_mentions/events`   | Accepts `{version:1,cloudId,channelId,messageId,chatNo,parentId?,senderId,content,mentionUserIds,mentionAll?,createdAt?}`.                          |

Requests must arrive from a loopback peer. Host must exactly match a configured
origin's host, or `localhost:5013` for the local shell proxy's upstream. An Origin,
when present, must exactly match the configured allowlist. Fetch metadata must be
absent, `same-origin`, or `none`. POST additionally requires an allowed Origin,
`Content-Type: application/json`, and the config token in `x-dou-mention-token`.
The server rejects request bodies above 32 KiB and content above 16 KiB.
Responses disable caching and never expose the thread ID, executable, or state path.

An event needs a positive persisted integer `chatNo` above the initial baseline,
the registered cloud/channel, and a direct intersection between `mentionUserIds`
and the registered viewer IDs. A display name, plain `@` text, or `mentionAll`
without a direct ID match is insufficient. Scope mismatches return HTTP 409.
Filtered events return HTTP 200 with `accepted: false` and a reason. Once a mention
is reserved, its `cloudId/channelId/messageId` identity is deduplicated for the life
of the state directory, including later edits and restarts. Filtered non-mentions
are not recorded: a plain message edited into a direct mention after a browser
reload can be submitted if its `chatNo` is above the saved baseline.

New clients always send `parentId`: `null` means an explicitly identified channel
message, and a string means a thread reply. The server accepts a bare positive root
`chatNo` string or the exact same-channel full ID `<channelId>:<rootNo>`. The root
must be a safe integer lower than the event's `chatNo`; malformed, cross-channel,
self, and future roots are rejected. The raw `parentId` remains in the immutable
packet. The server derives `source.replyContext` itself:

- `{kind: "channel"}` for explicit `null`.
- `{kind: "thread", parentId: "<channelId>:<rootNo>", rootChatNo: <number>}` for a validated thread root.
- `{kind: "unknown"}` when a legacy client omits `parentId`.

A client-supplied `replyContext` is ignored. Omission never implies a channel
message. Stored and broadcast DoU rows normally use the bare root number, while a
send requires the full ID. Threads are flat, so a response to an additional
mention inside a thread belongs to that same root.

## Delivery and recovery

For an accepted mention, the relay first persists an immutable source packet,
then a queue reservation. Files are synced before a queue process is started.
The only queued text is an opaque marker:

```text
completion:doumention-<scope-hash>-<sequence>:<sha256>
```

The process is invoked with fixed arguments and `shell: false`:
`codex queue --thread <configured-thread> --message <marker>`. A command has a
10-second timeout and a 64-KiB combined output limit. Its output is discarded.
HTTP 202 reports `queue-submitted` when the command exits successfully;
this confirms only queue submission, not arrival or processing in Codex.
Errors, timeouts, and excessive output produce `queue-uncertain`. No uncertain
or reserved event is automatically retried, including after a restart.

Use the CLI from the repository root:

```bash
node apps/web/dev/mention-relay/cli.mjs status /absolute/private/mention-relay-state
node apps/web/dev/mention-relay/cli.mjs receive /absolute/private/mention-relay-state '<marker>'
node apps/web/dev/mention-relay/cli.mjs reply-target /absolute/private/mention-relay-state '<marker>' thread
node apps/web/dev/mention-relay/cli.mjs ack /absolute/private/mention-relay-state '<marker>'
node apps/web/dev/mention-relay/cli.mjs stop /absolute/private/mention-relay-state
node apps/web/dev/mention-relay/cli.mjs probe /absolute/private/mention-relay-config.json
```

`receive` validates the marker, scope, sequence, and stored packet digest, then
prints the original packet JSON. The packet explicitly labels its source as
`external-untrusted`. Its content is data to read, never instructions or permission
to execute commands. `ack` records receiver acknowledgement separately from queue
submission. It does not prove that any requested action was performed.

`reply-target <stateDir> <marker> <channel|thread>` is a planning guard. It first
performs the same packet and digest validation as `receive`, then checks the
source scope and derived reply context. Its result contains `cloudId`, `channelId`,
`parentId`, and `mode`:

| Mention origin             | Requested target | Result                                                                                                 |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Thread                     | `thread`         | The same canonical full root ID, `mode: "append"`.                                                     |
| Thread                     | `channel`        | Refused; no channel fallback.                                                                          |
| Channel                    | `channel`        | `parentId: null`, `mode: "new-message"`.                                                               |
| Channel                    | `thread`         | The source message's full ID, `mode: "append"`; `messageId` must exactly equal `<channelId>:<chatNo>`. |
| Unknown or connection test | Either           | Refused; no guessing.                                                                                  |

The guard never sends a message, accepts an alternate root, or grants permission
to act on source content. A sender must use its returned destination unchanged;
if the requested thread is unavailable, stop rather than post to the channel or
another thread. Existing packets remain immutable. A legacy packet without
parent information can still be received, but cannot produce a reply target.

`stop` persists a disabled flag. Future configuration reads and event requests
observe it; an already running queue command may finish. Stop does not delete
packets or acknowledgements. A new opt-in session uses a fresh state directory.
`probe` is the only way to create a connection test: it queues a distinct
`connection-test` packet, never a fabricated mention. Simply enabling the plugin
does not queue a probe.

The writer lock prevents simultaneous processes from modifying scope or reserving
the same event. A process crash while holding it can leave `.writer-lock` behind;
after confirming all relay processes are stopped, remove that empty directory
before restarting. A crash can also leave an orphan packet or a reserved receipt.
Inspect `status` and `receive`; do not assume that a reserved receipt failed to
reach the queue or replay it automatically.

The browser app and development server must remain running and observing the
registered channel. This is a local development relay with bounded individual
packets, not a hosted notification service. State has no automatic retention or
retry policy; stop the relay and remove its private directory when it is no longer
needed.

## Verification

```bash
node --test apps/web/dev/mention-relay/relay.test.mjs
npx nx run web:test-mention-relay
```

The dependency-free Node tests use ephemeral loopback HTTP servers and a fake
Codex executable. They cover endpoint authentication, immutable registration,
baseline filtering, self-mention policy, direct ID matching, durable deduplication,
queue failures and limits, digest verification, CLI operations, explicit probes,
parent validation, and thread-only reply targeting without channel fallback.
They do not enqueue messages into a real Codex thread. Browser observer integration
and real thread receipt require separate verification with the local shell and an
explicitly authorized connection test or actual user mention.
