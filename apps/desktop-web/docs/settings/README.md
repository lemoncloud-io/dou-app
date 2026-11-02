# settings

The Settings page (`src/app/features/settings/`): appearance, language, notifications and the About
section.

In the desktop app, where device pairing is on and the session did not itself come from a pairing,
the Account entry is followed by **Approve web sign-in**, which opens the approval screen
([pairing](../pairing/README.md#approving-settingspairingapprove)). The browser's code screen names
this place, so the entry stays here.

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

## Documents

- [report-a-problem.md](./report-a-problem.md): the About-section entry that sends a written report.
