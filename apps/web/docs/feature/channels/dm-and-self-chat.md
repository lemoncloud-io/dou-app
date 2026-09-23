# 1:1 and self chat — the rooms that stand for a person

Two of the three stereos have no room of their own to speak of. A self chat (`stereo === 'self'`) is
me alone; a 1:1 (`stereo === 'dm'`) is one other person. Neither has a name, a photo or a member
list worth the word, so both borrow their identity from a person — and four surfaces have to borrow
it the same way, or the same room wears two names.

This document owns those per-stereo rules: how a room is identified, how a self or DM room is
named, and what a 1:1 does when the other person leaves. The screens they appear on are
[chat-room.md](./chat-room.md) and [channel-settings.md](./channel-settings.md).

## The five surfaces

The room header, the settings screen, the home list, place channel management **and search results**
all name and draw the same channel. Two shared resolvers keep them from disagreeing:

Two shared resolvers answer "what is it called?" and "what does it look like?" — `lib/resolveChannelTitle.ts`
and `lib/resolveChannelAvatar.ts`, the only things in `lib/` other features may borrow, alongside
`lib/channelStereoPolicy.ts` (below).

Single-channel screens call them through `useChannelTitle`; list rows call the pure functions
directly, because the hook pulls in `useMyProfile` and would fetch once per row. **Search calls them
from `useSearchContext`**, which builds display-ready rows so the row components stay data-free.

> Search was missing from this list, and from the resolvers, until 2026-09. It rendered
> `channel.name` and `channel.thumbnail` raw, so a 1:1 result showed the server's generated name
> where every other surface showed the peer, and a self chat showed that name instead of its label.
> It also printed a DM's `memberNo` — always `2` — which the home list deliberately hides. Adding a
> surface means adding it here too.
>
> Taking _half_ a resolver counts as not taking it. `resolveChannelAvatar` answers a photo **and** a
> placeholder glyph, and search first kept only the photo — so every photo-less room fell to the
> one-person default and a group read as a person here while the home list drew the two-person
> glyph for that same room. The row carries `glyph` for this reason; do not re-derive it.

**Stereo, never member count.** `isSelfChat` is `stereo === 'self'` and a DM is `stereo === 'dm'`,
everywhere. A `memberNo === 1` test looks equivalent and is not: an empty group reads as a self
chat under it.

### `channelStereoPolicy` — one switch, not a pile of booleans

`channelKindOf(stereo)` folds the server's five `ChannelStereo` values into the three kinds this
client has rules for, and the per-kind rules hang off it:

| Function                                 | Answers                                  |
| ---------------------------------------- | ---------------------------------------- |
| `channelKindOf(stereo)`                  | `'self' \| 'dm' \| 'group'`              |
| `showsMemberCount(kind)`                 | whether a row prints the member count    |
| `removalActionFor(kind, isChannelOwner)` | `'leave' \| 'delete' \| 'none'`          |
| `dmLineageOf(channel)`                   | `'relay' \| 'cloud'`, for a 1:1          |
| `hasDmInviteFlow(channel)`               | whether invite UI belongs in this room   |
| `profilePlaceOf(channel, activeSid)`     | which place's profiles name these people |

**Why a switch rather than `isDmChat`-style booleans.** Three separate defects came out of the
boolean form, and they are the same defect:

- The place's bulk "remove selected rooms" branched on `isOwner` alone and never asked whether the
  row was a DM, so it sent `channel.delete` at a 1:1 — the one thing a 1:1 must never do. **Omitting
  a condition compiles.** Leaving a `switch` arm empty does not go unnoticed the same way.
- `isGroupChat = !isSelfChat && !isDmChat` silently swallows `public` and `''`. The `default` arm
  now carries a `never` assignment, so a new stereo breaks the build instead of becoming a group.
- The home list hid the self chat's member count only because `memberNo > 1` happened to be false.

`removalActionFor` also moved the ownership question from the PLACE to the CHANNEL. A place owner
who has merely joined a room inside their place does not get to delete it, and the room's own
settings screen had always read it that way — the two screens disagreeing is what let the bug
through.

### A second axis inside `dm` — where the 1:1 came from

