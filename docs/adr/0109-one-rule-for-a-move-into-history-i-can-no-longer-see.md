# ADR-0109: One rule for a move into history I can no longer see, and what "the peer is gone" is read from

> Status: Accepted · Decided: 2026-09-21 · Implemented: `feat/dm-leave-rejoin-fix`
> · Scope: `apps/web/src/app/features/channels/**` · `apps/web/src/app/features/invite/pages/ContactInvitePage.tsx` · `apps/web/src/app/hooks/useRelayInvites.ts` · `apps/web/public/locales/**` · `libs/app-runtime/src/socket/sync/**`
> · Builds on [ADR-0067](./0067-rejoin-hides-prior-messages.md) (the re-join display gate) ·
> [ADR-0068](./0068-dm-peer-departure-and-reinvite.md) (departure and re-invite) ·
> [ADR-0039](./0039-dm-display-name-chain-and-invite-profile-release.md) (the name chain)
> · Corrects a premise in each of the last two — see their own dated notes.

## Context

Two reports came in from the app. A 1:1 whose peer had left kept accepting messages. And the person
who ACCEPTED an invite saw the inviter's account name as the room title.

Neither was a missing feature. ADR-0067 shipped the re-join display gate, ADR-0068 shipped the
departure footer and the composer lock, ADR-0039 shipped the title chain. **Both reports were
decisions that never ran, not decisions that ran wrong** — the inputs never reached them.

Measured on dev with two accounts (2026-09-18), reading the channel and join rows out of the cache
rather than the screen, because a screen cannot tell "returned to the same room" from "made a new
one":

| Question                                           | Measured                                                       |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Does accepting a re-invite return to the same room | **Yes.** Same channel id, one DM with that peer                |
| DM channel id                                      | **Derived from the pair** — `{ownerId}@{peerId}`               |
| The returning side's cursor                        | `joinedNo` **0 → 3** (channel `chatNo: 4`)                     |
| The staying side's cursor                          | `joinedNo` **unchanged** — the whole timeline survives         |
| The departed peer's join row                       | **Not returned at all.** They are dropped from `memberIds` too |
| The recipient's `join.nick` after accepting        | **Seeded by the server** with the inviter's `User_0101`        |

The last two rows are the two reports. The third-from-last is a correction to a risk ADR-0068 wrote
down (below).

Then a second gap, structural rather than reported. ADR-0067 closed the room's own feed, and left
every **route into** that feed open. A push sits in the OS tray after the membership it announced is
gone; a row sits in the in-app notification list; a reply points at a root below the cursor; a
search result links to a chat number. Five entrances onto a window that has closed — and design had
seven empty frames titled for them, which is what "seven different screens" looks like before
anyone notices it is one problem.

## Decision

### 1. A move into history outside my join window is decided **once, on the jump request**

Not at the five entrances. They all converge on one `useMessageJumpStore` request, so the rule sits
there: `useMessageJump` asks `isInJoinWindow` before it looks for the node.

- **Outside the window → the room opens and the jump is abandoned.** The reader asked to go to a
  room they are in, and that part works. Only the scroll is given up.
- **Abandoning is not a courtesy, it is the truth.** `useChats` windows the cache by the same
  cursor and the server stops serving anything at or below it after a re-join, so the paging budget
  would be spent on requests that cannot come back with the target.
- **No cursor means nothing is hidden.** An absent `joinedNo` declines to act, the same direction
  `hasLeftChannel` takes with an absent field.

Deciding per entrance was the alternative the design frames implied, and it fails in a specific way:
five copies of one rule drift, and the sixth entrance — whatever ships next — silently gets no rule
at all.

### 2. The notice names the cause, and must not say "deleted"

The message exists. It is on the other participant's screen right now. It is invisible here only
because I left and came back. Copy that blurs those two teaches the reader that the other side
erased their history, which is both false and unfixable once believed.

### 3. `ThreadPage` reads the channel through the same window

It did not: the room passed `joinedNo` to `useChats` and the thread did not, so history the room had
just hidden was reachable by opening a thread on it. A thread is a view of a channel, not a second
place to decide what a channel shows. One rule, every surface — the same sentence ADR-0067 wrote,
applied to the surface that arrived after it.

**Closing that hole opens a screen, and the screen has to be right.** A reply written after my
re-join to a root from before it is inside my window and carries a thread footer, so the thread is
one tap away and its root is one I will never be served. The generic "not loaded yet" branch was
wrong for it twice over: it promised the message appears once older history loads, and offered a
button to load it. The root's chat number is in the URL, so this is decidable without the row —
which is the point, because the row is exactly what never arrives. That case says the same thing
decision 2 says, drops the button, and closes the composer, since a reply needs the root's id and
would otherwise be swallowed on send.

### 4. A room I am not in says one line, and offers no way back

