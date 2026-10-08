# mypage — the account hub and the tree below it

`apps/web/src/app/features/mypage` owns the MY tab and the tree behind it: **17 pages** across four
depths, from the identity card at `/mypage` down to policy text and the Lab (experiments and the debug
unlock). It is the
app's settings surface, and it is also where three different kinds of profile meet — which is the
single thing most likely to be got wrong here.

The feature holds no session and no repository of its own. Every read is a hook from `app/hooks/` or
[`@chatic/app-runtime`](../../../../../libs/app-runtime/README.md); the chrome around it — the
floating nav, safe areas, keyboard insets — belongs to
[shell/layout-shell.md](../../shell/layout-shell.md).

## Layout

Seventeen pages, ten components, nine hooks, one `lib/` helper, and `flags.ts` — one boolean waiting
on a backend packet. The route table declares eighteen routes: the seventeen pages here plus
feedback's, whose screen lives in another feature.

### The four depths

| Page                                                            | Route (`ROUTES.mypage.*`)        | What it is                                      |
| --------------------------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| `MyPage`                                                        | `/mypage`                        | the tab — identity, subscription, clouds        |
| `LoginPage`                                                     | `/mypage/login`                  | sign-in, reached when a guest taps the hub card |
| `AccountInfoPage`                                               | `/mypage/account`                | account hub — edit, social links, withdrawal    |
| `ProfileEditPage`                                               | `/mypage/edit`                   | the account (relay) profile: name and photo     |
| `CloudManagePage`                                               | `/mypage/cloud-manage`           | owned clouds under the plan that allows them    |
| `CloudHubPage`                                                  | `/mypage/cloud-manage/:id`       | one cloud's menu — profile, information, places |
| `CloudEditPage`                                                 | `…/:id/edit`                     | the cloud **entity's** name, owner-only         |
| `CloudDetailPage`                                               | `…/:id/detail`                   | the cloud's facts, and where it is released     |
| `CloudPlacesPage`                                               | `…/:id/places`                   | the places the cloud holds                      |
| `WithdrawalPage`                                                | `/mypage/withdrawal`             | account deletion                                |
| `SettingsPage`                                                  | `/mypage/settings`               | device and app preferences, version, logout     |
| `NotificationSettingsPage`                                      | `/mypage/settings/notifications` | push mute and message preview                   |
| `LabPage`                                                       | `/mypage/settings/lab`           | experiments, and the hidden debug unlock        |
| `PolicyListPage` · `TermsPage` · `PrivacyPage` · `LicensesPage` | `/mypage/policy/*`               | the legal text                                  |

`/mypage` is the only one of these the floating nav appears on: `UnifiedLayout` matches that path
exactly, so every depth below it is nav-free without needing its own opt-out.

## Responsibilities

**In** — the hub's rows and their state branches, the settings tree, the account profile editor,
cloud management, and the policy screens.

**Out** —

- **The feedback screen.** Its URL is `/mypage/feedback` and its route is declared here, but the
  page belongs to [feedback](../feedback/README.md).
- **The debug panel.** Lab hosts the unlock gesture; [debug](../debug/README.md) owns the gate and
  everything behind it.
- **What an experiment does.** Lab holds the switch; the feature behind it, and the rule that reads
  the switch, belong to that feature — the place invite's to
  [invite/place-invite.md](../invite/place-invite.md).
- **Logout itself.** The row opens a dialog and navigates to `ROUTES.auth.logout`;
  [auth](../auth/README.md)'s `LogoutPage` does the cache teardown and session end.
- **Social link detail.** [account](../account/README.md) is the canon; `useSocialLinks` here is the
  screen's orchestration only.
- **Place profiles.** Editing your nickname inside a place is [home](../home/README.md)'s overlay.
- **Subscription screens.** The row routes into [subscription](../subscription/README.md).

## The shared contract

### Three profiles meet here, and only one of them is "your profile"

This is the section to read before touching anything on these screens.

