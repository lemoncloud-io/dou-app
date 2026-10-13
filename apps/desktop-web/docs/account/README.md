# account

The account hub (`src/app/features/account/`): who the signed-in person is, the clouds they own, and
the terms and privacy policy. It is reached from the **Account** card at the top of the Settings page
and leaves through its back button, one level up each time.

| Route                                 | Page                       | Shows                               |
| ------------------------------------- | -------------------------- | ----------------------------------- |
| `/account`                            | `AccountHubPage`           | identity card and the entries below |
| `/account/clouds`                     | `CloudListPage`            | the clouds the account owns         |
| `/account/clouds/:cloudId`            | `CloudHubPage`             | rename, places entry, release       |
| `/account/clouds/:cloudId/places`     | `CloudPlacesPage`          | the places of that cloud            |
| `/account/policies`                   | `PolicyListPage`           | terms, privacy                      |
| `/account/policies/terms`, `/privacy` | `TermsPage`, `PrivacyPage` | the policy text                     |

## The account is the relay account

"Account" here means the relay account, not the session's user inside whichever cloud is active. The
name and photo come from the relay token (`useRelayAccount`): reading it costs no request. Once per
relay verification the hook asks the relay gateway for the profile and patches the token with the
name, photo, email and linked sign-in slot (`link$`) that come back; if that call fails the token's
value stays on screen. The sign-in card below reads the `link$` that refresh brings. Screens that
ask what the person may do in the current cloud read the session's profile instead.

## The hub

- **Signed in** (the token names a relay user that is not a guest): an identity card with the photo (the name's initial
  when there is none), the name (or "unnamed" — also when the name is the bare UUID an account gets before it sets one, which the edit dialog does not prefill), and **Edit profile**. Below it, an entry for the
  owned clouds, then Notifications and Policies.
- **Guest** (no relay user, or a relay user whose `userRole` is `guest` — a guest does have one): where
  the build offers a sign-in, one card holds both ways out of being a guest — signing in first, then
  **Join with invite** as a link at its foot, which opens the join dialog. Two cards side by side gave
  no order between them. Where no sign-in is on, or the relay user has not loaded, a plain prompt with
  the **Join** button stands in. There is no clouds entry, since a guest owns none. Notifications and
  Policies are still offered.

Notifications is a link to `/settings`, where the notification controls live; the hub holds none of
its own.

## How the account signs in

Under the identity card, `AccountSignInCard` says how the account signs in, read off the relay
user's `userRole` and `link$` (`linkedSignInOf`):

