# My page — screen notes the README does not carry

> Scope: `apps/web/src/app/features/mypage/`. The [README](./README.md) covers the tree, the cloud
> screens, the Lab and the mini app card; the sign-in contract is in
> [auth](../auth/README.md) and linking in [account](../account/social-links.md). This page records the
> smaller rules of the login, profile, icon and settings screens.

## Login screen

- **The credential arrives on a subscription, not on the call that starts the flow.**
  `providerSignIn.start` only fires the request; the provider's UI then belongs to the user for as long as
  they need. The screen subscribes once for its lifetime and reads the latest handler through a ref, so a
  re-render neither drops an answer in flight nor re-subscribes. Every outcome lands on that one channel:
  a credential, a cancel (`result: null`, shown as a failure toast) or a native failure
  (`success: false`). The reason a round trip was dropped is in the
  [bridge notes](../../bridge/native-request-rules.md#starting-a-provider-sign-in-is-not-a-round-trip).
- **Every control is disabled while a sign-in is pending**, including the policy links under the
  buttons: the credential is delivered to this screen's subscriber, and leaving would unmount it and drop
  a sign-in the user already finished in the provider's UI. The relay-code exchange keeps its own pending
  flag (it is a plain call, not a mutation), without which the buttons would return while the code is
  still being exchanged.
- **Leaving is `navigate(-1)` when the user came from inside the app, else a replace to home.** The
  entry point pushed this screen, so the previous entry is already the screen to return to, and going back
  removes login from the backward path in one move. A replace would overwrite login with a second copy of
  that screen, leaving two identical adjacent entries so that the first back press looks like nothing
  happened. `returnTo` is only a flag ("did we get here from inside the app?") and is never handed to the
  router as a destination, so it cannot become a redirect target. The old behaviour — rewind the whole
  stack and `location.replace('/')` — is gone: both sign-in paths install the new identity before leaving,
  so a reload fixes nothing and only costs a white flash.
- **The branch taken is logged with both inputs.** "I signed in and it took me home instead of where I
  was" has two causes that cannot be told apart from outside: no `returnTo` (an entry point bypassed
  `useNavigateToLogin`), or nothing behind this screen in the app's own stack (a fresh WebView load, a
  deep link, a reload). The log carries the router depth the branch read, not `history.length`, which is a
  WebView-global count.
- **The policy links are pushed, not replaced**, so the policy page's back button lands on this login
  entry with its `returnTo` intact. Their words come from a translation key that marks the link tags
  (`mypageLogin.termsAgreementLinks`), because the two words sit in a different place in each language's
  sentence. It is a new key rather than new text under the old one: a bundle already running in a WebView
  refetches the locale file after its cache expires and would print the tags literally.
- **Phone sits below social on purpose**, and the browser build drops the divider and folds "social is
  app-only" into the warning — see [phone-verification.md](../auth/phone-verification.md). Phone login runs in
  `login` mode (the session becomes that number's main user); linking runs in `link` mode, which never
  returns a token.
- **Email login is one entry above the login screen**, so leaving goes back **two** entries when there
  is a `returnTo` and a history index of at least 2 — back one would just show the login screen again —
  and replaces to home otherwise (a reload or deep link). The password never reaches a log line.

## Profile and account screens

- `AccountInfoPage` is account-scoped: profile edit writes the relay record and the linked credentials
  come from the relay token's `link$`. A cloud's own name is not an account attribute, which is why the
  rename lives under cloud management.
- `AccountLinkSection` shows the masked tail of a linked number only, since that is the one form the
  server hands back. It uses `link`, not `login`, for a phone because the session is already a main user:
  proving a number hangs it on the session instead of opening a new one. The section renders nothing for a
  guest (linking needs a main-user session) and, as the README says, nothing while `link$` reads unknown.
- `useSocialLinks` links with the **requested** provider, not whatever the bridge echoed back: the row the
  user tapped is the intent, and the field the packet requires then always exists. A relay code from the
  virtual shell rides the same way (`link-account` takes `{ provider, code }` too, and the code holds for
  both `verify` and `confirm`). A cancelled native flow returns `null`: no toast, no state change. There is
  no local write after a link; the row refreshes from `user.profile`.
- `ProfileEditPage` limits the name to 30 characters and a photo to 10 MB. The same "too large" message
  covers a codec failure, so when an encode fails only the file's size and type are logged (never its
  contents) — those are what tell the two apart.
- `useUpdateProfile` falls back to what was sent when the server's echo is thin, so the header still
  updates. A `photo` left out means "leave it alone", not "clear it".

## Settings screens

- Settings, notification settings and the cloud management pages are their own scroll port, so the
  frosted bar is `sticky`: left in the flow it would scroll away with the notch strip, and rows would pass
  the status bar unblurred. The same pages pass `headerSafeArea={false}` where they use `PageHeader` (see
  [chrome-and-focus-notes.md](../../shell/chrome-and-focus-notes.md)).
- The version row shows an update status on iOS only, from the live `updateAvailable` check, not from the
  boot-time version info, which is always false on a cold start. The row opens the store only when an update
  is pending; the debug unlock deliberately lives on the Lab screen so this row has no hidden side effect.
- The feedback row is the sole entry to feedback and is reachable by guests too, since the report accepts
  an unauthenticated session.
- Device push mute is disabled with a hint outside a shell, where no push device exists and the write would 404.

## App icon

The app reports its primary icon as `DefaultIcon`, lists it with a `null` id, and the hook starts from
`'default'` before the app has answered. All three are the same icon, and `isDefaultAppIcon` accepts all of
them; comparing against only some left the picker with no row checked while the primary icon was in use. A
change records the icon the app says it applied, not the one asked for. A label without a translation falls
back to the app's own label.

## Mini app launcher

Ids for owner-saved mini apps come from `crypto.getRandomValues`, not `crypto.randomUUID`, which exists
only in a secure context; a real device loads the dev server over plain http from a LAN address. A store
that is full or blocked reads as empty and drops writes, so every write is read back to learn whether it
held, and a dropped consent write is not an error — the page opens this time and the question returns.
