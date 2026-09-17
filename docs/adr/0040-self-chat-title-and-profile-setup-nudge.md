# ADR-0040: Fix the self chat display name and nudge profile setup

> Status: Accepted · Decided: 2026-08-03
>
> ⚠️ **A parallel session exists.** On the same day
> [ADR-0041](0041-place-profile-as-invite-precondition.md) decided profile creation on the invite path,
> and it **consumes** decision 6 (`PlaceProfileCreateDialog`) and decision 7
> (`resolvePlaceDisplayName`) of this ADR. In the other direction, the `PlaceProfileForm` used by
> decisions 4 and 5 here is modified by ADR-0041. Signatures, file ownership and the order of work are
> canonical in docs/plans/place-profile-create-shared-contract.md, which lived in the root docs tree
> and has since been removed. **Read it before starting implementation.**

## Context

The request was "improve the self chat on HomePage and ChannelRoomPage", and it named `stereo == 'dm'`
as the target. Investigation says **the target is `stereo === 'self'`.**

`ChannelStereo` is `'' | 'public' | 'private' | 'dm' | 'self'` (`@lemoncloud/chatic-socials-api`), and
in this app the two values are different things.

|             | `'self'`                                                                                                         | `'dm'`                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meaning     | Chat with myself (member = me alone)                                                                             | 1:1 (there is another person)                                                                                                                                   |
| Title chain | join.nick → **my** profile.nick → `나와의 채팅` (`apps/web/src/app/features/channels/utils/selfChatTitle.ts:16`) | join.nick → **the other party's** profile.nick → channel.name → `대화 상대` ([dmTitle.ts](../../apps/web/src/app/features/channels/utils/dmTitle.ts), ADR-0039) |

There are two grounds for reading it as `self`. (1) All four attached Figma frames are self screens —
the title is `Self Chat`, the room friends list is a single `MY` row, and the notification and leave
sections are absent. That is exactly the screen the current `isSelfChat` branch of
`apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx:253` produces. (2) The chain the
request writes (`join.nick → profile.nick → label`) is the self chain as it stands, not the dm chain.

### Half of the request is already implemented

- **The display name chain** — `resolveChannelTitle` is shared by **four screens**: HomePage
  (`ChannelList`), `ChannelRoomPage`, room settings and chat room management, and its self branch is the
  requested chain exactly (ADR-0039 decision 1).
- **Nickname (join.nick) setup** — `JoinNickDialog variant='self'`. Even the "name placeholder = owner's
  name" of Figma `3451-21323` is in place, via
  `apps/web/src/app/features/channels/components/JoinNickDialog.tsx:63` (`fallbackName ?? profile?.nick`).
- **Showing the profile after profile setup completes** (Figma `3451-21413`) — when profile.nick exists,
  the current code already produces that screen.

### Three things that are actually empty

1. **My row in room friends exposes a value that is not a human name.** In
   `apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx:210` the value is
   `memberName = memberProfile?.nick || member.name || memberId`, so when profile.nick is missing you
   get `member.name` (for phone users, `***<last 4 digits>`, ADR-0089 D10) or a raw UUID.
   **ADR-0039 excluded `\***1234` from the display name chain on the grounds that it does not read as a
   name, and that value leaks through this path.\*\*
2. **The home place name is printed raw.** `useActivePlaceName()` returns `place.name` unprocessed, so
   the backend value `default`/`#default` lands directly in the `<place>에 사용할 내 프로필을...` slot of
   Figma `3026-11374`.
3. **The en label diverges.** `channelList.selfChannel` is ko `나와의 채팅` / en **`My Chat`**, while
   Figma and the request say `Self Chat`.

### The materials are already preserved

ADR-0039 took profile enforcement to zero across the app and deleted `RelayInviteProfileDialog`, but it
recorded that its copy `placeProfileCreate.*` (16 keys) was **"left in place rather than deleted,
because the re-nudge UX that was deferred out of scope may use it"**. The `subtitle` prop of
`PlaceProfileForm` also survives with no consumer, carrying the comment `"Omitted in the edit flow"`.
This screen is that re-nudge UX, and both materials fit it as they are.

### The home place signal is split

- Current code: `selectedCloudId === 'default'` (the cloud context). `HomePage`, `PlaceList`,
  `useHomePlaces`, `useHomeChannels`, `useActiveCloudChannels` and others use this signal. The comment at
  `apps/web/src/app/features/home/components/PlaceItem.tsx:19-21` states that the legacy
  `place.id === 'default'` never matches a real relay place, so the cloud context is the reliable signal.