`stereo` says a room is a 1:1. It does not say **which kind**, and there are two.

A **relay** 1:1 is reached by inviting a phone number. It lives in the relay's one default place, so
it carries that place's `sid`, and it has an invite behind it — which is what the departure footer
reads and what its re-invite CTA sends another of.

A **cloud** 1:1 is opened by naming a member directly (`channel.startDm`). It belongs to the cloud
rather than to a place, because the two participants need not share one, so it is stored with `sid`
deliberately blank. There is no invite in its history and no number to send one to.

**`cid` is the mark — the cloud the room is in.** It is the server's own answer, it arrives on every
read, and nothing on the client derives or overwrites it. An unknown cloud reads as a subscription
one, which is the safe direction: the relay is a single known id, so only a genuine relay room can be
mistaken for a cloud one and never the reverse.

> **This used to read `sid`, and that failed.** The idea was that a cloud 1:1 belongs to no place, so
> a blank place field would mark it. Measured 2026-09-23: **the server assigns the room a place
> anyway** — whichever one its creator was standing in — and returns it on every read, so a client
> that blanks the field has it filled back in by the next sync. The room then changed lineage
> silently, taking the footer suppression and the naming rule with it. A blank field also meant two
> things at once ("no place" and "place not known yet"), and the write paths are built to resolve the
> second by guessing.

**Only the invite-attached parts split.** `hasDmInviteFlow` gates the departure footer, its CTA and
the `invite.list` poll that feeds them — nothing else. Read receipts, keeping a departed member on
the settings list, and the join/leave system messages are about a 1:1 as such and behave the same
for both lineages.

What a cloud 1:1 should show once its peer leaves the cloud is an open product question. Until it is
answered the room says nothing rather than borrowing a sentence written for a flow it does not have.

### `profilePlaceOf` — which place names the people in this room

A profile is per-place: the same person has a different nick and photo in each one, so naming anyone
means choosing a place first. Almost every room has already made that choice — it lives in a place,
and `channel.sid` is it.

A cloud 1:1 carries a place, but it is the one its creator happened to be standing in — no answer for
the other person, who may not be in it. So the reader's own is used instead. `profilePlaceOf` returns
`activeSid` for those rooms and `channel.sid` for everything else, and the three screens that draw a
name in a room — `ChannelRoomPage`, `ThreadPage`, `ChannelSettingsPage` — all read it, or the header
and the settings list would disagree about who the room is with.

Two consequences follow, and both are intended. **The same room names its peer differently when
opened from a different place.** And **two participants who share no place see each other by
different names** — which is exactly why the room could not have picked one place for both of them.

`null` means "nothing to look under yet", which the profile hooks read as "do not subscribe". An
unresolved session must not collapse into an empty-string lookup that answers with nobody.

### Opening a cloud 1:1, and finding it afterwards

Three surfaces, and the third is not optional.

| Surface                                          | What it does                                            |
| ------------------------------------------------ | ------------------------------------------------------- |
| Home create menu → `CloudDmPickerPage`           | Pick one person; the tap IS the action, no confirm step |
| A participant's profile → the "1:1 대화하기" row | Same `useStartDm`, with the peer already chosen         |
| Home's cloud 1:1 section                         | Where the room lives afterwards                         |

**`sid` is not a scope key for a 1:1**, and the section is what follows from that. A group is read
within its place; a 1:1 is read across the cloud, because the place it carries describes where one
person stood rather than where the conversation lives — the other participant need not be in it, so a
place-scoped read would show the room to one of them and hide it from the other. `isInPlaceList`
(in `libs/data`) holds both halves: a place list takes rooms whose `sid` matches **and** that are not
read cloud-wide, or a cloud 1:1 appears twice.

`useCloudDmChannels` reads the cloud-wide observation for the rooms `dmLineageOf` calls `cloud`, and
the section is `ChannelList` itself — same rows, a different title and source — so the title chain,
the avatar, unread and the preview cannot drift into a second copy.

**The create menu entry is one label over two acts.** On relay a 1:1 is reached by phone number, so
it goes to the contact form — which carries its own ordered gates: phone verification for a guest or
an unlinked account, then the place-profile nudge, then the form. Inside a cloud the other person is
already a member, so it goes to the picker and nothing is sent.

