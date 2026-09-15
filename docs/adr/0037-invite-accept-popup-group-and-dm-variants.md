# ADR-0037: Group and 1:1 variants of the invite accept popup, and the new design

> Status: Accepted · Decided: 2026-07-30

## Context

The invite accept screen already exists — `apps/web/src/app/features/home/components/invite/InviteAcceptScreen.tsx`
with its three sub-cards (`InvitePlaceCard` / `InviteTargetCard` / `InviteExpiryCard`) and the glass
surface shell `InviteCard`. There are two orchestrators, and they decide the room kind **from the flow,
not from data**: `RelayInviteDialog` hardcodes `targetKind="oneToOne"`, and `CloudInviteDialog` omits the
prop (defaulting to `'group'`). This is the result of ADR-0016 and ADR-0033.

The design has now been updated and split into two nodes:

- `3072-10943` — Invitee_invite accept screen **#1:1 conversation**
- `3076-11341` — Invitee_invite accept screen **#group conversation**

The node the implementation referenced was the latter (`3076-11341`), so the overall skeleton still
holds. Narrowed down to what actually diverges:

| Item                  | Today                                                     | New design                                     |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Time remaining        | absolute expiry + `n min left` on two lines, 30s tick     | `HH:mm:ss left` on **one line**, per second    |
| The place card in 1:1 | collapsed conditionally, because there is no meta         | drawn on the 1:1 node too                      |
| Room friends chip     | `Badge tone="muted"` + a 14px lucide outline icon         | glass chip (white 20% + shadow) + 18px duotone |
| Secondary text        | `--description` `#84888F`                                 | `--label` `#53555B`                            |
| Heading               | `--foreground`                                            | `blue_bk` `#102346` = `--brand-ink`            |
| Card 2 avatar         | `DefaultAvatar` default `variant='user'` (lucide outline) | the one-person solid glyph `1명 Profile`       |
| Clock icon            | lucide `Clock` (line)                                     | Bold Duotone Clock Circle (filled)             |

Two constraints surfaced during the investigation, and they drove the decision.

1. **`memberCount` is dead code.** It is declared on `InviteInfo` and read by `InviteTargetCard`, but
   **neither dialog passes it.** The backend does not denormalize it. So there is no data to fill the
   "Room friends 20" chip, the central differentiator of the group variant.
2. **There is no data basis for the room kind.** The app's channel type field is `stereo === 'dm'`
   (`ChannelRoomPage.tsx:105`), and neither `MyInviteView` nor `RelayInviteView` carries `stereo`.

## Decision

### 1. **Exclude** the place card from 1:1 invites

When `targetKind === 'oneToOne'`, `InvitePlaceCard` is not rendered. That means changing today's "show
it if there is meta" conditional render to one based on the room kind — so even if relay invites later
carry place meta, it will not appear in 1:1. A place has no meaning in a 1:1 conversation, and this is
the choice that opens the widest gap between group and 1:1.

The place card drawn on the design's 1:1 node is treated as a leftover from duplicating the group node.

> **Withdrawn (2026-07-31)** — it was not a leftover. 1:1 draws the place card too. The gate was
> **reverted from the room kind back to the presence of data** (`placeName || placeIntro ||
placeThumbnail`), and `RelayInviteAccept` passes `site$`. An invite goes **into a place** either way,
> so the premise "a place has no meaning in a 1:1 conversation" was wrong. That the same node draws the
> time remaining as a single `HH:mm:ss` line is also the answer to the open question decision 3 below
> left ("the copy for ranges of 24 hours and more needs designer confirmation") — the designer assumed
> **a validity period of one day**.
>
> It is still unconfirmed whether relay's `invite.get` fills `site$`. Until it does, the card collapses
> quietly (the ADR-0033 D1 "build the interface ahead of the data" approach). The inviter's **place
> profile** is not in the contract at all (`inviter$` is the account `UserHead` = id + name) — a backend
> request is needed.

### 2. Room kind detection and the room friends chip stay as they are, hidden when there is no data

- `kind` keeps its per-flow hardcoding (relay → `oneToOne`, cloud → `group`). No new backend request for
  `stereo` is raised in this work.