The verdict is taken from the row, not from an error: `isNotMyChannel`. It is the opposite reading
of `isChannelMember` on purpose — that one refuses on unknown because a wrong yes costs a server
alarm, this one allows on unknown because a wrong yes throws a member out of their own room. Roster
hydrated, under the server's 100 cap, and not contradicted by my own live join row.

The redirect out of a vanished room was silent, which was indistinguishable from the app dropping
the tap. It now leaves one line, once per room.

**No re-entry button.** Returning to a 1:1 takes the other side's invite, so a button there would be
one that cannot work. **No invite entry point either** — the person who left inviting the person who
stayed fails at acceptance, because the accepter is already a member.

#### The refusal has to reach the screen, and it did not

The line above only reaches a room whose row this device once had. A room it has never cached — a
stale notification tapped after a leave, which is the common case — went somewhere else entirely:
`useChannel` cannot tell a refusal from a fetch still in flight, so it waited out a ten-second
window and then reported a load error. Ten seconds of nothing, then a red failure, for something
that was never a failure. The server, meanwhile, had answered on the first poll.

**The answer was already being computed and then dropped.** The sync scheduler classifies a failure
the server answered 403/404 as `gone`, as against `transient` for everything else, and that
classification reached a log line and stopped. Nothing downstream could read it, which is why this
looked like a question the client could not settle.

So the channel plan's failure policy now records a `gone` verdict against that channel id, and
`useChannel` reads it. Four things are deliberate about it:

- **Recorded on the FIRST refusal**, in `decide`, not in `onStopped`. A stop needs two consecutive
  refusals and arrives a poll interval later — after the screen has already given up.
- **It observes without changing anything.** Supplying `decide` replaces the library's default, so
  the default is reproduced exactly and `stopAfter` pinned beside it. When a target stops is
  unchanged; the only new thing is that the first refusal is seen.
- **A refusal is remembered, not derived, and expires against reality.** A successful view of the
  same channel clears it — accepting a re-invite makes the room readable again — and an account
  change clears all of them, because they are facts about what one account was told.
- **It stays separate from `isError`.** "You are not in this conversation" is something we know;
  "could not load" is what we say when we do not. Folding them together would put a membership
  sentence in front of somebody who is merely offline, which is the reason this gap was left open
  rather than papered over. It is also why a refusal speaks only when there is no row to show: a
  room already rendering belongs to the removal path.

### 5. "The peer is gone" is read from the roster **as well as** the join row

`hasLeftChannel` needs a row to read, and a real departure leaves none. `isDmPeerMissing` reads the
roster instead, and the two are OR'd.

**This is not a member-count test**, and the distinction is the whole reason it is not written as
`memberIds.length === 1`. A DM is two people by definition, so "the roster holds only me" is the
server's own statement about the other one; the peer is looked for **by id**, exactly as `useDmPeer`
does. An empty or absent roster means "not hydrated yet" and deliberately does not count, or every
healthy room would lock its composer for a beat on a cold open.

### 6. A server-seeded nick is **anything the server put there**, not just a raw id

ADR-0039 kept server-seeded values out of the title chain on purpose, and defined them as the raw
user id an unnamed join carries. The server also seeds an invite recipient's `join.nick` with the
inviter's auto-generated account name, and `join.nick` is the chain's first and most trusted step —
so that value walked in through the one door the chain never questions. The header read `User_0101`
while the body and the member list read the peer's place profile.

`isServerSeededNick` widens the guard to cover that shape and the masked `***0101`. Two things it
does not touch: `isRawIdNick`, which `displayName` reads on a different axis, and the **sender's**
`join.nick`, which holds the friend name they typed on the invite form and has to survive.

Accepted cost: somebody who genuinely names a room `User_1234` loses that name. Narrow pattern
against every invited person seeing a number where a name belongs.

### 7. Read receipts branch on kind and state, never on the head count

`showReadReceipt` asks whether anybody can do the reading, and that is two questions: a self chat
never has a reader (what the room is), a 1:1 whose peer left no longer has one (where it stands).
`activeMemberIds.length === 1` was carrying both — one number standing for two unrelated facts, right
for the wrong reason, and wrong the moment either fact moved. They are now `channelKindOf` and the
same `state.kind !== 'present'` flag that drives the composer lock. The count stays as the
denominator that picks binary-vs-counted mode, which is what it actually is.

### 8. Invite validity copy derives from a value, on every screen including the first

ADR-0068 decision 4 set the lifetime to 24 hours and said the copy must never hardcode a duration.
Two of the three screens obeyed, deriving from the server's `expiredAt`. The issue form could not —
the link does not exist yet — and so it kept a fixed sentence that said three days. The same flow
contradicted itself, and the screen that spoke first was the one that lied.

The form derives from `INVITE_EXPIRES_DAYS`, the value this client is about to ask for. Same single
source, one step earlier.

### 9. Correction — a duplicate DM room cannot exist