| Environment              | Entry shows | Tap goes to         |
| ------------------------ | ----------- | ------------------- |
| Relay                    | yes         | `ContactInvitePage` |
| A cloud I own            | yes         | `CloudDmPickerPage` |
| A cloud I was invited to | yes         | `CloudDmPickerPage` |

`isDefaultCloud` used to decide both **whether** the entry showed and **what** it did;
`showOneOnOneCreate` now carries the first and the page the second.

**The invited cloud is the row that was missing.** `canCreate` opened the whole popover and means
"may make a room here" — which an invited member may not — so they had no 1:1 entry at all, though
they are exactly the colleague this feature exists to reach. The popover now opens for either entry
and `canCreate` guards only the group row.

**That guard is load-bearing.** `showGroupCreate` is a negative (`!isDefaultCloud || !isPro`) and so
reads true for every cloud that is not the relay. Opening the popover for an invited member without
it would offer them the one action they are refused. Both directions are pinned by tests.

**Candidates are not a directory.** `useCloudDmCandidates` unions the members of every room I am in
across the cloud, minus me. There is no user-directory action to ask — every listing is channel
scoped — so somebody in this cloud who shares no room with me cannot be reached here at all. The
empty state says that rather than implying the cloud is empty. People I already have a 1:1 with stay
in the list: the server resolves a pair to one room, so picking them re-opens that conversation.

> **The three screens have no design.** They are assembled from `web-ui-kit` primitives, following
> the nearest precedent (`PlaceInviteTab` for the picker, `ChannelList` for the section), and the
> arrangement is provisional in a way the behaviour is not. Do not read the layout as decided.

### A cloud 1:1 skips step 1 of the title chain

The chain opens with `join.nick`, and the precedence is right — my own name for a room should beat
the name its occupant chose for themselves. **What fails is the premise that the field holds my
choice.** The server seeds it on rooms nobody has named, and `customJoinNick` can only reject the
seeded values that LOOK machine-made; a seeded value shaped like a person's name is
indistinguishable from a typed one.

Measured on dev: a cloud 1:1 opened from the picker came back with a plausible human name in
`join.nick`. The header showed it; the picker, the entry system message and every other surface
showed the place profile. Same person, two names.

So `resolveChannelTitle` drops that rung **for the cloud lineage only**. A relay 1:1 begins at an
invite form where the sender types the friend's name into their own `join.nick` — a real choice, and
the relay behaviour this must not disturb.

**The settings name row follows.** It edits `join.nick`, so for a cloud 1:1 it stays as the title and
stops being a button: an editor that saves a value no screen will show is worse than none.

This is a stopgap over a server behaviour. The client is inferring provenance from a string, which is
exactly what failed. It ends when the server stops seeding the field or marks whether a value was
user-set — then the rung and the editor come back together.

## Naming

```text
resolveChannelTitle
├── self   → customJoinNick(join.nick) → my place-profile nick → "self chat" label
├── dm     → customJoinNick(join.nick) → peer's place-profile nick → channel.name → unnamed-peer label
├── owner  → channel.name → unnamed label
└── member → my join.nick → channel.name → unnamed label
```

Four rules hold that shape together.

**The DM branch intercepts before the owner/member split.** That split is wrong for a 1:1: the
inviter owns the channel, so it would return the server-set `channel.name` and ignore both the name
I gave the room and the peer's profile. That is exactly how the home list came to disagree with the
room header.

**Only values every surface can get cheaply are in the chain.** The peer's _user-record_ name is
excluded, deliberately. It hydrates through a per-channel `syncChannelUsers` call that a list cannot
afford, so including it would let the room answer differently from the list — the original bug. It
is also often a `***1234` phone placeholder, which is not a name anyway.

**A server-seeded nick is not a name.** Both chains open with `customJoinNick` — trim, reject a
value the server put there, fall through. Sharing the whole step rather than just the guard is what
stops the two chains drifting on trimming or on argument order.