- The "Room friends N" chip is built out in the UI exactly as designed, but because there is no
  `memberCount` it **never actually appears.** The current `memberCount != null && > 0` conditional
  render is already that state. This is exactly the ADR-0033 D1 "build the interface ahead" principle —
  the day the value arrives, it appears without a line changing. The duotone group icon is prepared in
  advance for the same reason.

### 3. Turn the time remaining into one line — `HH:mm:ss` under 24 hours only

- Add `seconds` to `useInviteCountdown` and make the tick **adjust itself to what is on screen** — one
  second for the last day, one minute above that, stopped once expired. No option is exposed, so the
  caller's contract is unchanged.
- **Delete** the absolute expiry line (`formatDeadline`) from `InviteExpiryCard`.
- The red treatment at `IMMINENT_MINUTES = 10` or less stays (not in the design, but useful
  information). The condition is `isExpired || isImminent` — `isImminent` flips back to false the moment
  the invite expires, so looking at it alone would show a dead link calmly displaying `00:00:00 left`.
  This follows the pairing `InviteWaitingPage` already uses.

**The formatting is a hybrid.** The design drew only `HH:mm:ss`, but invite links live **three days on
the backend** (ADR-0033 D8), so that formatting, which assumes under 24 hours, cannot express a freshly
received link. So:

- `days >= 1` → `2d 5h left`
- `< 24h` → `HH:mm:ss left` (every second)

Both go through the one existing i18n key `inviteAccept.expiry.remaining` (whose ko value is the literal
`{{time}} 남음`), so there are no new i18n keys. **The copy for ranges of 24 hours and more is something
we chose, so it needs designer confirmation** — ADR-0033 D8's "request a copy change for the time
remaining" is still open.

The existing comment on `InviteExpiryCard`, "Invite links live at most ~30min", is **not true** (it is
really three days). That wrong comment is what made a bare `HH:mm:ss` look reasonable in the first place
— it is fixed along with this.

### 4. The only additions to web-ui-kit are **three icons**

Extract the SVGs from Figma and define them in `resources/icons` following the existing custom glyph
convention (`IconGroup`, `IconUserSolid`, `IconPin`, `IconChatAdd`).

| Name (proposed)  | Figma                                                         | What it replaces   |
| ---------------- | ------------------------------------------------------------- | ------------------ |
| `IconClockSolid` | Bold Duotone / Time / Clock Circle (`3073:10991`)             | lucide `IconClock` |
| `IconUsersGroup` | Bold Duotone / Users / Users Group Two Rounded (`3158:26141`) | lucide `IconUsers` |
| `IconImageSolid` | Place photo placeholder 40px (`3073:10971`)                   | lucide `IconImage` |

**Extraction check (2026-07-30)** — the three glyphs were actually fetched from the Figma asset server
and compared against the kit's assets:

- The shape of `IconImageSolid` is **identical** to the kit's `resources/assets/default-place-avatar.svg`
  (86px) — the coordinates are exactly 0.4651×. But that is a URL-imported asset with `#102346` baked
  in, so it supports neither `currentColor` nor dark mode, and its only consumer is the upload default
  image in `CreatePlaceDialog`. So the asset is left alone and **a new component is built** — this item
  exists not because "the kit has no glyph" but because "the kit has no theme-capable form of it".
- The `1명 Profile` glyph on card 2 is **identical** to the kit's `IconUserSolid` (0.952×). Decision 5
  satisfies it with `DefaultAvatar variant='self'`, and **no new asset is needed.**

Promoting `GlassCard`, adding a `glass` tone to `Badge`, and promoting `InviteAcceptScreen` itself into a
kit composite are **not done.** The glass surface and the chip's colour and padding stay local to the app
(`InviteCard`, `Badge` + `className`) — the only place that reuses them is this one screen, so the case
for lifting them into the kit is weak.

### 5. Card 2's avatar is the one-person solid glyph in both variants

Use `DefaultAvatar variant='self'` (= `IconUserSolid`, Figma `1명 Profile`). The kit's existing
three-person glyph (`variant='group'`) is not used for group — the design file is taken as the truth. That
the group node's avatar is identical to the 1:1 one down to the asset hash has been noted, and if the
design changes it is a one-line prop change.

