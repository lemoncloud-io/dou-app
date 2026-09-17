# ADR-0034: Inviter phone verification — a guest pre-gate, presented as a bottom sheet

> Status: Accepted · Decided: 2026-07-30 · Follows: [ADR-0089](./0089-relay-dm-invite-and-auth-parallel-tracks.md)

## Context

Track A of ADR-0089 built `PhoneVerifyScreen` and Track B built the invite issuing screen, but **the
entry point that joins them was never wired.** What the post-integration review found:

- `apps/web/src/app/features/invite/pages/ContactInvitePage.tsx:95` — on a 403 from issuing, it raises a
  toast and stops. A code comment says "when Track A's `PhoneVerifyScreen` lands, that is the real path",
  and Track A has already merged. This is a seam integration never closed.
- `PhoneVerifyScreen`'s `context: 'invite-create'` branch has **zero callers** — it exists only in the
  type declaration, and the `phoneVerify.descriptionInviteCreate` copy is unreachable in the app.
- The backend guide §A-1 states that _"when blocked, send the user to phone verification (A-1)"_.

At the same time **the design was updated.** Two new nodes:

| Node         | What                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3578-67319` | The guest intercept screen — under the Invite friends header, "For a safe invite / please verify your phone number" plus a green CTA, "Verify phone number". That is all that shows, instead of the form |
| `3586-16255` | Phone verification as a **bottom sheet** — a title row ("Verify phone number" plus a circular X), two left-aligned lines of guidance, the number and code fields, and Done                               |

The heart of the update is that **verification is a bottom sheet rather than a full screen**, which
diverges from the full screen Track A built (`3421-59180`, the acceptance flow). The inputs inside the
sheet are, by their metadata, two `General Input`s with `Request code` / `Resend` in the counter slot,
a `[-]excluding…` helper and a hidden `code timer` — **the same structure as the existing
implementation**.

Added constraints from the requirements:

- Verification starts **only in a guest session** (a pre-gate, not something after a 403).
- Components come from `libs/web-ui-kit`. Anything missing is defined there first.
- Where there is an icon, pull the resource.

The survey found **nothing to add to web-ui-kit.** The existing `BottomSheet` matches the design —
`rounded-t-[16px]`, a glass header (a 17px semibold title plus a close button on the right), the close
button `size-6 rounded-full bg-muted` plus `IconClose size-[18px]` (identical to the 18×18 X inside
Figma `3586:16827`'s 24×24 frame), a `footer` slot, and `pb-safe-bottom`. The icon exists as well,
`IconClose` (lucide `X`), so there is no resource to extract.

## Decision

### 1. The gate is a pre-gate on the session role

Decide with `useRuntimeProfile().isGuest`
(`libs/app-runtime/src/runtime/useRuntimeProfile.ts:54`). For a guest, `ContactInvitePage` renders the
intercept screen instead of the form — the same route and the same header (`Invite friends`), so no new
route is created.

That hook is built on `useSyncExternalStore`, so it **flips by itself** after a successful verification
(`applySessionToken` → `loginRelayByToken` → `notifySessionStateChanged()` → context cache invalidation
→ listener fan-out). No separate refresh or manual update is needed.

**The 403 fallback stays.** The guide is explicit that "the server decides whether you are a main user",
so the client gate is UX and the server's 403 is the contract. If a policy change creates a case where
issuing is blocked for someone who is not a guest — a social user, say — that path is the safety net.

### 2. The scope is one entry point: the 1:1 (DM) invite from home's ＋ button

The gate attaches only to the `handleCreateOneOnOne` → `ROUTES.invite.contact` path at
`HomePage.tsx:230`. The cloud and group invite paths (`channels/InvitePage`, `AddFriendSheet`) are
untouched.

**The acceptance flow (Track C) is unchanged.** `needVerify` on `invite.get` is a field the server fills
in, and guide §B-3 states that _"accepting immediately while ignoring `needVerify` is still blocked,
because the server decides again"_, so it is not a switch the client can turn off. The acceptance screen
keeps the full screen (`3421-59180`) and `useRelayInviteFlow`'s `verifying` branch as they are.

### 3. Extract the body, split the shells

```
PhoneVerifyFields   ← the inputs, timer, resend, error branches, session switch (all the logic)
├── PhoneVerifyScreen  (a full-screen Dialog — existing, the acceptance flow)
└── PhoneVerifySheet   (a BottomSheet — new, the issuing flow)
```

The roadmap's interface contract
`<PhoneVerifyScreen context inviteCode? onVerified onClose>` **keeps its signature** — Track C's
`RelayInviteDialog` does not change. The new sheet is a sibling component taking the same props.

Why the alternative of adding a `presentation` prop was dropped is in "Alternatives" below.

### 4. The account-fork warning banner is left out of the sheet

The new design does not have it, and the design wins. **It stays on the acceptance screen (the full
screen)** — that is where the guide places it ("§constraints to know: show it … on the acceptance
screen").

The risk accepted is recorded under "Consequences", and adding copy goes on the design request list.

### 5. The Done CTA is green when enabled, grey when disabled

Figma's `Solid button_Black` instance is a rendering of the disabled state. The existing
`Button tone="green"` plus `disabled:bg-control-idle disabled:text-placeholder` already behaves that
way, so **no implementation change**. It also matches the green Done on the acceptance screen.

### Scope

**In** — the guest intercept screen, `PhoneVerifySheet`, the body extraction refactor, wiring the gate
in `ContactInvitePage` and connecting the 403 fallback to the sheet, the new copy, and updating the 403
toast assertion in `ContactInvitePage.test.tsx`.

**Out** — the acceptance flow (Track C) entirely, gates on the other invite paths, the `needVerify`
policy, new `libs/web-ui-kit` components and icons (confirmed unnecessary), and the verification logic
itself (already verified).

## Alternatives

- **Add a `presentation?: 'fullscreen' | 'sheet'` prop** — one file and done, but a single component then
  branches over two shells and grows, with the per-shell layout differences (a centred hero vs.
  left-aligned guidance, a pinned bottom vs. a footer slot) tangled in conditionals. Dropped.
- **Keep only the reactive 403 entry (no pre-gate)** — a guest fills in the name and number and is blocked
  only after submitting. The new design specifies an intercept, so dropped. It does stay as a fallback.
- **Make the acceptance flow a bottom sheet too** — the verification experience would be one thing at both
  entry points, but the acceptance screen's Figma is still a full screen and Track C is verified territory.
  Dropped pending design confirmation, as separate work.
- **Keep the banner in the sheet too** — the guide calls it "the only defence", but the new design lacks
  it and the issuing side is the one sending the invite, so exposure is relatively lower. Dropped by the
  user's decision.
- **Split the intercept into a new route** — the header and title are identical, and a successful
  verification has to reveal the form on the same screen, so a route change would be superfluous.
  Dropped.

## Consequences

**What is gained**

- A guest is stopped before filling in the form, so no effort is wasted, and ADR-0089's last unwired seam
  is closed. `context: 'invite-create'` and its copy stop being dead code.
- Extracting the body leaves the verification logic in one place, so more shells do not mean more
  branches. The verified error branches, timer and session switch are not duplicated.
- Because `isGuest` is reactive, the form appears after verification with no extra signal.
- With no new web-ui-kit component, the design system surface does not grow.

**What is accepted**

- **The account-fork risk remains on the invite-create path.** A user with a social history who verifies
  by number in this sheet creates a separate user that cannot be merged later (guide §constraints to
  know). The server cannot prevent it, and with this decision there is no banner either. It goes on the
  design request list.
- The same verification looks like a different shell depending on the entry point (acceptance = full
  screen, issuing = a sheet). Room to unify them is left for after design confirmation.
- The 403 toast assertion at `ContactInvitePage.test.tsx:112-123` breaks — an intended change, so it is
  updated to assert the sheet opening.
- The intercept CTA sits right under the copy (the top third of the screen) rather than pinned to the
  bottom, which differs from the position convention of other full-screen forms in the repo. The design
  is explicit, so the design wins.

**When to reverse**

- If the design unifies the acceptance screen into a sheet as well — delete `PhoneVerifyScreen` (the
  full-screen shell) and keep `PhoneVerifySheet` alone. With the body already extracted, deleting the
  shell is the whole job.
- If the backend narrows issuing to require phone verification — widen the pre-gate condition from
  `isGuest` to "number not verified" (today a social user can issue as well).