What counts as server-seeded grew once, and the reason is worth keeping. It started as "the raw user
id", which is what an unnamed join carries. Then a real report: the person who ACCEPTED an invite
saw the inviter's account name as the room title. Measured on 2026-09-18 — the server seeds the
recipient's `join.nick` with the inviter's auto-generated account name (`User_0101`, built from the
last digits of a phone number), and since `join.nick` is the chain's first and most trusted step,
that value walked in through the one door the chain never questions. `isServerSeededNick` now covers
that shape and the masked `***0101` alongside the raw id.

Two things it deliberately does NOT do. It does not touch `isRawIdNick`, which `displayName` reads
on a different axis. And it does not touch the SENDER's `join.nick`, which holds the friend name
they typed on the invite form and has to survive. The accepted cost: somebody who genuinely names a
room `User_1234` loses that name — a narrow pattern against every invited person seeing a number
where a name belongs.

**`channel.name` is a last resort in a DM, not evidence.** A group's name was chosen by its owner;
a DM's was generated by the server.

### The name I give a room is a channel alias

`join.nick` is "what I call this room", not "what I call this person". In a 1:1 the two readings
overlap, and the copy says "friend name" — but they are not the same thing, and the value must not
be reinterpreted as a per-person alias. The proof is in the chain above: the same field serves the
self chat, a DM and a group member, and in a group it literally means the room's name. Two DM rooms
with the same person keep two independent values.

Writing it is `JoinNickDialog` — see [channel-settings.md](./channel-settings.md). An empty save
clears it and the title falls back down the chain. The peer sees nothing of it, and my value keeps
winning even if they rename themselves.

## Avatars

`resolveChannelAvatar` returns both the photo and the placeholder glyph, because they key off the
same branch:

| Stereo | Photo                          | Glyph  |
| ------ | ------------------------------ | ------ |
| self   | my place-profile photo         | person |
| dm     | the peer's place-profile photo | person |
| else   | `channel.thumbnail`            | group  |

Self and DM ignore `channel.thumbnail` entirely: neither room has a way to set one — settings routes
both to the join-nick dialog — and the row stands for a person. Deciding the glyph separately per
screen is how a group ends up with a one-person glyph in the home list and a chat-bubble
placeholder in settings.

## Finding the peer

`pickDmPeerId(memberIds, userId)` is the roster member that is not me, and it returns `undefined`
when my own id is unknown. Without that guard `id !== userId` is vacuously true and the first roster
entry — usually me, since the inviter owns the channel — becomes the "peer", so the room renders my
own name and face as the person I am talking to.

Two hooks wrap it, one per surface shape:

- **`useDmPeer(channel, members, profileMap, userId)`** for a single room. `profileNick` is the
  place profile only; `thumbnail` does fall back to the member cache, because an avatar a list
  happens not to have simply does not render, and showing a global one is better than showing none.
- **`useDmPeers(sid, channels, userId)`** for lists. It collects every DM row's peer off the roster
  and subscribes to profiles **once for the whole list**, deduped and sorted. Sorting is load-bearing:
  `useChannelProfiles` keys its registration effect on `ids.join(',')`, and a list ordered by recent
  activity would otherwise unregister and re-register every profile target each time a message
  arrived. It polls at `LIST_PROFILE_SYNC_INTERVAL_MS` (60s), not the room's 20s.

A room also adds the peer to its own profile targets explicitly, taking the id from the roster
rather than from `useDmPeer` (which consumes the profile map — reading it there would be circular).
`activeMemberIds` excludes a departed peer, so without that a cold cache leaves the header saying
"unnamed peer" while settings, which keeps departed members, shows the real name.

## The self chat

- One member, so no read receipts: `showReadReceipt` requires two active members.
- `RoomIntro` variant `self` — the note-to-self line, pinned at the top of the thread.
- Settings shows the name row and a single-member list, nothing else.
- **There is no way to create one here.** `apps/web` reads, names and uses a self chat that the
  server already created.
- A self chat belonging to _someone else_ is bounced out of the room (`isSomeoneElsesSelfChat`):
  only its owner can read it, so the screen would show nothing but refusals and would poll the
  owner's join on the way. It requires both ids to be known, so a legitimate room is never bounced
  while identity is still resolving.

## When the 1:1 peer leaves

A DM with nobody on the other side has to say so, refuse to send into it, and offer a way back.
Three pieces do that, all driven by one derivation.

