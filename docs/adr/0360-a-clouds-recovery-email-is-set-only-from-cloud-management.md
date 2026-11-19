# ADR-0360: A cloud's recovery email is set only from cloud management

> Status: Accepted · Decided: 2026-11-20 · Implemented: `feat/cloud-email-in-management-only`
> · Scope: `apps/web` — `features/subscription` (`AddCloudFlowHost`, `useAddCloud`,
> `EmailVerifyDialog`, `EmailBindRequestHost`; `EmailRequiredBanner` and `useUnboundClouds` removed),
> `features/home` (`CloudItem`, `CloudSessionSheet`), `features/mypage` (`CloudDetailPage`), and the
> `ko`/`en` translation resources
> · The behaviour is documented in [apps/web docs/feature/mypage](../../apps/web/docs/feature/mypage/README.md)
> and [apps/web docs/feature/subscription](../../apps/web/docs/feature/subscription/README.md)
> · Related: [ADR-0060](./0060-subscription-tier-quota-from-server.md) (one email per cloud, and the
> tier-step rule it explained)

## Context

A cloud can carry an email address. The backend binds it through `verify-email` (`send`, `check`,
then `confirm` with the cloud's id), and its use is recovery: on a new device or after a reinstall,
the address is how the owner gets the cloud back. The backend never required one — `make` reaches
`active` without it, and `delegate-cloud` enters a cloud without looking at it.

The app still pressed for it in three places:

- **Adding a cloud** opened an email verification screen first; "I'll verify later" skipped it.
- **The cloud switcher** showed the address under each cloud, and a cloud without one read "Add
  recovery email" — tapping it opened the verification screen instead of entering the cloud. A cloud
  without an email could not be entered from the switcher at all.
- **"구독 관리"** carried a banner listing every cloud without one.

An optional address was treated as an unfinished step, and there was no way to say "I don't want
one" short of answering the same prompt again each time.

## Decision

1. **Creating a cloud asks for nothing.** The add-cloud flow goes from the quota verdict straight to
   `make`, with no email in the body and no dialog in between.
2. **Entering a cloud checks for nothing.** Every live cloud in the switcher enters on tap, and the
   row no longer shows the address.
3. **Cloud management's information screen is the one place the address is set.** Its field reads
   "not registered" with a register action and one line on what the address is for; registering opens
   the existing verification dialog, which now always binds to an existing cloud.
4. **Nothing else mentions it.** The "구독 관리" banner is gone, and the tier-step refusal no longer
   gives "each cloud needs its own email verification" as its reason — that reason stopped being true.

## Alternatives

- **Keep the prompts and add a "don't ask again" per cloud.** It keeps three surfaces that ask about
  the same thing, plus a preference to store and sync, to arrive where this decision starts: the
  address is optional.
- **Keep the address on the switcher row, read-only.** It is the one thing the switcher showed that
  is not about choosing a cloud, and most clouds would now show nothing there anyway.

## Consequences

- **A cloud with no email cannot be recovered on a new device.** That was already true of a skipped
  verification; now it is the default, and the information screen is where it is explained.
- **Adding a cloud is one tap.** The verification screen used to double as a confirmation step. The
  quota still guards it (`make` is refused past the allowance), but nothing stands between the tap and
  a new cloud.
- **The tier-step rule loses its stated reason.** ADR-0060 explained one-step-at-a-time upgrades by
  the verifications a jump would collect. The rule is left as it is; whether it should stay is a
  separate decision.
- **ADR-0060's "tier 5 needs 5 emails" trade-off narrows** to owners who want every cloud
  recoverable; it no longer stands between a purchase and a usable cloud.
