# ADR-0334: A control with no behaviour behind it is not rendered

> Status: Accepted · Decided: 2026-11-17 · Implemented: `refactor/remove-mock-controls`
> · Scope: `apps/web` — `mypage` (`AccountLinkSection`, `useSocialLinks`, the withdrawal screen),
> `channels` (`MemberProfileDialog`, `RoomNotificationDialog`), `place` (`PlaceSettingsHubPage`), and
> their locale keys
> · Supersedes: [ADR-0023](./0023-channel-detail-dialogs-figma-redesign.md) decision 4 (`Friend settings`
> and `Report` shown as UI-only rows) · Amends: [ADR-0042](./0042-account-linking-unified-path-migration.md)
> (the `SOCIAL_UNLINK_ENABLED = false` stub it kept) and [ADR-0031](./0031-place-settings-hub.md) (its
> place-notifications placeholder row)
> · The behaviour is documented in [apps/web docs/feature/account](../../apps/web/docs/feature/account/social-links.md),
> [channels](../../apps/web/docs/feature/channels/channel-settings.md#memberprofiledialog--who-is-viewing-whom)
> and [place](../../apps/web/docs/feature/place/README.md)

## Context

Several screens drew controls that the design asked for but no backend could serve yet. Each was kept
on purpose at the time it was added, and each answered a tap in its own way:

| Control                                  | Where                          | What a tap did                                         |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `연동 해제` (unlink a social credential) | My info → account linking      | Nothing — rendered disabled, a hover-only `title` hint |
| `친구 설정` (friend settings)            | Member profile                 | A "coming soon" toast                                  |
| `신고` (report a member)                 | Member profile                 | A "report submitted" toast, with nothing sent          |
| `플레이스 알림` (place push switch)      | Place settings hub             | Nothing — a switch fixed off and disabled              |
| Withdrawal screen and its confirm        | `/mypage/withdrawal`, URL only | Signed the user out; the account was not deleted       |
| `RoomNotificationDialog`                 | Mounted nowhere                | A switch that flipped local state only                 |

[ADR-0175](./0175-cloud-management-is-one-list-and-one-tree-per-cloud.md) already said it for one
screen: a control that cannot deliver is worse than none. This record makes it the rule for the app.

ADR-0023 chose to show `Friend settings` and `Report` as visible no-ops because that was more faithful
to Figma, and the account-linking doc chose a disabled unlink over a hidden one so the missing capability
stayed visible. In practice these controls did not inform anyone. A disabled control on a phone has no
hover, so the unlink hint never showed. A "coming soon" toast is a dead end, and `Report` told the user
something had happened when nothing had. The withdrawal screen was worse: it warned that all data would
be deleted permanently, then deleted nothing.

## Decision

1. **A user-facing control is rendered only when tapping it does what it says.** If the call behind it
   does not exist yet, the control is left out. It is not shown disabled, not answered with a "coming
   soon" toast, and never answered with a success that did not happen.
2. **The six controls above are removed**, together with everything that only served them: handlers,
   the `SOCIAL_UNLINK_ENABLED` flag file, the `/mypage/withdrawal` route and its `ROUTES` entry, the
   unmounted dialog, their tests, and their locale keys in every language.
3. **The layout closes over the gap.** A card that only held a removed control goes with it: the place
   hub's notification card. A list that ends up empty is not drawn: the member profile for a viewer who
   may not remove anyone.
4. **Bringing a control back is part of the feature that makes it work.** It returns in the same change
   as its backend call. The removed code stays in git history and is not kept behind a flag.

## Alternatives

- **Keep the controls disabled, with an explanation.** This was the account-linking doc's choice. It is
  rejected because the explanation has no touch-friendly surface, and a permanently disabled control
  reads as a bug as often as a roadmap.
- **Keep them behind feature flags set to `false`.** This keeps the code ready to switch on. It is
  rejected because the code then has to keep compiling and passing tests against a backend that does
  not exist, and the flag only ever recorded a missing endpoint, which the backend's own roadmap already
  records.
- **Hide them only in production.** This would split what QA sees from what users see, for controls that
  do nothing in either.

## Consequences

- **The screens drift from Figma** where Figma draws these controls. That is accepted: the design shows
  intent, and the build shows what works.
- **ADR-0023 decision 4 no longer holds.** The member profile offers `1:1 대화하기` where the host allows
  it, `프로필 설정` on my own profile, and `내보내기` to a viewer who may remove the member. Anyone else
  sees the profile with no action list.
- **The account-linking card shows a linked credential as a label only.** When an unlink packet exists,
  the control comes back with it. At that point, the `link$` merge rule that drops `undefined` fields
  ([social-links.md](../../apps/web/docs/feature/account/social-links.md)) has to be re-judged as well.
- **Account deletion has no client at all** until a withdrawal API exists. Before this change it had a
  client that only pretended to delete.
