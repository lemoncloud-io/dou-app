# Desktop OS Notification — Channel-Specific Push Gap (Postmortem)

**Date:** 2026-06-19 · **Branch:** `feature/louis-notif-dnd-mentions`

OS notification (banner + dock bounce) for new messages worked for some channels
but not others on the Electron desktop app. Spent a full session chasing a client
bug; the root cause turned out to be **server-side broadcast-room membership**.
This doc records the dead ends, the evidence that settled it, and the backend
handoff — so the next person does not re-walk the same path.

## TL;DR (verdict)

The notification bug is **100% server-side**. The receiver's socket gets live
`model.create` / `model.update` broadcasts for one channel (`1000025` 이름아) but
**never** for another (`1000002` 새로운세계) — same socket, same connection. The
entire client receive → dispatch → cache → notify → bridge → macOS display
pipeline is **correct** and channel-agnostic; it was proven end-to-end. The
client has **no subscribe / join-room emit**, so it cannot influence which
channels the server pushes. No client fix was made (per "서버문제면 하지마").

## Symptom (as reported)

- New message in 새로운세계 while window unfocused → **no banner, no bounce**.
- Same moment, 이름아 channel → banner fires fine, push arrives.
- 새로운세계 messages **only surfaced after typing in 이름아** ("꼭 이름아 채널에
  채팅을 쳐야 나옴").
- After app restart, one previously-queued notification showed, then nothing.

## Dead ends (삽질) — disproven hypotheses

| #   | Hypothesis                        | Why it was tempting                                                                                                                               | How it was killed                                                                                                                                                                                                                  |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Stale Electron main process**   | Earlier bridge TIMEOUT was caused by a stale main process (obs 26422).                                                                            | Restarted main; bug persisted identically. Symptom is per-channel, a stale process would break **all** channels.                                                                                                                   |
| 2   | **FIRE → banner bridge mismatch** | Renderer logged `FIRE` but no banner appeared. Suspected the renderer→main `ShowNotification` request shape was wrong.                            | Bridge request/response shape matches `registerHandler('ShowNotification')` exactly. When 새로운세계 _did_ fire (via gap-sync), the banner showed perfectly — `Notification.isSupported():true`, `on('show')` fired, dock bounced. |
| 3   | **Notification coalescing race**  | A title-keyed coalesce map called `close()` on the prior toast; on macOS `close()` could race `show()` and drop the new banner (obs 26542/26543). | Removing coalescing did **not** fix it (obs 26544). The bug is which messages _arrive_, not how banners stack. (Coalesce removal was kept as a minor cleanup — `037161eb` — but it was never the cause.)                           |
| 4   | **Global socket push-death**      | After sleep/wake the socket can wedge; a "zombie" socket does request/response but receives no broadcasts.                                        | User correction: "이름아 채널은 채팅도 잘되고 푸시도 오는데" — push works for one channel **concurrently**. A dead socket would kill all push. Bug is channel-specific, not connection-wide.                                       |

The user's single correction — _"왜 해당 채팅방만 그러냐고"_ (why only that room) —
collapsed hypotheses 1, 4 instantly: any whole-process or whole-socket failure
cannot be channel-selective.

## Root cause (evidence)

Added a one-line socket-entry trace (`[sock-in]`) at `onMessage` in
`libs/socket/src/hooks/useWebSocketV2.ts` (since reverted). It logs every inbound
frame's type + channel. Captured live:

```
[sock-in] model.create {"ch":"1000025","no":334}   ← 이름아, live broadcast
[notif]   이름아 FIRE
[sock-in] chat.feed:ok {}                            ← request/response, NOT a push
[notif]   새로운 세계 FIRE {top:624, authorUid:'1000002'}
```

Reading it:

- 이름아 (`1000025`) arrives as a **`model.create` broadcast** → server pushed it →
  notification fires. Correct path.
- 새로운세계 (`1000002`) **never** arrives as `model.create`/`model.update`. It only
  appears riding a **`chat.feed:ok`** — a request/response fetch reply, not a
  subscription push. That fetch is triggered incidentally when 이름아 activity
  causes a feed refetch / gap-sync. → explains "꼭 이름아 채널에 채팅을 쳐야 나옴."

So the receiver's socket is alive and healthy (it does req/resp, gets 이름아
broadcasts), but the server's broadcast room for channel `1000002` **omits this
receiver's live connection**. Two server-side membership sources disagree:
feed/history membership includes the receiver (so gap-sync finds the message);
the live broadcast room does not.

### Suspect (for backend)

`channelId 1000002 == sender authorUid 1000002`. The channel id equals a user
uid → likely a self / personal / DM-type channel. Hypothesis: the server's
broadcast-target logic for channels whose id is a user uid skips (or
mis-resolves) the receiver's live socket, while the feed/history query still
returns the message. Backend should audit broadcast room membership for these
channels.

## Why the client cannot work around it

The client has **no "subscribe to channel" / "join room" socket emit**. Every
client→server socket send is one of:

`chat/mine` (channel list) · `chat/feed` (fetch / gap-sync) · `chat/send` ·
`chat/read` · `chat/update-join` · `device.save` · `auth.update` · `info` /
`ping` / `pong`.

The server decides push targets unilaterally from the authenticated identity.
There is no client lever to add this connection to channel `1000002`'s broadcast
room. A client-side poll could _mask_ it, but the user explicitly declined that
("서버문제면 하지마").

## Watchdog blind spot (related finding)

The socket health check cannot detect this class of failure:

- `probeSocket` (`useWebSocketV2.ts`) uses `client.request('system.ping')` — a
  **request/response** round-trip.
- `isHealthy()` (`useSocketSupervisor.ts`) checks only
  `connectionStatus === 'connected' && isVerified`.

Neither observes server **PUSH** liveness. A socket that answers req/resp but
receives zero broadcasts reads as fully healthy. Not the cause here (the socket
genuinely was healthy and got _other_ channels' pushes), but worth noting: a
push-liveness signal would be needed to ever detect a real broadcast death.

## Pipeline confirmed correct (channel-agnostic)

For the record, every stage below was verified working and is not channel-aware:

```
onMessage → setLastMessage → SocketDispatcher (domain-keyed)
  → chatHandler / modelHandler → eventBus.emit
  → ChatRepository upsert (optimistic IndexedDB) → debouncedEmitAllStreams
  → subscribeList cb → useDesktopNotifications.notifyFromList → FIRE
  → webClient.request('ShowNotification')
  → main.showOsNotification → new Notification().show()  → banner + bounce
```

The one 새로운세계 notification that did come through rendered perfectly. The
client is not the bug.

## Resolution

- **Client:** no change. The investigation traces were reverted; only an
  unrelated coalesce cleanup (`037161eb`) and a version bump (`adcbd627`) landed.
- **Server:** real fix lives in the backend repos (separate from `dou-app`).
  Owner to audit broadcast-room membership for channels whose id equals a user
  uid.

## Backend handoff (one paragraph)

Receiver's socket receives live `model.create`/`model.update` broadcasts for
channel `1000025` but never for channel `1000002`, on the same authenticated
connection. Channel `1000002`'s id equals the sender's uid (self/DM-type).
Messages for `1000002` are still returned by `chat/feed` history, so feed
membership is correct but live broadcast-room membership is not. Audit the
broadcast-target resolution for uid-keyed channels and confirm the receiver's
active connection is added to that room on connect / on channel open.