### 6. The background stays the current CSS gradient

The design's 384×733 SVG shape asset is not extracted. With `backdrop-blur-75` applied, the shape is
practically indistinguishable from a CSS approximation, and the CSS side is better for width adaptation
and dark mode, at zero bytes.

### 7. Every colour and sizing correction is applied

Secondary text `--description` → `--label`, heading → `--brand-ink` (plus dark mode handling), the time
card's `gap` 12 → 8px, chip padding `px-3.5 py-2` plus the glass colour, and the place fallback icon
replaced with the duotone photo glyph.

The footer **keeps its current frosted look** (`white/55` + `blur-16`). Figma's `#dbdbda` is read as the
flattened result of rendering that blur.

### Out of scope

- Raising new backend requests (denormalizing `stereo`, `memberCount`, or the channel image)
- The state dialogs for expired/already joined/cancelled (ADR-0033 Track C item 2) — unchanged
- The accept pipeline and channel resolution (ADR-0035) — unchanged
- The decline button: `RELAY_INVITE_DECLINE_ENABLED = true` already matches the design

## Alternatives

**Always render the place card in 1:1 too** — faithful to the design node, but it needs a new backend
request to carry place meta on relay invites, and the meaning of showing a place in a 1:1 conversation is
unclear. Dropped.

**Fetch the channel before accepting to get `stereo` and the member count** — before accepting, the user
most likely has no access to the channel, so this only adds failure paths. Dropped.

**Promote `InviteAcceptScreen` into a kit composite** — it fits the spirit of the instruction "define
missing components in the library", but only one app reuses it, and the screen is tied to
`useTranslation` and the app's i18n keys, which breaks the kit's presentation-only contract. Only the
icons go up.

**Extract the background SVG asset** — it gets pixel parity, but the fixed viewBox means width adaptation
and dark mode have to be written separately, and the asset is heavy. Dropped.

## Consequences

**What is gained**

- The difference between group and 1:1 opens up in **the card composition itself**, not in one caption
  line (place card present or absent, plus the room friends chip).
- The time remaining moves per second through the final day. That is the range where users actually
  hurry.
- The icons move from lucide approximations to the original Figma glyphs, improving visual fidelity.
- The kit surface grows by three icons only, so the blast radius is small.

**Trade-offs accepted**

- **The room friends chip still does not appear on screen.** The representative element of the design's
  group variant is empty for want of a backend. It can only be checked in Storybook, and this ADR does
  not answer when the data will arrive.
- **The room kind is still hardcoded per flow.** The moment a path exists for inviting into a group room
  over relay, it breaks — this is left as debt until `stereo` is carried.
- The per-second tick also applies to [`InviteWaitingPage`](../../apps/web/src/app/features/invite/pages/InviteWaitingPage.tsx),
  which shares `useInviteCountdown`. The self-adjusting tick confines that cost to the final day, but in
  that range a screen that only shows minutes re-renders every second. If it becomes a problem, exposing
  `tickMs` as an option is the next move.
- The absolute expiry time is lost. A user who wants to know exactly "until when" has to work backwards
  from the time remaining.
- The group avatar stays the one-person glyph — an item awaiting design confirmation.
- **Two places now use different colours in light and dark.** `--brand-ink` is the same value in both
  themes, so on a dark surface the heading loses contrast (hence `dark:text-foreground`) and the photo
  placeholder glyph drops to 1.2:1 (hence `dark:text-white/80`). The latter is because the motif is a
  **cut-out**, so the glyph colour shows the background straight through — a problem the previous
  implementation hid behind a filled disc with a white glyph. The design drew light only, so the dark
  values are our judgement.

## References

- ADR-0016 moving the invite accept popup into web-ui-kit
- ADR-0033 relay DM invite · auth parallel tracks (D1 building the interface ahead, Track C the
  recipient flow)
- ADR-0035 channel resolution after a relay invite is accepted
- Figma `3072-10943` (1:1) · `3076-11341` (group)
