# observe

**The Observe tab (User Watchlist), and why it has to poll instead of subscribe.** Add a user to
watch and see their devices' state (green/yellow/red, tick, viewing) update live. It used to be a
"LIVE" badge over what was actually manual refresh — HTTP presence lookups only refreshed on a click
or a reload button. This document is the sync strategy that made it actually live.

## The server leaves only one option: pull

Three server facts rule out anything push-based:

- **A device-state change is unicast to that device's own connection only.** The admin connection
  watching it is never pushed an update — there is no multicast or admin-subscription path today.
  Sync has to be pull.
- **There is no delta query.** The only pull available is a full per-device read (`device.read`) —
  nothing "since" a cursor.
- **Reading a deleted device doesn't error — it returns a stale view.** Deletion can't be detected by
  polling reads at all; it has to be handled another way (see below).

So every observed device is polled on an interval, close enough to feel live (a few seconds' lag,
same order as the sync period) without pretending to be a push subscription.

## Registration without authentication

A WebSocket connection has to register a device (`device.save`) to read its state, but a read-only
connection needs no `auth.update` token — an anonymous connection can read another user's device
state. This tool relies on exactly that to watch devices the admin doesn't own. It is also a real
finding, not just a convenience: an anonymous connection reading arbitrary device state and
`viewingId` by id is IDOR-shaped exposure, flagged for backend review. If the server ever closes that
gap, this tool's read path needs an authenticated one (`auth.update`) provided alongside it, or
observing stops working entirely.

## Deletion is handled locally, not detected

Deleting a device **from this screen** removes it from the sync set and the list immediately — the
client already knows. A device deleted through any other path is only noticed on the next low-rate
device-list refetch (about every 60s), the same interval new devices on a watched user are picked up.
Polling reads alone cannot tell "gone" from "stale," so nothing here tries to infer deletion from a
read result.

## Two stages, connected at once

Dev and prod are separate WebSocket servers (`…/cht-d1?v2` vs. `…/cht-v1?v2`), and both connect on
first entry rather than on switch — so toggling the existing d1/v1 stage view is an instant swap
between two already-live connections, not a reconnect. A watchlist on the inactive stage keeps
syncing in the background, so switching to it shows current data immediately rather than a stale
snapshot that then catches up.

## Visible connection state

A connection badge (connected / connecting / disconnected) and a last-synced timestamp sit on the
screen for one reason: without them, dead data reads as live data. Losing the socket has to show up
immediately, and reconnecting has to resume syncing on its own.

## Out of scope

Server push (multicast, or an admin subscription) is a backend roadmap item, not something this
client can add — but the client is built so that push, if it arrives later, slots in without a
structural change. Also out: the separate device-inventory tab's own stage switching, offline
storage, and a change-history timeline.