ADR-0068 recorded, as an accepted cost, that two rooms with the same peer could exist and that a
per-person alias would need a migration at that point. **The id is derived from the pair**, so both
directions of invite resolve to the same channel and the server has nowhere to put a second one.
Simultaneous invites converge rather than race. The client has nothing to prevent, and the migration
that cost anticipated has no trigger.

This does not weaken decision 6 of ADR-0068 (`join.nick` is the room's name, not the person's). It
removes one argument for it, and the argument that carries it — the same field naming a self chat, a
DM and a group room — is untouched.

### Out of scope

- **`apps/desktop-web`**, `apps/testbed`.
- **Reverse re-entry** — the person who left inviting the person who stayed. It fails at acceptance
  ("already joined"), and fixing it means the server re-activating a member's join on accept. Not
  something the client can build.
- **Mentions and attachments.** Neither feature exists. The rules are written down in the lane's
  spec so they are not re-argued on the day they arrive: mention candidates are current members
  only, and the attachment list shows post-rejoin items only (the alternative leaks, through the
  attachment list, exactly the history the room hides).
- **Carrying the membership refusal to the screen** — see Consequences.

## Alternatives

**Decide the join-window rule at each entrance.** What the seven design frames implied, and what a
reader expects when the frames are titled separately. Rejected: five copies of one rule drift, and
the next entrance gets none.

**Block the room too, when the target is out of range.** Symmetrical, and wrong about what the user
asked for. They asked to go to a room they are in. Blocking produces "why can't I get in", which is
a worse question than "why can't I see that one message".

**Page for the target anyway and let it fail.** No new code. Rejected: it burns the whole paging
budget on requests the server has already decided to answer without the row, then shows a generic
"couldn't find that message" — which reads as loss rather than as a boundary.

**Say "message deleted".** Copy that already exists elsewhere. Rejected, hard: it is false, and the
false version is the one that damages trust between the two participants rather than between the
user and the app.

**Detect departure as `memberIds.length === 1`.** Shorter, and identical in every case measured.
Rejected because it is the same shape that has already produced two bugs here — a count standing in
for a kind (see decision 7, and the one-person glyph a group room drew in search). Looking the peer
up by id costs nothing and cannot mean something else later.

**Widen the nick guard to reject anything matching a generated-looking pattern.** Catches more.
Rejected: the wider the pattern, the more real names it eats, and the failure is silent — a person
whose room name vanished has no way to tell why. The two shapes the server is actually known to
write are enough.

**Ask the backend to stop seeding the recipient's nick.** The clean fix, and the one that would let
the chain keep its old, narrower guard. Rejected as the primary path because it strands the client
behind a deploy it does not control; the guard is cheap and the two can coexist.

## Consequences

**What is gained**

- Both reports are closed at their real cause, and both causes are recorded — each had been
  misdiagnosed once before measurement.
- The five entrances have one rule instead of five, and the sixth will inherit it.
- A thread can no longer show what its room hides.
- A vanished room explains itself instead of blinking home.
- The invite flow stops contradicting itself about how long a link lives.

**What is accepted**

- **The server does not close the room, so the client does.** Measured 2026-09-21 with two accounts,
  from the one that had just left: `channel.get` and the message read both succeed, and the room
  rendered the conversation. The scheduler therefore never calls that target `gone`. Two things
  followed. The refusal is taken from `channel.sync-users`, which does answer
  `403 FORBIDDEN - not a member of channel`, wrapped at the gateway so no caller has to remember it.
  And the room stops waiting for any of it: `isNotMyChannel` reads the roster off the row it already
  has, since a departed member is dropped from `memberIds`. **That a non-member is served a 1:1's
  metadata and messages at all is a server question, and a larger one than the screen this decision
  is about.** A room the reader left also reappears in their list, because the read succeeding is
  what caches it.
- **A refusal costs one poll, not zero.** The verdict lands when the first `channel.get` comes back
  refused, so a cold open still shows its skeleton until then — far short of the old ten seconds,
  but not instant. An offline device gets `transient`, records nothing, and keeps the load-error
  screen, which is the correct answer for it.
- **The scheduler's default stop rule is now written down in two places** — the library's and this
  repo's copy in `reportRefusal`. Pinned together with `stopAfter` so they cannot drift apart
  silently, but a library change to that rule is something this file has to follow.
- **Somebody who names a room `User_1234` loses that name** (decision 6).
- **A jump that is abandoned looks like a jump that failed**, from the outside. The copy is the only
  thing distinguishing them, which puts real weight on decision 2.
- **`isRawIdNick` and `isServerSeededNick` now differ**, and a reader has to know which axis they are
  on. The narrower one is kept deliberately rather than merged.
- **A DM room still cannot be deleted**, and one both sides have left stays on the server.

**Follow-ups**

- The `userId`-based re-invite API ADR-0068 asked for, unchanged.
