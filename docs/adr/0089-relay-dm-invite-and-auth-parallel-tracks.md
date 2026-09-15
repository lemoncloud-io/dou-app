# ADR-0089: Relay 1:1 (DM) invites and phone verification — build the interfaces ahead, split into parallel tracks

> Status: Accepted · Decided: 2026-07-29

## Context

The backend (relay-server 1:1 invites) is done. Six websocket packets in `chatic-sockets-api` are wired,
tested and self-reviewed (`invite.create/get/list/accept`, `auth.verify-hash-alias`,
`auth.attach-social`), and the client gateway ships in `@lemoncloud/chatic-sockets-lib@0.4.9`. The
contract itself lives in `chatic-sockets-api/docs/specs/relay-server-invite/` (especially
`05-client-guide.md`).

Where the app stands (from the survey):

- The "1:1 chat" entry in home's ＋ menu only raises a placeholder toast
  (`apps/web/src/app/features/home/pages/HomePage.tsx:224`).
- The DM room and settings screens exist (`stereo === 'dm'`, ADR-0032). **Only the creation pipeline is
  missing.**
- The invite accept popup `InviteDialog` (for cloud invites, ADR-0016), the chat room management screen
  (`PlaceChannelManagePage`, `/place/:placeId/settings/channels`), deeplink V2's `invt:` code parsing, and
  the native `SendSms` / `openShareSheet` / `copyClipBoard` bridges all exist and can be reused.
- There is no UI for verifying your own phone number. Only the email verification pattern
  (send/resend/check steps) exists.
- The app's dependencies are stale: `chatic-sockets-lib@0.4.8` (no invite gateway),
  `chatic-backend-api@^0.26.405` (no new types).

The key backend contract (verified against the backend code):

- An invite creates only a code. **The room is created asynchronously at the moment of acceptance**, and
  the accept response carries no channelId — the channel sync event has to be waited for.
- A successful number verification (`step=check`) **is a sign-in** — the response's `$token` changes the
  session from the device user to the main user, and **refreshing the connection's identity is the
  client's job** (`auth.refresh` / `auth.switch`, or a reconnect).
- An invite has three states only, `pending / accepted / expired`, and they arrive in the `:ok` fields
  rather than as an error.
