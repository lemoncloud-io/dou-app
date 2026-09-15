# place-profile — the identity home shows, and the name it shows it under

A profile is **per place**: a nick and a photo scoped to one site, not to the account. Home is where
that profile is _read_ — the top-right avatar, the name in the profile dropdown — and where its
absence is announced. Home does not contain the form that creates or edits one.

This document owns home's two rules: which source the header identity comes from, and how a place's
name is turned into something a user should see. The form, its two entry points and the room-settings
nudge belong to [place](../place/README.md) and [channels](../channels/README.md).

## Header identity — one tier, chosen whole

`features/home/lib/resolveHeaderProfile.ts` picks an identity tier and takes the name and the image
from the same tier. There is no cross-source mixing: an empty field is never back-filled from a
lower tier, because a name from one source beside a photo from another is a person who does not
exist.

| Tier        | Chosen when                             | Home passes it          |
| ----------- | --------------------------------------- | ----------------------- |
| `'site'`    | the place profile has a nick or a photo | yes                     |
| `'account'` | the account record has a name or photo  | **no** — see below      |
| `'setup'`   | neither                                 | the fallback that fires |

**Home never supplies the account tier.** `HomePage` calls the resolver with `siteName` and
`siteImageUrl` only, so on home the resolver has exactly two outcomes: the place profile, or the
setup prompt. The account tier exists in the function for other callers; reading the resolver alone
would suggest home falls back to the account name, and it does not.

That refusal is the point. The account record's `name` is `***<last 4 digits>` for a phone signup
and a raw UUID otherwise — never something to print where a person's name belongs. The avatar
follows the same rule: `displayImageUrl` is `myProfile?.thumbnail` with no account-photo fallback,
and `ProfileAvatar` draws its own default glyph when that is empty.

## The nudge — where a missing profile is announced

`kind === 'setup'` renders `homePage.setupProfile` ("프로필을 설정해주세요" / "Set up your profile")
in place of the name, in the header pill and at the top of the profile dropdown.

That is home's **entire** involvement in profile setup, and deliberately so:

- **Nothing is forced.** Entering a place does not open a setup dialog. A user with no place profile
  uses the app normally; the nudge sits in a name slot that was empty anyway.
- **The nudge never grows a surface of its own.** No banner, no toast. It appears only where a name
  was going to be printed and there is none.
- **Only my own profile is nudged.** Someone else's missing profile is not something I can fix, so
  there is nowhere for a tap to go. Other people's rows keep their normal fallbacks.

The dropdown's single action is `플레이스 설정` → `ROUTES.place.settings(selectedSiteId)`, and the
profile form is reached from that hub. The entry is `disabled` when no site is active, because the
route is keyed by a site id and there would be nothing to open. It works on the relay too — relay
still supplies a `selectedSiteId`.

The other place a missing profile is announced is my own member row in room settings, which taps
straight through to the create dialog. That row, its `hasSnapshot` gate and the dialog are owned by
[channels](../channels/README.md).

## Place display name — never the backend string

The relay's personal place is named `default`/`#default` at the backend and has site id `0000`. That
string must not reach a screen. `apps/web/src/app/utils/resolvePlaceDisplayName.ts` is the single
pure function that decides:

```ts
resolvePlaceDisplayName(place, { isDefaultCloud }, t): string;
```

It returns the branded `placeList.defaultPlace` label ("두유 홈" / "DoU Home") when `isDefaultCloud`
is true **or** `place.id === HOME_PLACE_ID` (`'0000'`), and `place.name` otherwise.

Two signals rather than one, because the callers hold different things. A hook that knows the
session knows `selectedCloudId`; a list row holds only a place object. `HOME_PLACE_ID` is the real
runtime sid, so the row still resolves correctly on its own — the home rail's `PlaceItem` passes
`isDefaultCloud: false` and relies entirely on the id, since the place section is not rendered on
the relay at all.

`useActivePlaceName` is the hook form: it observes the active place row and runs the same function,
falling back to `{ id: sid }` when the row is not cached yet so a dialog title never flashes empty.
It drops the previous row on **every** sid change — keeping it would go on answering "두유 홈" after
a switch away from the relay, because the retained row still has id `0000`.

Keeping this a pure function rather than a hook is what stops the list row and the dialog title from
drifting apart.

## Notes for implementers and tests

- Do not add an account-name fallback to the home header. The value it would print is a masked phone
  number or a UUID, and it would appear exactly when the nudge is most useful.
- A profile edit reaches home through the observed cache, not through a session refresh, so no
  re-login or re-fetch is needed to see it.
- `PlaceItem` hard-codes `isDefaultCloud: false`. If the place section ever renders on the relay,
  that argument has to become real or the home place will print `default`.

## Further reading

- [README](./README.md) — the header, dropdown and place rail these values feed
- [place](../place/README.md) — the profile form, the settings hub and its routes
- [channels](../channels/README.md) — the room-settings member row and its nudge
- [`libs/data`](../../../../../libs/data/README.md) — the profile cache and `setMyProfile`