### Two readings of "the peer is gone"

The peer's absence is read two ways, OR'd together, because the server states it two ways.

### `hasLeftChannel` — has this person actually left?

`join.joined === 0` cannot answer it: the server documents `0` as "not joined **or** withdrawn", one
value for two opposite states. `joinedNo` — the chat number the member entered at — is the
discriminator, since somebody who never entered cannot have one; `reason` counts too. With neither
field present it answers `false`, so nothing gets worse than before.

The same field windows the message feed after a re-join, so both readings agree on where my current
membership starts.

### `isDmPeerMissing` — is the peer on the roster at all?

`hasLeftChannel` needs a join row to read, and on a real departure there is none. Measured on
2026-09-18: when the peer leaves a DM the server drops them from `channel.memberIds` **and stops
returning their join row**. Nothing was left to judge, so `peerLeft` never became true and the room
stayed open with a live composer for a conversation nobody was on the other end of. That was the
reported bug, and `keepLeftMembers` could not help — it un-filters departed members from the join
list; it cannot restore a row the server never sent.

**This is not a member-count test.** A DM is two people by definition, so "the roster holds only me"
is the server's own statement that the other one is gone. The peer is looked for **by id**, exactly
as `useDmPeer` does; the count is never compared. An empty or absent `memberIds` means "not hydrated
yet" and deliberately does not count, or every healthy room would lock its composer for a beat on a
cold open.

### `resolveDmInviteState` — where does the invite stand?

A pure function over two independently-sourced inputs: whether the peer left (join rows, socket
sync) and the newest invite aimed at this channel (`invite.list`, focus refetch plus polling).
Neither waits on the other.

```text
present   peer is here            no footer, composer live
absent    gone, no live invite    "invite them to talk again"  + CTA
pending   a live invite           "invite sent" + HH:mm:ss left, no CTA
rejected  declined                "you can invite them again"  + CTA
expired   countdown hit zero      "send the link again" + 00:00:00 in red + CTA
```

- **`pending` + expired resolves to `expired`.** The server keeps answering `pending` until somebody
  re-asks, so the moment the link dies is the client's call, read off `expiredAt`.
- **`accepted` and `canceled` count as `absent`.** Every DM exists because somebody accepted an
  invite, and that row keeps pointing at this channel forever; reading it as "an invite is in
  flight" would hide the CTA permanently once the peer left.
- **`canReinviteDm` withholds the CTA while an invite is live** — a second code would leave two
  working links out there, which is the rule the sender flow already keeps.

### The composer lock and the footer

`state.kind !== 'present'` is one flag behind both the footer and `MessageInput`'s `disabled`, so
the two can never disagree about whether there is anyone to talk to. A message sent into an empty
1:1 would carry an unread badge of `1` forever.

`DmInviteFooter` is presentational — it renders the state it is handed and decides nothing. It sits
at the bottom of the stream and is **derived, not stored**: the countdown ticks, and the whole block
disappears the moment the peer returns. It is the room's current condition, not part of its history;
the in-stream join and leave notices remain the record. `HH:mm:ss` is the only format, with days
folded into hours, so a longer link would read `72:00:00` rather than collapse to zero.

The settings screen runs the same hook for the friend-info sheet, so the sheet and the footer cannot
say different things.

### Re-inviting

The CTA opens the contact-invite form directly — no confirmation step — prefilled with whatever this
device can recover. The name and number come from this device's own issue log, looked up across
**every** invite that ever pointed at this channel, not just the one the state refers to: the common
case is a room with no live invite, where the number is still recoverable from the founding
(accepted) one. The prefill is a function rather than a value, because the answer is wanted only at
the instant the CTA is pressed, on a screen that re-renders with every arriving message.

An empty prefill is a normal outcome — the server only ever returns a masked `last4` — and the form
then asks for the number. The invite itself, the retire-then-create rule and the SMS hand-off belong
to the invite feature: [../invite/README.md](../invite/README.md).

Two gates guard the CTA on both surfaces: not a guest (issuing takes a main user, and the server
answers 403 otherwise) and `canReinviteDm`. It notably does **not** require an active cloud, unlike
the group invite — a 1:1 lives on relay, so requiring one would disable the normal case.

