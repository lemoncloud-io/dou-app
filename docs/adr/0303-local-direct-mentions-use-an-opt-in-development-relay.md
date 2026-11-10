# ADR-0303: Local direct mentions use an opt-in development relay

> Status: Accepted · Decided: 2026-11-11 · Implemented: `codex/dou-public-mention-relay-pr`
> · Scope: `apps/web/dev/mention-relay`, `apps/web/src/app/runtime/mention-relay`,
> `ChannelRoomPage`, `ThreadPage`
> · Configuration and delivery behavior live in the [local relay README](../../apps/web/dev/mention-relay/README.md);
> browser lifecycle and coverage live in the [observer README](../../apps/web/src/app/runtime/mention-relay/README.md).

## Context

A local agent needs to receive direct mentions from a selected public room and distinguish a
channel message from a reply inside an existing thread. The signed-in app already observes the
room's repository and synchronization stream. A second client would need its own authentication,
message retrieval, and lifecycle rules just to obtain the same events.

Delivering a local queue command is a separate boundary from receiving and acting on it. If the
command times out after submitting, retrying may deliver the same request twice. Likewise, a
message body or the currently open screen cannot safely identify whom a mention targets or where
a reply belongs.

## Decision

**Use an explicitly enabled, local development relay over the app's existing observers.** The
relay is one optional integration, with the following boundaries:

- The browser observer reuses the existing authenticated repository and synchronization manager.
  A Vite serve-only middleware is enabled by an external private configuration file; ordinary
  builds remain inactive. The relay adds no DoU credentials, polling client, or production service.
- The private state binds one cloud, public channel, set of viewer IDs, and Codex destination.
  The first confirmed channel snapshot establishes a baseline. Events must be persisted records
  above that baseline and the current active membership cursor, with an explicit mention ID matching
  a viewer. The retained join observer guards candidate selection, queued sends, and retries; unresolved
  or inactive membership stops delivery. This preserves the rejoin history boundary even when old
  messages remain cached. Display names, plain
  `@` text, and an everyone-only mention do not identify that viewer. Self-mentions are an explicit
  testing option limited to the registered scope.
- An accepted event first gets an immutable source packet and durable queue reservation. The
  queue receives only an opaque marker; the receiver resolves and validates the packet locally.
  Source text remains untrusted data, not instructions or permission to act.
- A successful queue command means submission, not receipt. A timeout, failed command, or abandoned
  reservation is not replayed automatically: the receiver may already have the marker. Receipt
  acknowledgement is separate from both submission and completion of any requested action.
- The relay derives reply context from validated source parent information. A thread mention can
  target only the same thread root, with append semantics. Missing context is unknown, never an
  implied channel message. The reply-target helper plans a destination; it sends nothing and
  grants no action permission. An unavailable thread has no fallback to a channel post.

## Alternatives

- **A server-side push or webhook integration.** This could survive a closed browser, but requires
  a separate authenticated service and delivery contract. The current need is a local opt-in
  observer, so that service is deferred rather than simulated with browser guarantees.
- **A second polling client.** It would duplicate authentication, fetch messages again, and add
  scheduling and baseline rules. Reusing the app's stream keeps one source of observed records.
- **Match names or mention text.** Names can change or collide, and typed text need not be a formal
  mention. Matching explicit IDs within the bound cloud avoids those ambiguities.
- **Retry every uncertain queue command.** It favors delivery over duplicate avoidance without
  proof that the first submission failed. Durable reservation and explicit inspection preserve
  the uncertainty instead of hiding it with another delivery attempt.
- **Reply to the open screen or fall back to the channel.** Navigation is not source context, and
  posting outside the originating thread changes the conversation. Validated parent information
  keeps the intended reply location even after navigation.

## Consequences

- Setup is local and explicit; normal app builds and other rooms keep their existing behavior.
  The browser, relevant cloud connection, and development server must remain available. Cached
  history coverage is bounded, so this is not a durable hosted notification service.
- The relay avoids a second credential store and polling loop, but depends on the app observer's
  lifecycle. Logout and development reloads must release observer registrations.
- Reserved mentions remain deduplicated across restarts and edits. Filtered non-mentions are not
  retained, so an old plain record edited into a mention after a reload can qualify above the
  saved baseline. This is not a complete edit-history ledger.
- Uncertain queue delivery needs inspection and may leave a notification undelivered. That cost is
  chosen over automatic duplicate submissions. Private state needs explicit retention and cleanup.
- Consumers must validate the packet, honor the reply target, and obtain any required action
  authority separately. Legacy packets without parent context can be read but cannot plan a reply.
