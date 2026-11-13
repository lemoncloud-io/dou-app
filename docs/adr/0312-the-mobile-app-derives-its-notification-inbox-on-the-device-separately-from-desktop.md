# ADR-0312: The mobile app derives its notification inbox on the device, separately from desktop

> Status: Accepted · Decided: 2026-11-13 · Implemented: `feat/web-notification-inbox`
> · Scope: `apps/web` — `src/app/features/notifications/` (`stores/`, `hooks/`, `utils/`,
> `NotificationsRunner`), its mount in `runtime/AppRuntime.tsx` and its sign-out callback in `main.tsx`
> · The module doc is [apps/web notifications](../../apps/web/docs/feature/notifications/README.md)

## Context

The mobile app is getting a notification inbox: a list of what called the reader or answered them,
with tabs, unread marks, and an entry from home for what is looking for them. The server has no
notification list, and none is planned for this work. The desktop app already has such an inbox
(ADR-0219, ADR-0266): it is derived on the device from each channel record's newest message, kept in
device storage, and cleared through the read cursor.

Three facts shape the mobile version:

- **The kinds the mobile design names are not desktop's.** Desktop files one message under reaction,
  then 1:1, then mention, and keeps one `reply` kind for any thread of mine. The mobile design shows a
  1:1 message that calls the reader as a mention, and tells "a reply to my message" apart from "a reply
  in a thread I joined" with different wording on the row.
- **The mention rule must match the mobile app's own.** Home's `@me` mark and the room's highlight read
  the message's mention record through `isMentioningViewer` in `@chatic/data`. Desktop reads mentions
  through its own matcher.
- **Desktop is to stay as it is.** The product decision for this work is that desktop's inbox, its
  code and its behaviour are not touched.

## Decision

1. **The inbox is derived on the device, from the channel records the app already observes.** A room's
   `lastChat$` moving ahead is a new message; that newest message is classified and, if it qualifies,
   stored as a snapshot. No server notification list and no new request type; the only reads are the
   ones the inbox's rules need — a reaction's target from the cache only, and a thread's root, cache
   first, once per thread.
2. **Scope is the current cloud's current place.** Those rooms' channel syncs are kept registered while
   they are in scope, so their records stay live on every route. Rooms of other places and clouds are
   not watched.
3. **Six kinds, one item per message, strongest reason first:** mention / thread mention, then reply to
   mine, then reply in a thread I joined, then a plain 1:1 message; reactions on their own. A room
   whose notifications are off or down to mentions keeps mentions only.
4. **A separate implementation in `apps/web`, not a shared one.** The mobile app reads desktop's code
   for reference and imports nothing from it; desktop is not changed. The model, the classification
   order and the storage key (`dou.notifications.v1`) are the mobile app's own.
5. **Stored per device, capped, cleared at sign-out.** One persisted store for every cloud, each item
   naming its cloud; at most 500 items, read ones dropped first; no retention period. The read cursor
   marks a room's top-level items read; a thread's items are read on the thread's screen.

## Alternatives

- **A server-backed notification list.** It would follow the account across devices and see what
  arrived while the app was closed. Rejected for now: it needs a new API and a server-side model of
  "what concerns this reader", and this work is client-only. The device-local limits are accepted and
  written down in the module doc.
- **Move desktop's inbox into a shared library and use it from both apps.** One implementation, one set
  of bugs. Rejected: it means changing desktop, which this work must not do, and the shared code would
  have to carry both classification orders and both mention rules — the two apps disagree on exactly
  the parts that make it an inbox.
- **Copy desktop's code into `apps/web` as it is.** The fastest start. Rejected: it carries the wrong
  order (a 1:1 mention would be filed as a 1:1 message), the single reply kind, and a second mention
  matcher that would let the inbox and home's `@me` mark disagree about the same message.
- **Watch every place of the cloud.** More complete, but it registers a channel sync for every room the
  reader can reach, on every route. Rejected for now: the inbox screen and its badge are about the
  current place, and the cost is paid by rooms nobody is looking at.

## Consequences

- **Two inboxes exist, one per app, and they can disagree.** The same account sees different items on
  desktop and on the phone — each holds what that device saw, under its own rules. That is accepted:
  neither claims to be the account's record.
- **The inbox is incomplete by construction.** A background room is seen by its newest message, so a
  burst collapses to one; nothing is captured while the app is closed; another place's rooms are not
  watched; and "a thread I joined" is known only from what this device saw. The unread counts, which
  come from the server's cursors, remain the complete figure.
- **A thread's root may cost one server read**, the first time a reply arrives in a thread this device
  has not classified. A thread found to be someone else's is remembered for the session, so a busy
  thread is not read again on every reply.
- **The app's other features read the inbox through this feature.** Home's row marks, the bottom
  navigation dot and the room's jump buttons are built on the selectors and the store here.
