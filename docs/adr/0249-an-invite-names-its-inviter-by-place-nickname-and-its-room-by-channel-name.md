# ADR-0249: An invite names its inviter by place nickname and its room by channel name, and a used link says so

> Status: Accepted · Decided: 2026-10-28 · Implemented: `feat/invite-card-and-expiry`
> · Scope: `apps/web/src/app/features/invite/accept/` · `apps/web/src/app/utils/resolvePlaceDisplayName.ts`
> · Supersedes in part: [ADR-0037](./0037-invite-accept-popup-group-and-dm-variants.md) — only its target card
> as the invitee's own "You" block. The rest of that ADR stands.
> · The module doc is [apps/web invite](../../apps/web/docs/feature/invite/README.md#what-the-accept-screen-names)

## Context

The accept screen is the first thing an invitee sees, and until now it named people with the wrong
words:

- **The heading named the inviter by account name.** Both accept surfaces read `inviter$.name`. A
  number-derived account has no better name than its masked phone digits, so a heading could read as
  a string of digits rather than a person.
- **The room card said "You".** `InviteTargetCard` drew the invitee's own avatar under a fixed "You"
  label for every kind of invite, including a place invite that joins no room at all.
- **The place card showed the raw place name.** The relay's personal place is called `default`
  in the backend and is shown as "DoU Home" everywhere else in the app, except here.
- **A link that had already been used read as an expired one.** The cloud accept maps every `400` to the
  expired dialog, and the backend answers a link whose grace period has passed with a `400` whose
  message contains the expiry message as a substring.

The backend now attaches the inviter's **place profile nickname** (`inviter$.nick`) and, for a group
room invite, the **room name** (`channelName`) when an invite is looked up. Both are read at lookup
time rather than stored when the invite is issued, so an older invite carries them too and an inviter
who renames themselves is followed. A key is left out when there is nothing to say.

## Decision

1. **The heading's name is `inviter$.nick`, trimmed, and nothing else.** When it is missing or blank the
   screen shows its existing nameless line ("You've been invited to DoU"). The account name is never a
   fallback: a nickname the inviter chose in this place is a name a person recognises, and an account
   name is not guaranteed to be one. The cloud and the relay surface change in the same commit, so the
   difference does not move to the invite-kind axis.
2. **The room card depends on what the invite leads to.**

    | Invite                       | Card  | Name line       | With no name |
    | ---------------------------- | ----- | --------------- | ------------ |
    | Cloud place invite (no room) | none  | —               | —            |
    | Cloud group-room invite      | shown | `channelName`   | caption only |
    | Relay 1:1 invite             | shown | `inviter$.nick` | caption only |

    The caption ("Group chat" / "1:1 chat") and the member badge stay. A card never shows "You" and never
    leaves an empty name line. Which kind an invite is still comes from `resolveCloudInviteTargetKind`
    (a room id is present or it is not), unchanged.

3. **The place card's name goes through `resolvePlaceDisplayName`, with its context taken from the invite
   kind.** A relay invite is the relay's personal place, so it reads "DoU Home". A cloud invite is never
   treated as the default cloud, **even when the invitee has the relay selected while opening the link**:
   reading the current selection instead (as `useActivePlaceName` does) would rename a cloud invite's
   place to "DoU Home" for anyone who happens to be on the relay. The name of a cloud's own default place
   is not settled and is not handled here.
4. **A link the backend refuses for its grace period is "already joined", not "expired".** A cloud link's
   first login may be repeated for a short while; after that the backend refuses it. The accept step
   checks for that message **before** its generic `400` check, because the grace message contains the
   expiry message, and routes it to the existing "already joined" dialog.

## Alternatives

- **Fall back to the account name when there is no nickname.** Keeps every heading personal, but it
  brings back the digit string this decision exists to remove. Rejected.
- **Keep the "You" card and add the room name above it.** The card would carry two identities, and a
  place invite would still show a room it does not have. Rejected.
- **Read the place context from the current selection.** One line less, and wrong for the case above.
  Rejected.
- **Add a distinct dialog for a used link.** The copy that exists for "already joined" is exactly what
  the person needs to hear, and a new dialog would need design. Rejected for now.

## Consequences

- **Deploy order is the backend first, then the app.** An app that ships before the backend shows the
  nameless heading and caption-only cards on every invite, because it no longer falls back to anything.
- **A cloud that has not taken the backend change yet keeps serving invites without the two fields.**
  Those show the nameless heading and a caption-only card. Nothing breaks and no account name appears.
- **Someone else who opens a forwarded link after it has been used sees "already joined".** The backend
  does not say who used it, so the dialog cannot tell them apart.
- **The inviter's photo is untouched.** When the heading falls back to the nameless line, the avatar
  above it is still the inviter's picture if the invite carries one.
- **A cloud's default place keeps its raw name on the accept screen** until that name is decided.
- The home list's "invited cloud" caption still uses the inviter's account name. It says who owns a
  cloud, not who invited the reader, so it is a different question and stays as it was.
