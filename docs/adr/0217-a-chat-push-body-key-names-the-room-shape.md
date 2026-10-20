# ADR-0217: A chat push's body key names the room shape

> Status: Accepted · Decided: 2026-10-19 · Implemented: `feat/push-payload`
> · Scope: the four push locale sets under `apps/mobile` (`push_chat_<shape>_<kind>_body`) ·
> `apps/mobile/src/app/services/notification/localeParity.test.ts`
> · Related: [ADR-0098](./0098-cloud-activated-notification-app-readiness.md) — where every push key
> came to live in four locale sets
> · The module doc is [apps/mobile push](../../apps/mobile/docs/push/README.md#room-shapes)

## Context

A chat push said who wrote and what they wrote, and nothing about where. A group message and a 1:1
message produced the same banner — the sender's name over the text — and a reply in a thread looked
like a message in the room. Product wanted a group banner titled with the room's name with the sender
in the body (`Sunny : hi`), and a thread reply marked as one (`[Thread] …`).

The copy is assembled on the device, three times over: by the Android messaging service in every app
state, by the iOS Notification Service Extension in the background, and by the RN shell for an iOS push
in the foreground. Each looks up `loc_key` in its own locale set and fills `{0}`, `{1}` from `loc_args`
in order, with one shared guard: a template whose placeholders the args do not reach becomes the
generic fallback body. The server picks the key; the device only fills it in.

The body already varies by kind: text, or one of seven attachment descriptions (a photo, N photos, a
video, …). The room shape is a second axis on top of that one.

## Decision

The server keeps choosing one `loc_key`, and the key now carries the room shape as well as the kind:
`push_chat_<shape>_<kind>_body`, where the shape is `thread` (a reply in a 1:1), `group` (a message in a
room that is not a 1:1) or `group_thread` (a reply in such a room). A 1:1 room's own messages keep the
existing keys. Three shapes times eight kinds is 24 new keys, added to all four locale sets.

A group shape puts the sender at `{0}` and moves the existing args up one. Its title arg is the room's
name instead of the sender's.

The assemblers do not change. Each new key is plain copy that the existing lookup and positional fill
already handle, and the existing fallback guard already covers a group key that arrives with only the
sender.

`localeParity.test.ts` checks that all 24 keys exist in every set, and that each contains its plain
key's copy with the args moved up one in a group — the attachment wording now lives in four keys per
kind, and an edit to one alone fails the test.

## Alternatives

- **A separate field that wraps the body** (`data.frame_loc_key`, three keys: thread, group, group
  thread). Fewer keys, but every assembler would need new code to look up a second template and put
  the first one's result inside it — three implementations of one rule, in Kotlin, Swift and
  TypeScript. The wrapper key would also have to be read from `payload`, whose shape differs by
  platform (a JSON string on Android, a map on iOS), where the existing keys are top-level on both.
  Rejected: the extra code and its drift risk cost more than 21 extra lines of copy.
- **Android `MessagingStyle` / iOS communication notifications.** Both draw a sender and a conversation
  name natively, and put the sender's image on the left. Both also redraw the title and body their own
  way, so the three paths would stop showing the same copy, and the iOS one needs a capability on the
  app's provisioning profile. Rejected: the point of this change is that every path says the same thing.

## Consequences

- **The app ships before the server sends.** A build without the shape keys shows the key name itself
  (`push_chat_group_message_body`) — the assemblers leave an unknown key visible on purpose, as the sign
  that a payload outran the build. The server sends the shape keys only once a build that has them has
  spread, the same order the attachment keys followed.
- Every future body kind is added once per shape: four keys, not one.
- Substitution is in order, so a sender name that itself contains `{1}` would have the message put in
  its place. No key had two args before, so this could not happen until now; fixing it means changing
  all three assemblers together, and is left for when it is seen.
- Clients that keep their own table of body keys do not learn the shape keys from this change. The
  desktop app's cross-cloud presenter knows the plain attachment keys only, and its shell takes the
  first loc arg as the body — for a group key that is the sender's name. It needs its own change before
  the server sends the shape keys.
