# Invite accept popup: redesigned on web-ui-kit — a full-screen accept screen plus four AlertDialog errors

## Status

accepted

Decided: 2026-07-16

Related: [0012](./0012-place-profile-creation.md), [0013](./0013-home-screen-web-ui-kit-migration.md)

## Context

`InviteDialog` (`apps/web/src/app/features/home/components/InviteDialog.tsx`), the popup that opens
when an invite deeplink is followed, is **the only home overlay left that does not use `web-ui-kit`**.
It draws its own overlay (`fixed inset-0 ... bg-[rgba(41,41,58,0.23)]`) and a small centred
`bg-white/80 backdrop-blur` card, hardcodes every colour (`#b0ea10`, `#222325`, `#84888f`), and has
neither the Radix accessibility behaviour (focus trap, ESC, overlay click) nor any animation. Its
sibling overlays — `OnboardingModal`, `PlaceProfileCreateDialog`, `CloudSessionSheet` — have already
migrated to the kit.

The redesign landed in Figma (file `ViwLfjc5Eoq7BpEXFfFj3W`):

- `3075-11215` / `3072-10943` — the accept screen: the inviter's avatar, "<name> invited you to DoU",
  a place card, a `You / 1:1 chat` card, (in `3072`) an invite-link expiry card, and `Decline` /
  `Accept` at the bottom
- `3077-11587` — the accept screen for a group: a `20 room friends` badge on the You card, and **red**
  when the expiry is close
- `3077-11719` — AlertDialog, **invite link expired**
- `3078-12015` — AlertDialog, **invite already accepted**
- `3079-12154` — AlertDialog, **chat room deleted**
- `3079-12304` — AlertDialog, **invite cancelled**

Two gaps against the current code:

1. **A data gap.** The `inviter$` / `site$` / `user$` fields on the `MyInviteView` that `useInviteInfo`
   returns are all `Head` types carrying `id` and `name` only. What Figma needs — **the place's
   introduction text and thumbnail, the channel's member count, and the inviter's avatar image** — is
   not there. The user has not joined yet, so the front end has no permission to fetch site or channel
   detail separately either. `expiredAt` (30 minutes at most) does exist, so the expiry countdown is
   possible.
2. **An error-classification gap.** `resolveInviteErrorKey` reliably distinguishes only `expired`;
   already-accepted, deleted and cancelled all collapse into `enterFailed` / `failed`. Errors are also
   caught **only after an accept attempt**, whereas Figma's deleted / cancelled / already-accepted
   cases are naturally decided at load time.

`InviteDialog` is also mounted on home **unconditionally**, driven by the URL, so it can overlap the
onboarding and profile-creation overlays (all `z-50`) and sits outside the priority logic.

## Decision

**Scope: redesign the invite accept popup on `web-ui-kit`, and add to the library only the primitives
that are genuinely missing. Data flow and the accept pipeline (`useInviteAccept`) are preserved — this
is a presentation migration plus overlay integration, not a rewrite.**

### The accept screen — full-screen slide-up

- The small centred card becomes a **full-screen slide-up dialog**. It reuses the
  `PlaceProfileCreateDialog` pattern: `Dialog` (`@chatic/ui-kit`, slide-up) plus `ModalTopBar` (DoU
  logo left, X right) plus a scrolling body plus a **fixed two-button footer (`Decline` / `Accept`)**.
- The body: the inviter's avatar (initials fallback when there is no image) and the heading, the
  **place card** (thumbnail, name, introduction), the **`You / 1:1 chat` or group card** (decided by
  `stereo` / `channelId`, with a `N room friends` badge for a group), and the **invite link expiry
  card** (`expiredAt` countdown, red when close).
- `Accept` calls the existing `accept()`. `Decline` runs the existing dismiss (strip the query, go
  home). The logic is unchanged.

### Errors — four web-ui-kit `AlertDialog`s

- Expired, already accepted, deleted and cancelled are **all built as `AlertDialog`s** (centred,
  single `OK` button).
- Wiring covers **only what can be distinguished**: expired maps cleanly, the rest are wired as far as
  the backend error codes allow, with a generic fallback for what cannot be told apart. Completing the
  wiring is tracked as follow-up.
- The `missingDelegator` state (which prompts a sign-out) is not in Figma but stays, unified as an
  `AlertDialog` like the others.

### Overlay priority — onboarding > invite > profile creation

- The invite popup **joins** HomePage's priority logic: while `isFirstRun` (onboarding) it is
  suppressed, and if the invite query is still in the URL after onboarding finishes, it opens then.
- Place profile already yields to onboarding, and it naturally follows **after** an invite is
  accepted, at the point of entering the place, so the two are separated in time.

### The data contract — declare the backend extension, degrade gracefully in the front end

- State the fields the backend has to add to the invite-info response (`MyInviteView`, or `site$` /
  `inviter$`) **as a contract**: the place introduction, the place thumbnail, the channel member count
  and the inviter's avatar image. (The backend work is outside this front-end repo — an upstream
  dependency.)
- The front end consumes that contract but **degrades gracefully until the fields arrive** (hide the
  introduction, thumbnail and member count; fall back to initials or a default avatar), so it can
  **ship on its own**.

### New in web-ui-kit — only what is genuinely missing

- `AlertDialog`, `Button`, `Avatar` and (from `ui-kit`) `Dialog` / `ModalTopBar` are reused. Figma's
  information cards (place, You, expiry) and the two-button footer are attempted first from existing
  `list` / `layout` combinations; only a shape that is clearly worth reusing is promoted into the kit.

## Considered Options

- **Degrade only, leave the backend alone** — rejected. Without the introduction, thumbnail and member
  count, the Figma accept screen is half a screen. The backend extension is declared a real dependency
  while the front end goes first with degradation.
- **Have the front end fetch site and channel detail before accepting** — rejected. Before accepting,
  the user is not a member and has no permission. The only path is for the backend to denormalise this
  into the invite response.
- **Invite takes priority (a deeplink is immediate intent)** — rejected in favour of onboarding first
  (a new user sees the app introduction first). The deeplink survives as a query and opens after
  onboarding.
- **Reskin only, leave the overlap alone** — rejected. The unconditional URL-driven mount is a real
  defect against onboarding and profile creation, and it gets fixed here.

## Consequences

- The invite popup renders from the design system, and the hardcoded hex, the hand-built overlay and
  the missing accessibility all go away.
- **A backend dependency appears.** Until the fields arrive, the place introduction, thumbnail and
  member count render empty (degraded) — an intended interim state, tracked as follow-up.
- Of the four errors, everything but expired needs the backend error codes confirmed before the wiring
  is complete (follow-up). All four UIs are ready.
- The invite popup does not appear during onboarding. If onboarding runs long enough for `expiredAt`
  (≤30 minutes) to pass, the expiry dialog appears afterwards — accepted.
- The expiry is 30 minutes at most, so Figma's `n days n hours` template renders only minutes in
  practice.