- The request: `placeId === '0000'`. There is evidence that this value is a real sid
  ([place-settings.md](../../apps/web/docs/feature/place/README.md) shows
  `localStorage['chatic-channel-sort'] === {"0000":"unread"}`).
- The labels are split too: `placeList.defaultPlace` is `DoU Home` in both ko and en, while
  `cloudSessionSheet.douHome` is ko `두유 홈` / en `DoU Home`.

## Decision

### 1. The target is `stereo === 'self'`. The display rules for dm/group are not touched

ADR-0039 settled the dm chain three days ago. It is not reopened.

### 2. Settle the display name chain with no new logic, and only guard against regression

The chain is **join.nick (raw ids rejected) → my profile.nick → `나와의 채팅`/`Self Chat`**, and the
current structure — four screens sharing one `resolveChannelTitle` — stays. The only new code is
regression tests for HomePage and ChannelRoomPage.

**But the legacy duplicate resolver is removed.** `resolveChannelName` in
`apps/web/src/app/utils/channel.ts` is only `$join.nick → channel.name`, so it has **neither the
raw-UUID guard nor a stereo branch**, and `useChannel` exposes it as `ClientChannelView.displayName`
(`apps/web/src/app/features/channels/hooks/useChannel.ts:17`). While a channel can have a correct
`roomTitle` and a UUID `displayName` at the same time, the unified chain can break again at any moment.
Check the consumers, move them to `resolveChannelTitle`, and delete both.

### 3. Change the en label to `Self Chat`

`channelList.selfChannel`: ko `나와의 채팅` stays, en `My Chat` → `Self Chat`.

### 4. **My row** in room friends: when profile.nick is missing, show "Profile setup needed"

- Underlined, after the `MY` badge (Figma `3185-13278`).
- **Remove the `member.name` and `memberId` fallbacks from my row.** If profile.nick is missing there is
  no human name, and showing `***1234`/a UUID instead is a choice ADR-0039 already rejected.
- **Do not gate on `stereo`** — the member list is a mapping shared by self/dm/group, and the leaking
  value leaks in all three places alike. Adding a condition so that only self is fixed grows a branch in
  shared code and leaves a known exposure in dm/group. Figma showing only the self screen is not a
  prohibition on dm/group.
- **Other people's rows are unchanged** — I cannot resolve someone else's missing profile, so no nudge
  copy can be attached there.

### 5. Clicking my row branches on the condition

- profile.nick **missing** → go **straight** to the profile creation dialog (one tap).
- profile.nick **present** → keep the existing `MemberProfileDialog` (profile → "Profile settings").

Figma agrees — my row in `3185-13278` has a chevron, and `3451-21413` does not.

### 6. New `PlaceProfileCreateDialog` — `placeProfileCreate.*` gets a consumer again

It is a pure wrapper around `PlaceProfileFormDialog`. `PlaceProfileForm` and `PlaceProfileFormDialog` are
not touched (`subtitle` is already there). Only two pieces of copy change.

- `placeProfileCreate.title` — Figma inserted "내" (my), as
  `<플레이스>에 사용할 **내** 프로필을 만들어 주세요`. That is adopted; the literal wording is the change.
- `placeProfileCreate.exitDescription` — currently `"이름을 설정해야 DoU를 시작할 수 있어요!"`
  ("you must set a name before you can start DoU"). **After ADR-0039 took profile enforcement to zero,
  that sentence is false.** Abandoning the flow still leaves the app usable, so it is rewritten in the
  same spirit as the abandon copy of `placeProfileEdit`.

### 7. Home place display name: a shared helper plus ko `두유 홈`

- Add `resolvePlaceDisplayName` (a pure function), shared by `PlaceItem`, `DouHomeItem` and
  `useActivePlaceName`. Because this name becomes the profile dialog title, the raw `default` exposure
  disappears.
- The check uses the **existing `isDefaultCloud` (`selectedCloudId === 'default'`) as the primary signal**
  and **also accepts `sid === '0000'` as a secondary** one (OR). Five places already use the cloud signal,
  so that is canonical, and the request's `'0000'` is not discarded because there is evidence it is a real
  sid.
- The label is unified as **ko `두유 홈` / en `DoU Home`**. The ko value of `placeList.defaultPlace` changes
  from `DoU Home` to `두유 홈` so that it matches `cloudSessionSheet.douHome`.

### Out of scope

- The **display name** rules for dm/group (the member row fix in decision 4 applies to every stereo; the
  title chain is self only)
