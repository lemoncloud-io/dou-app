# Session, storage and sign-in

Source: `runtime.ts`, `session-owner.ts`, `storage.ts`, `config.ts`, `preference.ts`, `auth.ts`. See the
[index](./README.md) for conventions.

## Runtime across the bridge

On the phone the session can belong to the shell's own process: the shell runs the runtime (the session, its
tokens, the sockets, sync and the repositories) and the main web mirrors it, asking the shell for everything the
session decides. These four requests and two pushes are that whole conversation. What is called is named in the
payload (`target`, `method`), not in the message type, so the web can call something new without a new message;
the shell answers it once its own runtime has it. Bodies are plain JSON (`RuntimeWireValue`); what they mean
(the session snapshot, callable methods, event kinds, the contract version) belongs to the runtime's contract
in `@chatic/runtime-core`, and this package only says how it travels. No token crosses: the snapshot leaves
tokens out and a call answers with what the screen needs. Since 2.23.0.

- **`window.CHATIC_APP_RUNTIME`** (`RuntimeOffer`) — what a shell that can own the session sets before the page
  runs. `contracts` lists the contract versions it speaks, lowest first. `held: true` (since 2.35.0) means its
  runtime already holds the session in this app process, so the offer is no longer one to decline: a page
  that ran its own runtime now would be a second owner, so it says hello whatever its own setting or contracts.
  Absent from shells before 2.35.0 and before the first hello of a process. The handshake below settles it.
- **`RuntimeHello`** (web→native, reply `OnRuntimeHello`) — opens the conversation for this page load. Sent once,
  before the page boots its runtime; a reloaded page sends it again and gets the session as it is now. `contracts`
  is what the page speaks, lowest first. The reply says who owns the session for this launch: `native` with the
  chosen `contract`, the current `session` snapshot and its sequence `seq`; or `web` when the shell declines (it
  speaks none of the page's contracts, or will not run its runtime this launch) and the page runs its own. The
  shell gives every hello of a launch the same owner. Only the main web is answered in full, and only by a shell
  that offered.
- **`RuntimeCall`** — call one method. `target` is what owns it (a part of the session, a repository);
  `method` and `args` are named by the runtime's contract. A method that throws answers `success: false`, and the
  error's `details` carry what the page needs to throw the same kind of error.
- **`RuntimeSubscribe`** / **`RuntimeUnsubscribe`** — start and end a stream (a chat feed, a channel list) under a
  `subscriptionId` the page chose. Ending one that is already gone is not an error; once closed, no further event
  for it follows.
- **`OnRuntimeEvent`** (native→web push) — one event of an open subscription. `seq` counts up per subscription so
  the page can tell a gap from a late arrival.
- **`OnRuntimeSessionChanged`** (native→web push) — the session changed. `seq` counts up for the launch; a page
  that already holds a later snapshot drops this one. `signals` names which kinds of change the snapshot
  carries, as the runtime's contract names them.

A sub WebView page is answered the same four requests on its own host through a whitelist (see
[sub-webview.md](./sub-webview.md)); its hello settles nothing about ownership.

## Session owner switch (phone)

Which side holds the session: the page (`web`) or the shell's own runtime (`native`). The owner is settled when
the shell's JS starts, so a change is recorded and takes effect by the shell starting its JS over, which reloads
the page with it.

- **`FetchSessionOwner`** / **`SetSessionOwner`** (since 2.24.0) — the web debug overlay's switch. `Fetch`
  returns `current` (what this run started with) and `next` (what is recorded for the next start). `Set`
  records `owner` and, when it differs from the current one, restarts the shell's JS at once, this page
  included; the reply's `restarting` says whether that is happening. A shell for a local or test stage always
  answers; a production shell from 0.32.0 answers only while its debug mode is on and refuses otherwise with
  `NOT_ALLOWED`; an older production shell leaves both unregistered (`NOT_FOUND`). Either refusal makes the
  overlay show the switch as not offered.
- **`SetDefaultSessionOwner`** (since 2.28.0) — the page's word on the owner of every install nobody switched.
  The web build carries a setting and sends it on each boot, so a web deploy decides which side a production app
  holds the session on, with no app release and no debug mode. The shell records it for the _next_ start and
  never restarts for it. A choice recorded by the switch still outranks it, and so does a build's own pin.
  `owner: null` clears it and the install falls back to the build's default (the app's runtime in production from
  0.32.1). Answered by any build that lists it in its `WebAppReady` reply; before it, `NOT_FOUND`. The reply
  returns the recorded `default` and the `next` owner once every rule is applied.

## Native storage media

**`StorageGet`**, **`StorageSave`**, **`StorageClear`** (web→native, since 2.21.0) — a storage medium the shell
keeps for the web. The only one is `nativeSecure`, the device vault: iOS Keychain, Android Keystore, or Electron
`safeStorage` on the desktop. The web keeps a copy in memory and reads it synchronously; these messages fill
that copy at boot and write it through. A shell that keeps a medium says so before the page runs:
`window.CHATIC_APP_STORAGE_MEDIA` lists the media (`['nativeSecure']`), and the web decides from that list alone.
Only the main web (the phone's main WebView, the desktop's main window) is answered; a sub WebView is not.

- **`StorageGet`** — every value in the medium. The shell reads the vault when it starts, before the page, and a
  request arriving before that read finishes waits for it. The reply is `available` with `values`, or
  `unavailable` with a `reason` (`locked`, `undecryptable`, `error`) and `values` of `{}`. `reset: true` means
  the vault could not be decrypted (the device key was invalidated, or the data came from another device), so
  the shell emptied it and started over and the person signs in again.
- **`StorageSave`** — writes by key: `set` stores each value, `remove` drops each key. One request carries every
  write the web made in one turn of its event loop. `ok` is true only once the writes are in the vault; `false`
  means they are not, and the shell treats the medium as unavailable for the rest of the run.
- **`StorageClear`** — `ok` only once the vault is empty.

## Shell KV, preferences and sign-in

- **`SaveConfigValue`** / **`ClearConfigValue`** (web→native) — the shell's general-purpose key-value store; the
  value is an opaque string whose meaning the shell does not know. Clearing a key removes an override.
- **`FetchPreference`**, **`SavePreference`**, **`DeletePreference`** (web→native) — native copy of a preference
  so it survives a WebView cache clear. `PreferenceKey` is a closed union of six keys (`isFirstRun`, `theme`,
  `language`, `debugSettings`, `blurLastMessage`, `pushRegistration`). `pushRegistration` is not a user
  setting: it is the runtime's record that this device already registered its push token, mirrored natively so a
  cache clear does not trigger a re-registration; the runtime owns it, not the preference store. Writing it needs
  the phone's allowlist, which every phone shell the web still runs in (app 0.30.0 and later) carries; a shell
  without native preference storage (the desktop shell) refuses it and the web keeps its localStorage copy.
  `blurLastMessage` is web-only but also persisted natively for the same reason.
- **`OAuthLogin`** / **`OAuthLogout`** (web→native) — run the provider sign-in (`google` or `apple`).
  `OnOAuthLogin.result` is `null` when the user cancels or an error occurs. A native app answers with a
  provider token (`OAuthTokenResult`: Google `idToken`, Apple `identityToken` plus `user`; Apple gives `email`
  and `fullName` only on the first login). Only the virtual mobile shell answers with an `OAuthCodeResult`
  instead, when its sign-in goes through the organisation's OAuth relay: the relay keeps the provider's token
  and hands back a short-lived `code`, the same code the desktop app exchanges. The web exchanges the code itself
  (`verify-oauth-code`, signed with the device session already on it). Tell the two apart by `code`.
