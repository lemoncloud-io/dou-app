# settings

The Settings page (`src/app/features/settings/`): notifications, the mini app and the About section,
with the Account entries on top. Appearance and language are not on the page; they live in the popup below.

In the desktop app, where device pairing is on and the session did not itself come from a pairing,
the Account entry is followed by **Approve web sign-in**, which opens the approval screen
([pairing](../pairing/README.md#approving-settingspairingapprove)). The browser's code screen names
this place, so the entry stays here.

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
- `styles.css` keeps Mist's light values on `:root`: that is what paints before the app starts.
- The choice is kept with the other appearance preferences (`palette` and `customPalette` in
  `chatic-appearance-prefs`, version 1) and also written to the root as `data-palette`. A palette name
  this build does not know, malformed custom colours, or Custom with none saved read as Mist.
- The sample cards draw from the same rule, each under its own `data-palette-preview`, so a card always
  shows its own palette. Mist's card in dark mode repeats the dark shell's three values from `styles.css`.
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
  the spacing before the setting existed, and `styles.css` carries the same values as fallbacks.

`main.tsx` applies the stored values before the first render; the store hydrates localStorage
synchronously, so the app never paints at the default size first. After that a subscription in the
store applies each change.

## Mini app

A section of its own, after Startup (`components/MiniAppSettingsItem.tsx`, `hooks/useMiniAppLauncher.ts`).
It opens the cloud's mini app in the desktop shell's sub view, a modal over the app. The shell side is
in `apps/desktop` (Sub view), and what the page receives is in the sub WebView protocol
(`apps/mobile/docs/webview/sub-webview-protocol.md`).

- **Where it appears.** Only in a shell whose handshake says `subWebViewOpenScope: 'anyHttps'`. The
  web ships before the shell, so it asks (`utils/subWebViewShell.ts` sends the one `WebAppReady`
  desktop-web sends, answered with no side effect) rather than assuming. A plain browser, an older
  shell and the phone do not show it. Neither does the Default Cloud (Home), which is the relay's and
  has no owner and no link.
- **Open mini app.** Everyone in the cloud gets this row. It opens the cloud's link, or DoU's hub when
  there is none (`https://apps.chatic.io/` on a PROD build, `https://apps-dev.chatic.io/` otherwise).
  The page receives `MiniAppLaunchParams` (`@chatic/shared`): the cloud, the open place, my id in
  this cloud, and my name, which is my place nick, else the cloud profile's name. Only the hub is
  also told whether I own the cloud. A second press while the request is still out sends nothing. A
  refusal from the shell, or a session that has no id in this cloud yet, is a failure toast.
- **Mini app link.** The cloud's owner alone gets this row (the cloud tile's `kind === 'owned'`). The
  link is checked with `isOpenableSubWebViewUrl`, the rule the shell opens by, so a saved link is never
  one the shell would refuse. An empty value removes it.
    - It is kept on this computer only, in `localStorage` under `dou.miniAppLink.<cloudId>`. There is
      no server field yet, so members do not see the owner's link. Switching clouds shows that cloud's
      link.
    - A storage that refuses the write says so in the dialog.
- **Consent.** The first time a host DoU does not run (`external`) would open, the user is asked
  whether it may receive their name, the cloud and the place. Declining opens nothing. Agreeing is
  remembered per host (`dou.miniAppConsent.<host>`). DoU's own pages are not asked about.
- **Back from the hub.** When the hub view this screen opened closes with
  `result: { action: 'openMiniAppLinkSettings' }`, the link dialog opens, and only for the owner. Any
  other view's result is ignored.

## Documents

- [report-a-problem.md](./report-a-problem.md): the About-section entry that sends a written report.