- The response view includes `expiredAt` (the expiry time) and `inviter$` (the inviter's UserHead) — the
  countdown and the inviter display can be rendered from server values.
- There is no acceptance notification — the inviter's screen refreshes by re-querying `invite.list`
  (polling).
- The server does not send the invite SMS — delivering the deeplink is the app's job.

The Figma design (the chat room management, invite, waiting, accept and phone verification screens were
all reviewed) is wider than the backend contract. In the design but absent from the backend:
**cancelling an invite, declining an invite (plus a declined badge), automatically expiring the previous
link on re-invite, detecting "you already have a 1:1 chat" before issuing, listing and detaching social
connections, and "extend the time" for the OTP**. The validity copy disagrees too (24 hours in the
design vs. 3 days hardcoded in the backend).

## Decision

1. **The gaps are handled by building the interfaces ahead.** Build the design's buttons and state UI as
   drawn, but leave the actions with no backend as stubs (a comment plus a disabled or local-only
   behaviour), structured so that adding the backend API means only connecting it. Produce the list of
   backend APIs needed as a separate roadmap document.
2. **The pre-issue "you already have a 1:1 chat" dialog is not built in v1.** The number-to-user mapping
   is a server-side hash only, so the client has no way to know. Re-inviting the same number is safe
   because the backend connects it to the same user and the existing room. (If the backend puts an
   existing-room signal in the issue response, connect it then — the interface is built ahead.)
3. **The unit of parallelism is a Claude session (a worktree).** Each track gets its own worktree and
   branch and runs concurrently, with inter-track dependencies cut by the interface contracts (hook and
   component signatures) named in the roadmap. The tracks: Track 0, the shared foundation (first) → Track
   A, auth and session / Track B, the inviter's flow / Track C, the recipient's flow / Track D, social
   management (in parallel).
4. **The invite link is delivered through the SMS composer.** Reuse the existing `SendSms` bridge (the
   mobile handler `useSmsHandler` plus `SmsService`, prefilling the body of an sms: URI) and add only the
   web-side sender. In a non-native environment, fall back to copying to the clipboard.
5. **Phone verification is developed against the real API.** `auth.verify-hash-alias` is already wired.
   Development and QA use the `dryRun` and `slack` delivery switches. Connecting real SMS delivery
   infrastructure belongs to the backend and does not affect the client code.
6. **Every app but desktop-web is in scope.** That is `apps/web` (the mobile WebView plus the browser
   fallback) and `apps/mobile` (the bridge wiring). desktop-web-specific optimisation is out of scope.
7. **The social management screen is included.** Build the social connection management UI in My Page's
   account management and connect `auth.attach-social`. Listing and detaching have no backend API, so the
   interface is built ahead (stubbed) and included in the list of backend requests.
8. **Validity follows the server's 3 days.** The client renders only from the response's `expiredAt` and
   never hardcodes a duration. Request that the design copy ("24 hours") be changed to 3 days.

    > **Revision (2026-07-31)** — the opposite was decided. The product chose **a validity of one day**,
    > and that was also the premise behind the design showing a single `HH:mm:ss` line from the start (see
    > the withdrawal note on ADR-0037 decision 1). The copy change request is withdrawn and replaced by
    > **a backend request to change the server TTL from 3 days to 1 day**.
    >
    > The client is left alone — it hardcodes no duration, so it matches by itself the day the server
    > changes. The `days > 0` branch (the hybrid format from ADR-0037 decision 3) **stays** as well:
    > removing it before the TTL changes would make a 3-day link show only hours, minutes and seconds and
    > therefore lie, and afterwards it simply becomes a safety net that is never reached.

9. **The OTP's "extend the time" maps to resend.** The backend has no notion of extending. The timer
   renders from the `expiredAt` in the send/resend response, and both extending and resending call
   `step=resend` (with a note that the wrong-answer counter is preserved).
10. **The acceptance flow's steps go verify → profile → accept.** With `needVerify=true`, verify the
    number; after verification, if there is no relay place profile (`profile.nick`), set up the profile;
    then `invite.accept` → wait for the channel sync → enter. Users whose display name is
    `***<last 4 digits>` exist, so the display layer has to account for that.

    > **Revision (2026-07-31, [ADR-0039](0039-dm-display-name-chain-and-invite-profile-release.md)
    > decision 5)** The profile step was **deleted**. The order is **verify → accept**. The profile is set
    > afterwards from the place settings hub, which makes accounting for the `***<last 4 digits>` display
    > name more important still.

    > **Re-revision (2026-08-03, [ADR-0041](0041-place-profile-as-invite-precondition.md) decision 3)**
    > That deletion was withdrawn. The order returns to **verify → profile → accept, as originally written
    > here**. But the profile is not a forced step: it is a **precondition** of `invite.accept` — pressing
    > X does not accept and returns to the invite confirmation screen. The same structure attaches to the
    > inviter's side (`ContactInvitePage`).

11. **The deliverables are this ADR, the roadmap, and a kickoff prompt per track.** The roadmap was
    `docs/plans/relay-dm-invite-parallel-roadmap.md`, in the root docs tree that has since been removed.

## Alternatives

- **Handling the gaps by narrowing to the contract (dropping the cancel and decline UI in v1)** — the
  roadmap gets simpler, but the screens have to be rebuilt when the backend APIs arrive, and the
  divergence from the design grows. Dropped.
- **Handling the gaps by adding a backend-api extension track to this roadmap** — it crosses repository
  and team boundaries and couples the schedules. The client can proceed with stubs, so handing over the
  request list is enough. Dropped.
- **Link delivery through the share sheet (`openShareSheet`)** — the least work, but it contradicts the
  design copy ("We'll send the invite link by SMS"). The SMS composer bridge already exists, so the cost
  difference is small. Dropped (the share sheet remains a candidate for later).
- **Link delivery through server-side SMS** — `sendInviteSms` (an ncloud template) is a separate REST
  endpoint for bulk cloud invites and is not wired into the relay invite flow. It needs backend work and
  costs money to send. Dropped.
- **Validity: ask the backend to change it to 24 hours** — it causes a backend change, and 3 days is
  already implemented. Changing the copy is cheaper. Dropped. → **This alternative was chosen on
  2026-07-31** (see the D8 revision): the product settled on one day, so the server TTL changes rather
  than the copy.
- **Promote the invite list into an IndexedDB repository** — invites have no offline requirement and
  polling reads them immediately. A react-query hook plus merging in the UI is enough. Dropped (revisit if
  acceptance notifications become push-based).
  → **This rejection was superseded by
  [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md)** (2026-07-30, unifying the access
  surface — a repository promotion with no persistence obligation).

## Consequences

- What is gained: four tracks can run concurrently in worktrees, and when a backend API arrives only the
  stub has to be swapped, with no UI rework. The countdown and the inviter display come from server
  values, so a policy change needs no client release.
- What is accepted:
    - Stubbed buttons (cancelling an invite, detaching a social account) can ship without working, so
      whether they are visible has to be controlled by a flag in each track's implementation.
    - The invite waiting screen polls, so acceptance shows up with a delay (resolved when the backend adds
      a notification).
    - The declined badge ("Invite declined") cannot be drawn from real data until the backend has that
      state — such a row is treated the same as expired.
    - ~~The design copy change (24 hours → 3 days) has to be requested from the design team.~~ →
      Withdrawn (the D8 revision). What remains is the backend request to change the server TTL to one
      day.
    - The session switch (applying `$token`) across SocketManager's dual slots (relay plus cloud) remains
      the biggest risk — verified first in Track A.
- When to reverse: once the backend implements an acceptance notification and returns the dm channelId
  synchronously, replace the polling and channel-waiting logic with event-driven versions (the same as the
  spec document's "revisit triggers").