### What settings shows

A departed peer stays in the member list with a "left the room" line, dimmed. That is DM-only:
`useChannelMembers({ keepLeftMembers })` is switched on for a 1:1 in both the room and settings,
because losing the peer from the roster loses the room's identity — the header would stop naming
them and `useDmPeer` would return `null`, taking the footer and the CTA with it. Groups keep
filtering departed members out.

A DM also has **no delete**, for either side — on the room's settings screen and on the place's bulk
remove alike. Both read `removalActionFor`, so they cannot answer it differently again. Being the
inviter is not an exception: `channel.ownerId` names whoever sent the invite, but a 1:1 has no
owner/member split, so that id is a by-product of how the room was created rather than a permission
over it. Re-inviting needs the room to still be there, and letting one side erase it takes that
away. See [channel-settings.md](./channel-settings.md).

### Read receipts

`showReadReceipt` asks whether anybody can do the reading, and it is two different questions:
a self chat never has a reader (what the room IS), and a 1:1 whose peer left no longer has one
(where the room STANDS). Both used to be carried by `activeMemberIds.length` reading 1 — one number
standing for two unrelated facts, right for the wrong reason. They are now `channelKindOf` and the
same `state.kind !== 'present'` flag behind the composer lock. The count survives as what it
actually is: the denominator that picks binary-vs-counted mode.

## Going to a message from before I left

Leaving and coming back resets my read cursor, so the room hides everything below `joinedNo`
(ADR-0067). The notifications that named those messages do not disappear with them: a push sits in
the OS tray, a row sits in the in-app notification list, a reply points at its root, a search result
links to a chat number. Five entrances onto a window that has closed.

**They are not answered one by one.** All of them end up registering the same jump request, so the
rule sits on the request rather than on each door — `useMessageJump` checks `isInJoinWindow` before
it looks for the node.

- **Outside the window → the room opens, the jump is abandoned.** The reader asked to go to a room
  they are in, and that part works; only the scroll is given up. Abandoning is not a courtesy: the
  cache is windowed by the same cursor and the server stops serving anything at or below it, so the
  eight-page budget would be spent on requests that cannot come back with the target.
- **The notice says the message is from before the rejoin.** It must not say "deleted" — the message
  exists, it is on the other participant's screen, and it is invisible here only because I left.
  Copy that blurs the two teaches people that the other side erased their history.
- **No cursor means nothing is hidden.** An absent `joinedNo` can only ever decline to act, the same
  direction `hasLeftChannel` takes.

`ThreadPage` reads the channel through the same window. It did not, once — the room passed
`joinedNo` to `useChats` and the thread did not, so history the room had just hidden was still
reachable by opening a thread on it. One rule, every surface.

**A thread whose root is out of window says so and stops there.** A reply written after my re-join
to a root from before it is inside my window and shows a thread footer, so this is one tap away.
`rootNo` is the chat number, so the screen decides it without the row — the row is what never
arrives. The generic "not loaded yet" copy and its "load older" button are both wrong here, and the
composer closes with them: a reply needs the root's id, so `handleSend` would drop what was typed
without a word.

**A room I am not in says so.** The room redirects home when the channel row was there and
disappeared, and that redirect used to be silent, which looked exactly like the app dropping the
tap. It now leaves one line behind, once per room. No way back in is offered: returning to a 1:1
takes the other side's invite, so a button there would be one that cannot work.

There is a path to the cold case too, through `useChannel`'s `isForbidden`. A room this device has
never cached sits on a skeleton until its resolve window closes and then shows a load error, because
the hook cannot tell a refusal from a fetch still coming. The sync scheduler can: it classifies a
failure the server answered 403/404 as `gone`, and the channel plan records that against the channel
id (`runtime.sync.isChannelRefused`). The room reads it and leaves with the same sentence.

**The refusal does not come from the channel read, because that one succeeds.** Measured 2026-09-21
with two accounts, from the one that had just left the 1:1: `channel.get` and the message read both
come back, so the scheduler never calls that target `gone` and the room renders history its reader
is no longer party to. The call that answers is `channel.sync-users` —
`403 FORBIDDEN - not a member of channel @verifyJoin(...)`, the server saying it in as many words —
and the gateway wrapper in `socketFactory` records it. 403 only: a 404 or a dead socket says nothing
about membership.