| What                  | Where it is edited                 | Scope                                        |
| --------------------- | ---------------------------------- | -------------------------------------------- |
| **Account profile**   | `ProfileEditPage` (`/mypage/edit`) | the relay account — name, photo, email       |
| **Cloud entity name** | `CloudEditPage`                    | the cloud organization itself                |
| **Place profile**     | home's `PlaceProfileEditDialog`    | your nickname and thumbnail inside one place |

The hub's card, the header name and everything `/mypage/account` leads to are the **first** one, and
it is always the relay account's — the same record whichever cloud is connected.

Its source is the stored relay token, not the user cache, and that is deliberate. A cloud session
mints a different uid on a different backend, and the cache is physically keyed
`${type}:${cid}:${uid}:${id}` and read by the repositories under the live scope — so while a cloud is
active, the relay `user` row is out of their reach. `useMyUser()` reads the token;
`useUpdateProfile()` writes through `user.update` pinned to the relay slot and patches the server's
response back into that token. **Read and write share one scope**, which is the invariant an earlier
attempt inside the data layer could not hold — see [place](../place/README.md) for that history.

### The hub asks about the account; the settings depth asks about the session

`useIsAccountGuest()` is what the hub branches on. Every row on it is account-scoped — your profile,
your subscription, the clouds you own — so it must answer for the same subject the header name shows.
`runtime.session.useRuntimeProfile().isGuest` answers a different question: what the **currently
connected cloud's delegated user** is allowed to do. Use that one on a hub row and a signed-in person
sees a "sign in" card the moment they enter a cloud.

`SettingsPage`'s logout row still gates on `useRuntimeProfile().isGuest`. The two can disagree while
a cloud session is active, so that is the hook to look at first if the logout row goes missing for
someone who is plainly signed in.

### Two rows change their destination, not their label

- **Subscription.** Always the subscription list — it has a state for everyone, and its empty
  state is what leads to the guide. Branching here on `isValid` sent a scheduled cancellation,
  still paid for, to the pitch.
- **Version.** It goes to the store **only when an update is actually pending**, and the
  up-to-date / update-available label shows on iOS only, because Android has no live-version source
  and a label there would be a guess. Otherwise the row is inert — it is informational and carries
  no hidden action.

### The cloud row shows for every signed-in account