| Relay user                             | The card shows                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `userRole: guest`                      | **Sign in with phone number** ([auth](../auth/README.md#phone-number-sign-in)) first, then **Continue with Google** with the note for phone sign-ups ([auth](../auth/README.md#social-login)) |
| any of social, phone, email in `link$` | each one, social first: "Google · a\*\*\*@example.com", the last four digits of a number, the email hint, and **Link Google** while no social account is linked                               |
| a `link$` with none of them            | that no sign-in method is linked, and **Link Google**                                                                                                                                         |
| no relay user, or no `link$` at all    | nothing                                                                                                                                                                                       |

A missing `link$` is not read as "nothing linked": the profile may not have arrived yet, or the
server never built the slot for an older account, and saying "no sign-in method" to a signed-in
person would be wrong. An account can hold one method of each kind — a number it signed up with and
the Google linked to it — so the card lists them all. **Link Google** starts the browser round trip
([auth](../auth/README.md#linking-google)); the card itself never calls the account-linking
endpoints. While that round trip (or a guest's Google sign-in) is out in the browser, the button is
held and the card says it is waiting, with ways to open the browser again or give up. A link that does
not go through is shown on the card until dismissed — for an occupied Google, with what that means. The server keeps one social slot per account, so the button goes once any social account
is linked, and it is hidden where the build turns Google off. The guest's buttons are the
same sign-ins the Welcome page starts; each is hidden where the build turns it off, and the card is
left out when both are.

## Editing the profile

`AccountProfileDialog` edits the name (30 characters at most) and the photo. Save stays off until the
trimmed name is non-empty and differs from the account's, or the photo changed, and while a photo is
being read. A photo over 10 MB is refused before it is read; one that cannot be encoded is refused
after, and either way the dialog says so in place. The photo is resized as a profile photo is
(`prepareImage` with `AVATAR_IMAGE`). The dialog can replace a photo but not remove one.

The save goes through the relay-pinned gateway (`updateAccount`) and then patches the token from the
server's answer, falling back to the values sent when the answer is thin, so the hub updates at once.
The photo is only sent when it changed. A refusal keeps the dialog open with what was typed, shows
the error in the dialog and as a toast. Escape, the close button and the backdrop do nothing while
the save runs, so a failure always has someone to read it. The form is reseeded from the account on
every opening.

## Owned clouds

`CloudListPage` lists the clouds from the relay catalog (`useCloudSessionCatalog`, a react-query
read of `fetchCloudCatalog`). The catalog holds owned clouds only, so a cloud being listed is what
makes it owned. Clouds joined by invite are not here, and neither is buying: a new cloud is made in
the mobile app, and the empty state says so.

The list refetches on every mount. A read that fails shows an error with a **Retry** button. Because
the read can start before the relay socket has verified, which fails on a credential that is healthy
seconds later, the hook reads again once per relay verification after a failure before leaving the
error on screen.

`CloudHubPage` is one cloud:

1. **Rename.** A name field (20 characters at most) with Save, off until the trimmed name differs.
   `useRenameCloud` writes through the cloud repository, which updates its cached row, and patches
   the new name into the catalog query too, because a refetch right after the write could still
   return the old one. Success and failure are each a toast.
2. **Places.** An entry to the cloud's places page.
3. **Release.** A destructive action in its own section, behind a confirmation that names the cloud
   and says everything in it goes away for everyone and cannot be undone.

A cloud id the catalog does not list is not owned, or is a stale link: once the catalog has loaded,
the page redirects to the list.

### Releasing a cloud

Confirming calls `useRemoveCloud().deleteOwnedCloud`, which asks the repository to release the cloud
with a cascade, drops its cached row and refetches the catalog. Then:

- **A release the backend says already happened** (a 404 naming the cloud, or a 409 "already
  expired") counts as done: a retry could only fail the same way. The toast says "already released"
  instead of "released".
- **Any other refusal** is a toast ("could not release"); the page stays, and the cloud is still
  listed.
- **A cloud the session is not in** is released with a "released" toast, and the person lands back on the list.
- **Releasing the cloud the session is in** leaves nothing to stand in, so the account is logged out
  instead: the account-scoped local state is cleared (`useAccountResetOnLogout`) and then the session
  logs out. There is no toast and no redirect; the logout is the result.

The confirmation closes when its button is pressed, since it is an alert dialog whose action closes
it; the outcome arrives as the toast or the navigation.

## A cloud's places

`CloudPlacesPage` lists a cloud's places, but only for the cloud the session is in. A place list is
read through a cloud's own session, so another cloud's places cannot be shown, and entering one
silently would pull the reader out of the cloud they are in. For any other cloud the page shows a
line saying to switch, and a **Switch cloud** button. That button is the explicit switch: it
runs the same flow as the cloud rail (`useCloudSwitchFlow`, which clears the selected channel first
and reports a failed switch as a toast with its cause), and the list appears when the session lands
in the cloud. While the switch runs the button is disabled.

On the active cloud the rows come from the place cache (`usePlaces`), the same one the place rail
reads, and an empty list says so. Picking a row opens that place's settings page; see
[`../places/`](../places/README.md).

## Policies

`PolicyListPage` offers two entries, **Terms** and **Privacy**. `TermsPage` and `PrivacyPage` share
`PolicyProsePage`, which renders the current version of the text from `@chatic/policy-content`: the
effective date, then each section's title and paragraphs. The language is Korean when the app
language is Korean and English for every other language. There is no licenses page: the desktop build
does not produce the license list it would show.
