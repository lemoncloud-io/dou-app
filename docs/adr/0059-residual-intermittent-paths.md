# ADR-0059: Close residual intermittent-recurrence paths — keep the reconnect snapshot, retry the first query, shrink the fallback dirty set

> Status: Accepted · Decided: 2026-08-15

## Context

Even after [ADR-0057](0057-home-last-chat-preview-single-query.md)/[ADR-0058](0058-navigation-churn-grace-and-seeding.md),
three paths remained where the same symptoms (missing previews, request pile-ups) could **still recur
intermittently**:

1. **Reconnect stampede.** The polling plans' library default (channel/place/profile/join) resets the
   snapshot on `onConnected` — the first poll right after reconnecting is unconditionally judged "changed,"
   so every foreground resume (routine on a mobile WebView) produced a **same-data write → re-limit →
   re-fetch chain for every registered target**. ADR-0058's grace/preservation only covers screen-transition
   churn, not this path.
2. **Silent first-query failure** (the audit's P0-4, which had been left unimplemented). If an observer's
   first query fails (e.g. a bridge timeout), the callback is never called and that row stays stuck empty
   — with no recovery path until the next write re-limit or re-subscription.
3. **Older-app fallback amplification** (a new defect created by ADR-0057). The combined last-chat
   observer wakes on the `chats-last|` global prefix, so a write to any channel re-runs it; on an older app
   with no fast path, one re-run cost **a window read for all N channels (N round trips)**. During a write
   burst (reconnect catch-up, consecutive sends), that was N round trips per flush — potentially a replay
   of the original storm. During the web-only deployment window, this fallback is the production path.

Note: a "code-block rendering" theory raised around the same time was rejected — `toPlainPreview` already
flattens a fence to its first non-blank line (and the old punctuation-driven quadratic freeze was already
linearized). The only real corner case is a message with **only an empty code block**, which becomes an
empty preview (unrelated to the storm or the entry error, a separate product decision).

## Decision

### 1. Every polling plan gets `resetSnapshotOnConnected: false`

Our consumer (onUpdate = a cache write) does not need the "at least one onUpdate after reconnect"
guarantee — the same row is already in the cache. Keeping the snapshot means only rows that actually
changed while offline (an advanced `updatedAt`) get written. Session boundaries (cloud switch, logout)
still clear the snapshot through the scheduler's `stopAll`, so a stale baseline never crosses a session.

### 2. On observer first-query failure, retry once after 1 second

On success, plant the value and deliver it to **every callback waiting at that point** (subscribers who
joined the first attempt's in-flight also had no result, since they shared the same failure). Retry only
once — the dominant cause of a failure is a momentary spike, which one retry usually clears; under
sustained failure, a loop only feeds the congestion. Recovery beyond that relies on the existing paths
(write re-limit, re-subscription).

### 3. Shrink the fallback dirty set — re-read only channels a write actually touched

`ChatLocalDataSource` memoizes the last verdict per channel (`${scopeKey}|${channelId}`) and marks a
channel dirty at the single funnel every mutation passes through (`getAffectedListPrefixes`). The fallback
re-run then re-reads the window only for dirty channels and reuses the memo for the rest — cost per write
burst drops from N round trips to "however many channels actually changed." Dirty is claimed **before**
the read: a write that lands mid-read re-marks the channel, and that mark survives, so the next run
re-reads it — a memo built on pre-write data can never be reused stale. `cacheClear` bypasses the funnel,
so it clears the memo directly.

## Remaining intermittent paths (acknowledged, accepted)

- An entry with no seed (push, deep link, search) still goes through the 10-second resolve timer — but with
  the congestion itself removed, measured latency rarely reaches the timer anymore.
- Pending-row window drop in the room screen (channels with 100+ cached rows, briefly not shown before
  ack) is closed by a native `includeUnsent` implementation — a separate work item was filed for it.
- Error masking in native handlers (`success: true, items: null`) is a contract shared by every sibling
  handler and was not touched here — changing it would need an ADR for the bridge error contract as a
  whole.

## References

- [ADR-0057](0057-home-last-chat-preview-single-query.md) · [ADR-0058](0058-navigation-churn-grace-and-seeding.md)
- Spec: docs/specs/cache/last-chat-preview.md (lived in the root docs tree, which has since been removed;
  reflects the fallback dirty-set shrink)
