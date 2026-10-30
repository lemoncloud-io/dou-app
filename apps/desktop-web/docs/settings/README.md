# settings

The Settings page (`src/app/features/settings/`): appearance, language, notifications and the About
section.

In the desktop app, where device pairing is on and the session did not itself come from a pairing,
the Account entry is followed by **Approve web sign-in**, which opens the approval screen
([pairing](../pairing/README.md#approving-settingspairingapprove)). The browser's code screen names
this place, so the entry stays here.

## Appearance: display mode and theme

**Display mode** is light, dark or system (`@chatic/theme` puts `light` or `dark` on the root).

**Theme** picks one of six shell palettes: Mist (the default), Midnight, Forest, Ocean, Plum and Lemon.
A palette recolours the cloud rail, the nav rail and the channel list only; the chat stays on the light
ground. Each choice is a card with the shell in miniature, and picking one applies it at once and shows a
"Theme applied" toast (picking the one already on does nothing).

- The choice is kept with the other appearance preferences (`palette` in `chatic-appearance-prefs`) and
  written to the root as `data-palette`, before the first render like the rest. A palette name this build
  does not know reads as Mist.
- `styles.css` holds the colours: Mist is `:root`, and every other palette is a block on
  `:root[data-palette=…]:not(.dark)`. **Palettes are light mode only**: in dark mode the shell keeps its
  dark colours, whatever is picked.
- The four dark palettes (and Lemon's cloud rail) put dark rails under a light page. The rails also draw
  with page tokens, such as a tile's ground, a hover, a divider and the focus ring, so the rail elements
  carry `data-shell-rail="cloud"` or `"nav"` and those tokens are remapped to dark-ground values inside
  them only.
- The list keeps its hover the same way: the sidebar carries `data-shell-sidebar`, and inside it the
  row hover (`--accent`) and loading bars (`--muted`) are a shade darker than the palette's list colour.
- The preview cards read the same blocks through `data-palette-preview`, so a card always shows its own
  palette. `src/tokenContrast.spec.ts` measures every palette's rail and list text against AA.

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