**And the room does not wait for it.** The row it already has carries the answer — a departed member
is dropped from `memberIds` — so `isNotMyChannel` reads it off the room itself, with no round trip
and nothing to arrive. Note how it differs from `isChannelMember`: that one answers "may I poll
other members' joins" and reads an unknown as no, because guessing wrong costs a server alarm. This
one decides whether to CLOSE a room somebody asked for, so an unknown reads as yes — **1:1 only**
(a DM roster is two people and never the truncated one; the server caps `memberIds` at 100, so a
group member can be legitimately missing from it and a group room is left alone), the roster must be
hydrated, and my own live join row still outranks it.

**What is still the server's to fix:** it serves the channel row and the messages to a non-member at
all. The client no longer shows them, but the data is being handed out, and a room the reader left
comes back into their list simply because the read succeeded.

Three properties to keep in mind before touching it. The record is made on the **first** refusal,
from the failure policy rather than `onStopped`, which needs two and arrives a poll later. A
successful view of the same channel **clears** it, so a re-invite that restores the join is not
fought by a stale "no", and an account change clears all of them. And it is **not** `isError`: a
device that is merely offline gets `transient`, records nothing, and keeps the load-error screen —
telling that person they are not in the conversation would be a lie.

## What not to do

- **Do not identify a stereo by member count.**
- **Do not re-derive a per-kind rule at a call site.** Add it to `channelStereoPolicy` and read it.
- **Do not add a surface that draws a channel without adding it to the five above.**
- **Do not add the peer's user-record name to the title chain.** It is the one input a list cannot
  afford.
- **Do not read `channel.$join.nick` on a screen that must reflect a rename.** Use
  `useChannelJoins().myJoin`.
- **Do not put `join.nick` on a person.** It belongs to the channel.
- **Do not hardcode the invite link's lifetime in copy.** Every screen derives it: from `expiredAt`
  once a link exists, and on the issue form — where it does not yet — from `INVITE_EXPIRES_DAYS`,
  the value the client is about to ask for. The form read "3 days" while the two screens after it
  counted down from one, so the same flow contradicted itself and the first screen was the one that
  lied.
- **Do not decide "the peer left" from a member count.** Look the peer up by id; see
  `isDmPeerMissing`.
- **Do not gate a move into old history at the entrance.** There are five entrances and one rule;
  put it on the jump request.
- **Do not build the footer's state from an invite list in a component.** One derivation, two
  consumers.

## Notes for implementers and tests

- The invite read stands itself down (`enabled: false`) unless the peer has left, which is what lets
  `useDmInviteState` live on `ChannelRoomPage` — a page every stereo shares. Without it every group
  room entry would fire `invite.list`.
- Polling is keyed on `peerLeft`, not on "an invite is pending": pending is this hook's _output_,
  and feeding it back in is a render loop. `peerLeft` settles independently from the join rows.
- The pure pieces carry the tests — `dmTitle.test.ts`, `selfChatTitle.test.ts`,
  `dmInviteState.test.ts` (the whole state machine), `membership.test.ts`, `resolveChannelTitle.test.ts`,
  `channelStereoPolicy.test.ts`, `useDmPeer(s).test.ts`, `useDmInviteState.test.ts`,
  `nick.test.ts`, `useMessageJump.test.ts` (the join-window abandon) — plus
  `ChannelSettingsPage.test.tsx`, `PlaceChannelManagePage.test.tsx` (the DM-never-deletes case) and
  `JoinNickDialog.test.tsx` for the screens.
- Search resolves a DM peer's profile through `useSenderProfiles`, not `useDmPeers`: the latter takes
  a single `sid` and results span the places of the searched cloud. Peers ride along with the message
  authors so the page keeps one subscription.

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [chat-room.md](./chat-room.md) — the header, the intro and the composer these rules feed.
- [channel-settings.md](./channel-settings.md) — the name dialog, the member list and the leave row.
- [../invite/README.md](../invite/README.md) — issuing and accepting a relay 1:1 invite.
