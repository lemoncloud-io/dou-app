# ADR-0260: The chat input lock is mine, on this device, and a Lab experiment

> Status: Accepted · Decided: 2026-10-27 · Implemented: `feat/chat-input-lock`
> · Scope: libs/config `feature.chatInputLock` · libs/web-ui-kit `ComposerLockButton` · apps/web
> `features/channels` (`useChatInputLock`, `useInputLockStore`, the room, the thread and the room
> settings), `features/mypage` (`LabPage`), `app/hooks/useChatInputLockExperiment`
> · Follows the pattern of [ADR-0166](./0166-place-invite-is-a-lab-experiment-off-until-a-device-turns-it-on.md)
> · The module docs are [apps/web channels/chat-room.md](../../apps/web/docs/feature/channels/chat-room.md)
> and [apps/web mypage](../../apps/web/docs/feature/mypage/README.md)

## Context

People asked for a way to lock chatting in a room, threads included. "Lock" here means the input,
not access: the room stays readable, and what is stopped is sending into it. Asked whose input, the
answer was mine, on this device — a room I mostly read, where a stray tap or a message typed into
the wrong room should not go out.

Nobody yet knows whether a per-room lock is something people want, or how they would find it. That is
the case the Lab page and its `labs` config surface exist for, and ADR-0166 set the pattern: one key,
default off, a hand-built Lab row, and the feature's own rule taking the switch as an input.

## Decision

### 1. One `labs` key, one switch on the Lab page

`feature.chatInputLock` is a boolean, default `false`, `surface: 'labs'`, writable by `local` and
`server`, persisted `local`, applied live. The Lab row only lets the feature in: it adds a **Lock
input** row to each room's settings, and no room is locked until that row says so.

### 2. The lock is per room, on this device, and the server never hears of it

The locked rooms are a set of channel ids in local storage (`useInputLockStore`), cleared at
sign-out. No other member and no other device of mine sees a lock, and nothing is sent anywhere.

### 3. A thread answers to its room's lock

The room and every thread under it read one answer, `useChatInputLock(channelId)`, keyed by the
room's channel id. A thread has no lock of its own: one switch locks and lifts both.

### 4. Locked means the composer is disabled, with a padlock that lifts it

The text field, the send button and the attach panel close together, as they do for a departed DM
peer, and the placeholder says the input is locked. The attach button's slot holds a padlock; one tap
lifts the lock. The settings row can lift it too.

### 5. The Lab switch is an input to the answer, not a check beside it

With the switch off, `useChatInputLock` reports nothing locked and nothing available, whatever is
stored. The stored locks are kept, and come back when the switch does.

## Alternatives

- **A room-wide lock the owner sets**, so members cannot post (an announcement room). Not what was
  asked for, and not possible from the client alone: it needs a channel field every member syncs and
  a server that refuses the send. Neither exists today.
- **A lock that follows me across devices**, stored on my join row. No join field carries it, and a
  lock against accidental sends belongs to the device the accident happens on.
- **Unlocking only from the settings screen.** Rejected: someone who forgot they locked a room would
  be left in front of a dead composer with no reason given. The padlock in the composer explains the
  state and is the way out of it, in the one place the person is looking.
- **Asking for confirmation before unlocking.** Rejected: lifting the lock sends nothing, so a stray
  tap on the padlock costs nothing that a second tap cannot undo.
- **Clearing the locks when the Lab switch goes off.** Rejected: turning an experiment off is how a
  person compares the app with and without it, and that should not cost them what they set up.
- **An A/B test instead of a Lab opt-in.** Not taken now. A real A/B needs an assignment rule, a way
  to change the split, and usage events to measure it by; apps/web has no remote config adapter and
  no usage event for this, and a Lab opt-in is self-selected, so it measures interest, not effect.

## Consequences

**What it costs**

- **Someone who never opens Lab never finds the lock.** Intended while it is an experiment.
- **The lock and the switch are per device.** My second device starts with neither.
- **It guards the composer only.** Reactions, editing or deleting my own messages, retrying a failed
  send and a share from another app into the room still work in a locked room — each is a deliberate
  act, and none starts from the composer, which is where an accidental send happens.
- **The server kill is declared, not wired**, as for the place invite: apps/web has no remote config
  adapter, so nothing can turn the experiment off remotely today.
- **Nothing measures it.** There is no usage event for locking or unlocking, so whether the lock is
  used can only be asked, not read.

**What it does not change**

- Sending, receiving and the room itself. A lock never reaches the wire.
- The desktop app, which has no Lab page and no lock.