- Profile nudges on channel rows in the home list — there is no Figma, so copy and shape would have to be
  invented
- `ChannelSettingsPanel` in `desktop-web` (a different screen that has no stereo branch at all)
- New backend requests, notification and sort settings
- Cleaning up the unused legacy `profile.nickname*` i18n block

## Alternatives

**Deciding on the `sid === '0000'` literal alone** — it is the request verbatim and shrinks the helper
body to one line. It was dropped because five hooks already treat the cloud signal as canonical, which
would leave the check split in two, and because a `'0000'` sid appearing in a cloud other than relay
would be a false positive. Using only the cloud signal was dropped too — the request named the sid and
that value really exists, so it is safer for the helper to accept both. Reducing to a single signal waits
until the sid immutability of a relay place is confirmed.

**Reusing the existing `PlaceProfileEditDialog`** — zero new code and it is already mounted in room
settings. It was dropped because its title is "Place profile" and it has no subtitle, which differs from
Figma `3026-11374`. This is the place where we speak to someone who **has no** profile, so the "please
create one" copy is the right one, and that copy already exists in `placeProfileCreate.*`.

**Putting "Profile setup needed" on the channel name row** — reading only the request's sentence ("copy
is added in room settings ...") this was a possible interpretation. Figma keeps `Self Chat` on the channel
name row and puts the copy only on the room friends row. The channel name has a valid label even without
profile.nick, so it is not a nudge point.

**Applying it to every member row** — a missing profile for someone else has no click destination.
Dropped.

**Always going straight to the creation dialog** — the "Profile settings" path of `MemberProfileDialog`
dies, and with a healthy profile the edit screen appears before the profile view.

**Leaving the `resolveChannelName` legacy in place** — it could have been deferred as unrelated to this
spec. But while it lives, "there is one chain" is not true, and that sentence is exactly what decision 2
is settling.

## Consequences

**What is gained**

- The last path that exposes `***1234`/a raw UUID in a human-name slot is closed — the principle ADR-0039
  set now reaches the member list. It is fixed in dm and group together with self, not only self.
- Users without a profile get their first in-app nudge point. This is the first implementation of the
  re-nudge UX that ADR-0039 deferred as "out of scope" when it took enforcement to zero.
- The home place check and label converge on one helper, and the raw `default` exposure in the profile
  dialog title disappears.
- The 16 `placeProfileCreate.*` keys and `PlaceProfileForm.subtitle` get a consumer. New form and kit
  components: zero.
- Only one display name resolver remains.

**Trade-offs accepted**

- Changing the ko value of `placeList.defaultPlace` also changes **the home place list label from
  `DoU Home` to `두유 홈`.** That screen is outside this spec, but keeping the two labels split makes
  unifying them meaningless.
- With the name fallback removed from my row, the slot where my name would go stays a nudge for as long as
  I do not create a profile. To see a name you have to create a profile — intended pressure, but not
  enforcement.
- The home place check stays an OR, so two signals coexist inside the helper. Full unification is a
  follow-up.
- Clicking my row becomes two-way, so room settings gains one conditional branch and tests have to cover
  both paths.
- Because decision 4 applies to every stereo, **my row in dm and group room settings changes too.** A
  change lands on screens with no Figma confirmation — though the direction of the change is "an unreadable
  value → actionable copy".
- Removing `resolveChannelName`/`displayName` requires a consumer survey first, and it is the change in
  this work that can spread the widest.

## References

- [ADR-0039](0039-dm-display-name-chain-and-invite-profile-release.md) — unifying the display name chain,
  releasing profile enforcement, and the decision to keep `placeProfileCreate.*`. This ADR fills in that
  "re-nudge UX".
- [ADR-0026](0026-self-chat-channel-type.md) — the self channel type and writing `join.nick`
- [ADR-0031](0031-place-settings-hub.md) · [ADR-0020](0020-place-profile-edit-dialog.md) — the existing
  paths for profile setup
- [ADR-0089](0089-relay-dm-invite-and-auth-parallel-tracks.md) D10 — where the `***1234` display name for
  phone users comes from
- Figma: `3185-13278` (profile setup needed) · `3026-11374` (profile creation) · `3451-21413` (after setup
  completes) · `3451-21323` (nickname setup)
- A known error in code comments: `ChannelList.tsx:68` and `resolveChannelTitle.ts:47` record the self
  channel as "ADR-0022", but it is actually **ADR-0026** (0022 is the invite page). Fixed along with this
  work.
