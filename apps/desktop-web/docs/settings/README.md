# settings

The Settings page (`src/app/features/settings/`): notifications, the mini apps and the About section,
with the Account entries on top. Its notification controls are this device's own; one level for a whole place or cloud
is set from that place's or cloud's settings ([notifications](../chat/notifications.md#place-and-cloud-levels)). Appearance and language are not on the page; they live in the popup below.

In the desktop app, where device pairing is on and the session did not itself come from a pairing,
the Account entry is followed by **Approve web sign-in**, which opens the approval screen
([pairing](../pairing/README.md#approving-settingspairingapprove)). The browser's code screen names
this place, so the entry stays here.

## This device's controls

Every control on the page writes as it changes (the header says so once, which stops a person looking
for a Save button that does not exist).

- **Launch at login** is in its own Startup section (`LaunchAtLoginSection`) and is drawn only in the
  desktop shell, on a platform Electron has a login-item integration for, and only after the OS has
  answered. The shell is the only state: every reply is the OS read back, because macOS 13 and later
  can answer `requires-approval` and leave the app unregistered, and the switch then falls back to off
  rather than claim a registration that did not happen. A failed read leaves the row hidden (a switch
  whose position is a guess is worse), and a failed write flips the switch back with a line saying so
  that clears on the next toggle, since a bare flip back reads as a flicker. The section carries its
  own heading so all of it disappears together in a browser.
- **Desktop banners** and **device push** are two different axes. The first stops this app raising a
  banner; the second (`useDevicePushMute`) stops the server sending this device anything, including
  while the app is closed. No endpoint reads the current push value: `device.update-remote` only
  writes, and its answer echoes what the server now holds. So the switch shows a local mirror
  (the `ui.pushMuted` setting) that our own writes seed: it flips at once, then settles on the
  server's echo (which wins over what was sent) or rolls back on failure with an error line. The switch
  reads "receive notifications", the inverse of muted.
- **Push is disabled outside the desktop shell**, with the reason as its hint, and shown off: only the
  shell injects `CHATIC_APP_PLATFORM` and registers a device for pushes, so in a browser tab there is
  no device for the write to address and it would always fail, and a disabled switch showing "on"
  claimed a push the browser was never going to receive. The check reads that injected platform, not
  the `push` host port, because that is what it has always read: a host with a bridge but no platform
  would answer differently. apps/web has a hook of the same name, which is deliberately not shared:
  the web one reports failure through a toast this app does not use.
- **Quiet hours** take a start and an end that may cross midnight (22:00 to 07:00 is nine hours). Start
  equal to end silences nothing, so the page says so in a steady live region that both time inputs point
  at, rather than an alert that toggles or a disabled save. The window is printed in the locale's
  clock. The mention breakthrough switch is its own row below,
  shown only while quiet hours are set, because a switch with no window to break through would read as a
  second master switch; it sits outside the quiet-hours row so its switch lines up with the others'
  column.

## Appearance popup

The account menu in the nav rail has an **Appearance** entry, just above Settings. It opens a popup with
display mode, theme, text size, message density and language, so a change shows on the screen behind it
as it is made. That is the point of it: picking a palette and looking at the shell used to mean leaving
the chat for `/settings` and back. The Settings page no longer has an Appearance card, so the popup is
the only place these are set.

- `AppearanceDialog` is mounted once at the router (`routes.tsx`), like the shortcuts sheet, and is opened
  through `useAppearanceDialogStore`. `AccountMenu` imports that store file directly, not the settings
  barrel, so the Settings page does not ride into the chat chunk.
- The controls are `AppearanceControls` (`components/AppearanceControls.tsx`); the sections below
  describe them.
- Nothing is saved on a button: every control writes as it changes.

## Appearance: display mode and theme

**Display mode** is light, dark or system (`@chatic/theme` puts `light` or `dark` on the root).

**Theme** picks one of six preset shell palettes (Mist, the default, Midnight, Forest, Ocean, Plum and
Lemon) or Custom.
A palette recolours the cloud rail, the nav rail and the channel list only; the chat keeps the colours of
the display mode. Each choice is a card with the shell in miniature, and picking one applies it at once
and shows a "Theme applied" toast (picking the one already on does nothing).

- **Custom**, the seventh card, is the user's own three colours. The first time, it starts from the
  colours of the palette that was on; three colour fields (cloud bar, menu bar, list) then appear under the cards.
  The shell follows a field while its picker is dragged, and the "Theme applied" toast shows once, when
  the picker closes. There is one custom slot, kept in `customPalette` on this device only; picking a
  preset keeps it, so Custom comes back as it was. There is no reset: a preset card is the way back.
- A palette is three colours: cloud rail, nav rail and list (`PRESET_COLORS` in
  `src/app/shared/theme/shellPalette.ts`). `derivePaletteTokens` turns them into every token the shell
  draws with, for light and for dark mode, so the six presets and any other three colours go through one
  rule.
- The rule keeps the shell readable whatever the colours. A rail takes white text or dark ink, whichever
  reads better on it, and its lightness then moves until the text, its tiles and the focus ring clear AA
  (3:1 for the ring). The list's lightness moves until its secondary text clears AA on the hover. The
  hover, loading bars and search field (`--accent`, `--muted`, `--well`) sit one visible step off the list.
  The nav rail's open tile is lime, or near-black with a white icon on a coloured rail of about lime's
  lightness (Lemon's lime rail).
- In dark mode a palette keeps each colour's hue at the dark shell's lightness (rail 7%, nav rail and list
  18%), with the saturation held down. **Mist in dark mode is the stylesheet's own dark shell**, unchanged.
- The tokens reach the page as one generated stylesheet (`<style id="shell-palette">`, written by
  `applyAppearance` before the first render and on every change). Light rules sit under
  `:root:not(.dark)` and dark ones under `:root.dark`, so switching the display mode needs no rewrite.
  The rails and the list draw with page tokens too, so the rail elements carry `data-shell-rail="cloud"`
  or `"nav"` and the list `data-shell-sidebar`, and the rules set those tokens inside them only.
- The desktop tokens (`libs/design-system/tokens/desktop/src/light.css`, imported by `styles.css`) keep
  Mist's light values on `:root`: that is what paints before the app starts.
- The choice is kept with the other appearance preferences (`palette` and `customPalette` in
  `chatic-appearance-prefs`, version 1) and also written to the root as `data-palette`. A palette name
  this build does not know, malformed custom colours, or Custom with none saved read as Mist.
- The sample cards draw from the same rule, each under its own `data-palette-preview`, so a card always
  shows its own palette. Mist's card in dark mode repeats the dark shell's three values in a `styles.css` rule.
- `shellPalette.spec.ts` measures the rule on the presets and on a sweep of seeded random colours, in
  both modes.

## Appearance: text size and message density

Two reading preferences sit between Theme and Language, each a radio group (arrow keys move the choice),
with a preview of two sample messages that changes as the choice does. Both are kept in
`useAppearancePrefsStore` (localStorage, key `chatic-appearance-prefs`).

- **Text size** (small, default, large) sets the root `font-size` to 14, the browser's own base, or 17px.
  Everything is sized in rem, so the whole app scales, spacing included, not only text. The default
  clears the override instead of writing 16px, so a reader who changed the browser's base size keeps it.
- **Message density** (compact, comfy, spacious) sets `--message-row-py` and `--message-gap`, which only
  the message rows read (the padding of an author block and the gap between its messages). Comfy equals
  the spacing before the setting existed, and the desktop tokens carry the same values as fallbacks.

`main.tsx` applies the stored values before the first render; the store hydrates localStorage
synchronously, so the app never paints at the default size first. After that a subscription in the
store applies each change.

## Appearance: language

- **Which language boots.** The explicit choice first (kept in the device store under
  `chatic.language`), then the system language, then English. Most of these users read Korean, and the
  app used to open in English for all of them because English was the only bundle. A blocked storage
  reads as no choice, which falls through to the system language; a write it drops still leaves the
  choice applied for the session.
- **The picker is shown only while more than one bundle ships** (`SUPPORTED_LANGUAGES` in `src/i18n.ts`
  owns the list), since a picker with a single choice is chrome. Each language is named in itself,
  so a choice reads in the language it selects.
- **The document's `lang` follows the language**, so a screen reader picks the matching voice; a fixed
  `lang="en"` had it read Korean text in an English voice.
- **`locales/en.ts` is the source of the key set.** The Korean bundle is typed against it, so a key
  added to English is a type error there until translated, while values stay plain strings. A parity
  spec backs the types, because a key in one language only renders as the raw key on half the installs.
  The `emoji` namespace (names from CLDR, keyed by the emoji) is generated by
  `yarn generate:emoji-names`, so it stays out of the hand-kept bundle and its typing; those files
  are not edited by hand.
- **Korean copy has a house register.** Anything that reads as a sentence is in the polite informal
  register, labels, buttons and menu items are bare noun phrases so the UI stays as short as English,
  the formal register is not used, and there are no exclamation marks the English does not have.
  One Korean term stands for each English product term across the whole file (the cloud is the same
  word as in the mobile app, and "workspace" is not a second name for it); product nouns, keys and
  tokens stay verbatim. `copy.spec.ts` pins the account area's wording literally (one noun, one
  destroy verb, the name cap of 20), because those exact lines shipped wrong once and a paraphrase is
  what let them.

## Mini apps

A section of its own, after Startup (`components/MiniAppSettingsItem.tsx`, `hooks/useMiniAppLauncher.ts`).
The nav rail's Mini app tile under DM (`components/MiniAppRailButton.tsx`) is the same launcher, with
the same dialogs and conditions ([nav rail](../shell/nav-rail.md#mini-app)).
It opens a cloud's mini apps in the desktop shell's sub view, a modal over the app. The shell side is
in `apps/desktop` (Sub view), and what the page receives is in the sub WebView protocol
(`apps/mobile/docs/webview/mini-app-protocol.md`).

- **Where it appears.** Only in a shell whose handshake says `subWebViewOpenScope: 'anyHttps'`. The
  web ships before the shell, so it asks rather than assuming: `utils/subWebViewShell.ts` reads
  `runtime.links.subWebView` (`null` in a plain browser), whose desktop shell implementation
  (`src/config/adapters/links.ts`) sends the one `WebAppReady` desktop-web sends, answered with no side
  effect. A plain browser, an older shell and the phone do not show it. Neither does the Default Cloud
  (Home), which is the relay's and has no owner and no mini app link. It is also hidden on production:
  mini apps are not released there yet, so the section shows only when `VITE_ENV` is `LOCAL` or `DEV`
  (a build with no stage hides it too).
- **The link.** A cloud has one mini app link, kept on the relay as the cloud's `miniAppUrl` field
  (`hooks/useCloudMiniApp.ts`, through `CloudRepository.fetchMiniAppUrl` / `saveMiniAppUrl`; react-query
  is its only cache). `''` means none. The relay checks nothing about the value, so the web checks it
  again before opening it, by the same rule it saves by.
- **Open mini app.** Everyone in the cloud gets this row. It opens the cloud's link when there is one
  the shell would open, and DoU's hub otherwise (`https://apps.chatic.io/` on a PROD build,
  `https://apps-dev.chatic.io/` otherwise) — a stored value the shell would refuse opens the hub and is
  logged. The row's hint names the link's host, or says the hub will open. Every press reads the link
  from the relay again rather than trusting the cache — the owner may have changed it from another
  device, and nothing tells this one; a cloud switch while that read is out opens nothing, and a read
  that fails is a failure toast.
- **What a page receives.** `MiniAppLaunchParams` (`@chatic/shared`): the cloud, the open place, my id
  in this cloud, and my name, which is my place nick (under my id in this cloud, else my account id),
  else the cloud profile's name. Only the hub is also told whether I own the cloud; its `miniApps` list
  is always empty now that the cloud has one link instead of a list. A second press while the request
  is still out sends nothing. A refusal from the shell, or a session that has no id in this cloud yet,
  is a failure toast.
- **Setting the link.** The cloud's owner alone (the cloud tile's `kind === 'owned'`) also gets a
  "Mini app link" row, its hint the link's host or "Not set" (no hint until the link is read). It
  reads the link from the relay again, not from the cache, and opens a dialog on what it holds — a read
  that fails opens no dialog and says so, so the owner never overwrites a link they cannot see. The
  dialog takes one address,
  checked by `checkMiniAppUrl` (`@chatic/shared`) before it is sent: an address the shell opens by its
  trust rule, so a saved link is never one the shell would refuse. An address on the hub's own hosts,
  any path, is refused with its own message: a page there would be told the owner flag, and its close
  result read as the hub's. Save sends `PUT /clouds/:id { miniAppUrl }`; with a link set the dialog
  also offers Remove, which saves `''`. A save the relay refuses keeps the dialog open and says so.
    - The link is not secret. The relay returns it to anyone who reads the cloud by its id, signed in
      or not, so the dialog tells the owner not to put secrets in it.
    - Switching clouds drops what the previous cloud left waiting: an open dialog, a consent not yet
      answered, and the result of a hub opened for it.
- **Consent.** The first time a host DoU does not run (`external`) would open, the user is asked
  whether it may receive their name, their id in this cloud, the cloud and the place. Declining opens nothing. Agreeing is
  remembered per account and host (`dou.miniAppConsent.<accountId>.<host>`), so on a shared computer one
  person's yes does not send another's names. DoU's own pages are not asked about. A storage that refuses the write is not an error: the page still opens this time and the question
  comes back next time. A consent left waiting when the cloud changes is dropped, since agreeing to it
  then would send the new cloud's names to the previous cloud's site.
- **Back from the hub.** Every sub view's close is heard through the same port
  (`runtime.links.subWebView.onClosed`, in `utils/subWebViewShell.ts`), and the screen matches the
  view id it opened. When the hub view this screen opened closes with
  `result: { action: 'openMiniAppLinkSettings' }`, the link dialog opens, and only for the owner — a
  member's request is dropped then, not kept for the day the catalog names them the owner. Any other
  view's result, and any other result (an `openMiniApp` from an older hub included), is ignored.

## Documents

- [report-a-problem.md](./report-a-problem.md): the About-section entry that sends a written report.