Cloud management has a state for everyone: an empty card that starts a subscription, the list, and
the lapsed list whose leftover clouds still need releasing. It used to be gated on owning a cloud,
which hid the first of those — and gating on `isCloudActive` ("currently switched into a non-default
cloud") would be worse still, hiding the only release path from exactly the people who need it: a
user over their allowance after a downgrade, or a lapsed subscriber, both sitting on DoU Home.

Invited clouds never appear in it. The list is the relay catalog (`view: 'mine'`), and you cannot
release someone else's cloud.

### Cloud management is one list and one tree per cloud

`/mypage/cloud-manage` lists the owned clouds under the subscription that allows them. What the
subscription has to say — the banner for a block, a lapse or a queued downgrade, the `used / limit`
figure, the current plan card — is composed from [subscription](../subscription/README.md)'s barrel
(`CloudManageBanner`, `CurrentPlanCard`, `useCloudManageScene`, `useCloudQuota`); this feature
derives nothing about the membership itself. A row's badge comes from `resolveCloudRowState` in
`app/utils`, and its name from `cloudDisplayName` beside it — the same two home's switcher draws,
so a cloud never reads one way in the sheet and another here. The add button raises `stores/useAddCloudRequest` like home does, and is away
while a banner is up — that is the state in which the server would refuse the cloud, and the
banner is what explains it.

A row opens the cloud's hub, which fans out into three screens that follow the `place` vocabulary:
`edit` writes, `detail` reads (the word `info` is not used — it reads as both), `places` lists.

**Two of them switch into the cloud first.** The rename is the cloud's own socket action
(`cloud.update`), and the place list is the cloud's own cache, filled by its own sync — the relay
holds the catalog row and nothing below it. So `CloudEditPage` and `CloudPlacesPage` call
`useEnsureCloudSession`, which switches the whole app into the cloud on entry (once per cloud id,
with a retry on failure) and keeps the user there afterwards; `CloudSessionGate` holds the body until
it is live. The hub disables those two rows for a cloud that has no session to switch to — one
still provisioning, one that failed, one the relay holds — and keeps the information screen, which
is where that state is explained and where the cloud is released.

**Releasing lives on the information screen, nowhere else.** It is irreversible and cascades, so it
sits at the foot of the read-only facts behind a confirm, not on a list row. Releasing the ACTIVE
cloud ends the cloud session and reloads: the session's tokens name a cloud that no longer exists.

**Two designed things are not drawn.** The profile screen's photo slot — the cloud model has no
image field, and a slot that could not save is worse than none — and the payment-failure banner,
for the same reason the subscription screens leave it out: the relay has no grace-period signal.

### Language defaults to the device, and only a choice is remembered

The language sheet lists **Device language** first, then `한국어` and `English`, and ticks the stored
choice (`ui.language`, default `system`) — not `i18n.language`. With `system` the two differ in
meaning even when they show the same language, and the tick has to say which one the person picked.
`useLanguagePreference` writes the choice and switches the screen at once; the row's trailing label
reads `mypage.language.<choice>`.

How `system` becomes a language, and how the choice reaches the native shell the way the theme does,
is in [state/stores.md](../../state/stores.md#the-language-choice--uilanguage).

### Clear cache keeps what the server cannot give back

The **Clear cache** row has no subtitle and no confirm dialog: the tap itself calls
`useClearLocalCaches`, which runs `runtime.data.clearLocalCaches()` across every cloud this device
holds a partition for. Invited clouds and invite dismissals survive — the cache is the only copy of
both — and so do the session and tokens. Unsent messages do not, and nothing on screen warns about
that any more; the row is a plain "clear cache" by product choice. What is swept, and why the sync
cursors go last, is in
[`libs/app-runtime`'s data doc](../../../../../libs/app-runtime/docs/data/README.md#clearing-the-cache).

A clean sweep **reloads the page**. Screens and react-query still hold what they already read, so
without the reload the old data would stay on screen until each one happened to refetch. A partial
failure does not reload: an error toast stays, and a retry repeats the whole sweep. While the sweep
runs the row is disabled and shows a spinner in place of its chevron, so a second tap cannot start
another sweep.

### The unlock moved off the version row

Tapping the app version ten times used to open the debug gate, which meant one row had to be both a
store link and a hidden gesture — and a tap that navigates to the store can never complete a ten-tap
count. The gesture now lives on `LabPage`, on the flask icon inside the intro card: `aria-hidden`,
`tabIndex={-1}`, advertised nowhere. `useDebugUnlock(config.get('debug.entryCode'))` owns the
counting and the code challenge; see [debug](../debug/README.md).

Once unlocked, Lab shows a single destructive row that opens the panel at full size.

### Lab is where experiments are switched on

An experiment is a feature that works but is not ready to be on for everyone. Each one is a config
key on the registry's `labs` surface — default off, and declared killable by the server — and Lab
draws a hand-built row for it in the **Experiments** card. No renderer walks the registry; a new
experiment adds its own row, as a `user` key does in Settings.

Today there is one: **Place invite** (`feature.placeInvite`), through `usePlaceInviteExperiment`.
The row's subtitle is one short line because `ListRow` truncates a subtitle to a single line; what
the switch does and where it applies is the note under the card.

The switch only lets the feature in. Who may use it, and where, is still the feature's own rule —
turning on Place invite does not give a non-owner the menu entry. The value lives in this device's
local storage, so another device of the same person starts with it off.

### UI comes from web-ui-kit, and missing pieces are added there first

`MenuCard` (rounded card with an optional section header), `ListRow` (leading/trailing/subtitle
slots), `Switch`, `IconChevronRight`, `IconSettings` — all from
[`@chatic/web-ui-kit`](../../../../../libs/web-ui-kit/README.md). `PageHeader` is the app's own, from
`ui/components`. When a screen needs a primitive the design system lacks, it is defined in the
library first and imported, never written locally and never reached for through `@chatic/ui-kit`.

**Scrolling is the page's own job.** None of these screens use a fixed-height layout with an inner
scroller; each is `overflow-y-auto`. `/mypage` clears the floating nav with `BottomNavSpacer` at the
end of its content rather than padding on the container, and the depths need only a tail padding
because they have no nav.

## Usage

The feature exports its route table, which the router mounts under `/mypage/*`. Screens read state
through hooks and never touch a core object: `useIsAccountGuest` for the hub's branch, `useMyUser`
for the account profile, `useCloudSessionCatalog` / `useClouds` for owned clouds (`useOwnedCloud`
narrows that to the cloud a URL names), `useEnsureCloudSession` to make that cloud the live session,
`useActiveCloudPlaces` for its places, `runtime.session.useSessionSelection` and `useRuntimeProfile`
for the session, `useDevicePushMute` for the mute toggle, `useLanguagePreference` for the language
sheet and `useClearLocalCaches` for the clear-cache row.

### What not to do

- **Do not branch a hub row on `useRuntimeProfile().isGuest`.** See above.
- **Do not add a settings row to `/mypage`.** The tab is an identity screen; the gear exists so it
  can stay short. A device or app preference goes in `SettingsPage`.
- **Do not give the version row a side effect again.** It is informational unless an update is
  pending.
- **Do not write the account profile through the active cloud's facade.** `useUpdateProfile` is
  relay-pinned, and it does not write the repository cache either — a relay row written while a
  cloud is active is one the repositories would not read back.
- **Do not put a hardcoded colour or a local card component on these screens.** Add it to
  web-ui-kit.

## Notes for implementers and tests

- **Fourteen specs cover this feature**, and they cover the hooks and the pure parts rather than the
  screens: `useAppIcon`, `useClearLocalCaches`, `useDevicePushMute`, `useEnsureCloudSession`,
  `useLanguagePreference`, `useSocialLinks`, `useUpdateProfile`, `cloudStatusWord`, plus
  `AccountLinkSection`, `CloudManageRow`, `CloudManagePage`, `CloudHubPage`, `CloudDetailPage` and `LoginPage`. The
  pages themselves are checked in the browser preview.

    ```bash
    npx jest --config apps/web/jest.config.js features/mypage
    ```

- **The account-guest rule cannot be exercised from a guest boot.** Every boot rewrites the relay
  token through guest keepAlive, so a seeded signed-in storage state is overwritten. The judgement
  itself is unit-tested in
  [`useMyUser.test.ts`](../../../src/app/hooks/useMyUser.test.ts) (roles, missing relay session, no
  role assigned); the on-screen behaviour while a cloud is connected needs a real account.
- **`useDevicePushMute` has no read endpoint behind it.** The displayed state is the `ui.pushMuted`
  config key ([`@chatic/config`](../../../../../libs/config/README.md)); each toggle writes
  optimistically, sends `device.update-remote`, then reconciles to the server's echo or rolls back
  with a toast. Outside a native shell the toggle is disabled rather than allowed to 404.
- **`SOCIAL_UNLINK_ENABLED` in `flags.ts` is false and stays false** until an unlink packet exists.
  The control renders disabled rather than claiming a success it cannot deliver. `AccountLinkSection`
  additionally hides itself when `link$` reads `'unknown'` — an account-security control that can
  lie is worse than one that admits it does not know.
- **`CloudEditPage` is reachable only through the cloud's hub.** The account tree deliberately does
  not link it: a cloud's name is not an account attribute. Every screen under `/mypage/cloud-manage/
:id` leaves for the list on its own once the catalog says the id is not an owned cloud, rather
  than trusting the caller — but only once the catalog has answered, so an in-flight fetch does not
  bounce a legitimate owner.

## Further reading

- [shell/layout-shell.md](../../shell/layout-shell.md) — the nav, safe areas and
  keyboard insets these screens sit inside.
- [account](../account/README.md) — social links and the account-credential story.
- [invite/place-invite.md](../invite/place-invite.md) — the place invite, Lab's one experiment so far.
- [debug](../debug/README.md) · [feedback](../feedback/README.md) — the two features Lab and
  Settings hand off to.
- [subscription](../subscription/README.md) — where the subscription row goes.
