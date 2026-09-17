# Design

The visual system the three clients draw with, and where each value lives in code.
`PRODUCT.md` owns brand personality, principles and anti-references; this file does not
repeat them, it says how they land in pixels. When a value here disagrees with the code,
the code and the Figma node it cites win, and this file is what gets fixed.

Priority: `apps/desktop-web` and `apps/web` first. `apps/block-kit-builder` inherits the
desktop theme and is covered where it differs.

## Sources of truth

| Source                                                                        | What it settles                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma "DoU PC" (`RZY1z3I2t9hUTIgiXpI8nL`)                                     | Desktop shell, colors, chat layout. Reference nodes: `187-3` (main chat, image upload), `247-10714` (light theme), `254-541` / `259-566` (dark theme), `75-53` (Block Kit Builder) |
| Figma mobile design system                                                    | `apps/web` screens, cited per component inside `libs/web-ui-kit` (node ids in the source comments)                                                                                 |
| `apps/desktop-web/src/styles.css`                                             | Desktop token values, light and dark, hex of the Figma source beside each                                                                                                          |
| `apps/web/src/styles.css` + `libs/web-ui-kit/src/resources/styles/tokens.css` | Mobile web token values. The two files must agree, the kit renders inside the app and inside Storybook                                                                             |
| `apps/block-kit-builder/src/styles.css`                                       | Same token names as desktop-web, sage-tinted values, plus `syntax.css` for the payload editor                                                                                      |
| `apps/*/tailwind.config.js`                                                   | Token to utility mapping, type scale, radius, shadows, motion                                                                                                                      |

Figma variables read from node `187-3` (the desktop palette):

| Figma name                    | Hex       | Where it lands                                                   |
| ----------------------------- | --------- | ---------------------------------------------------------------- |
| `main color/GR1`              | `#B0EA10` | `--primary` on every surface. The only hue in the system         |
| (GR2, referenced in comments) | `#90C304` | `--main-accent`: send button, composer focus ring                |
| `blue_bk`                     | `#102346` | `--brand-ink` (web): avatar badge, active send, my bubble        |
| `gray_blue`                   | `#E4EAEC` | not tokenised, unused in code                                    |
| `Solid/Secondary/BK_50`       | `#F4F5F5` | `--secondary`, `--muted`, `--accent` hover, `--avatar-ring`      |
| `BK_100`                      | `#EAEAEC` | `--border`, `--hairline`, `--input-border`                       |
| `BK_300`                      | `#CFD0D3` | `--control-idle`, `--toast-muted`                                |
| `BK_400`                      | `#BABCC0` | `--placeholder` (web)                                            |
| `BK_500`                      | `#9FA2A7` | `--placeholder` (desktop), dark `--label` (web)                  |
| `BK_600`                      | `#84888F` | `--description`: timestamps, sub text                            |
| `BK_700`                      | `#53555B` | `--label` (web), `--dialog-subtitle` (desktop)                   |
| `BK_800`                      | `#3A3C40` | `--label` (desktop), `--rail-foreground`, `--focus-border` (web) |
| `BK_900`                      | `#222325` | dark toast text, active tab (web nav)                            |
| `Colors/Green`                | `#34C759` | not tokenised                                                    |
| `Colors/Orange`               | `#FF9500` | `--favorite` (desktop star)                                      |
| `Colors/Pink`                 | `#FF2D55` | `--badge-unread` (desktop), `--point-pink` (web)                 |

## Surfaces

Three clients, one engine (`libs/app-runtime`). Presentation is rebuilt per platform.

| App                      | Shape                                                                                 | Theme file                                     | Kit                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/desktop-web`       | Slack-style desktop, Electron shell in `apps/desktop`                                 | desktop `styles.css`                           | `libs/ui-kit` (shadcn/Radix) + `libs/block-kit`                                                           |
| `apps/web`               | Phone-class mobile web inside a React Native WebView, fills the device, caps at 768px | web `styles.css`                               | `libs/web-ui-kit` (Figma mobile system) + `libs/ui-kit` primitives underneath overlays + `libs/block-kit` |
| `apps/block-kit-builder` | Three-pane authoring tool for Block Kit messages                                      | desktop token set, sage-tinted, + `syntax.css` | `libs/ui-kit` + `libs/block-kit`                                                                          |

`libs/block-kit` is the one message renderer. It asks for semantic classes (`text-body`,
`bg-well`, `border-hairline`) and each app answers with its own value, so a preview in the
builder cannot drift from a real message in a channel.

## Color

### One hue

Lime `#B0EA10` is the brand and the only chromatic accent. It means active selection,
unread, primary action. It is never decoration. Every other color is a neutral from the
BK ramp, plus three fixed signals: pink for unread counts, orange for the favorite star,
red for destructive and failed.

### Lime as fill versus lime as ink

White on `#B0EA10` is 1.6:1, so:

- **Fill**: `bg-primary text-primary-foreground` (dark ink on lime). Buttons, active tiles.
- **Text on light surfaces**: `text-primary-ink`, a darkened lime that clears 4.5:1
  (desktop light `76 80% 26%`). Links, mentions, active glyphs.
- **On dark surfaces** the fill already reads as text, so `--primary-ink` equals
  `--primary`.

`libs/block-kit` resolves links and mentions to `primary-ink`, never `primary`.

### Desktop palette (light, from Figma `247-10714`)

| Token                                  | HSL            | Hex / role                                           |
| -------------------------------------- | -------------- | ---------------------------------------------------- |
| `--background`                         | `0 0% 100%`    | main pane                                            |
| `--foreground`                         | `0 0% 10%`     | `#1A1A1A`                                            |
| `--rail`                               | `0 0% 96%`     | `#F5F5F5` cloud rail                                 |
| `--rail-elevated`                      | `0 0% 100%`    | place rail                                           |
| `--sidebar`                            | `0 0% 100%`    | channel list panel                                   |
| `--secondary` / `--muted` / `--accent` | `180 5% 96%`   | `#F4F5F5` chips, hover                               |
| `--muted-foreground`                   | `218 5% 46%`   | one step darker than BK_600, which is 3.6:1 on white |
| `--border` / `--hairline`              | `240 5% 92%`   | `#EAEAEC`                                            |
| `--input`                              | `240 6% 90%`   | `#E5E5E8` composer box                               |
| `--well`                               | `0 0% 96%`     | search bar, code block ground                        |
| `--destructive`                        | `3 100% 59%`   | `#FF3B30`                                            |
| `--warning`                            | `38 92% 50%`   | connecting banner                                    |
| `--badge-unread`                       | `349 100% 59%` | `#FF2D55`                                            |
| `--favorite`                           | `35 100% 50%`  | `#FF9500`                                            |
| `--toast`                              | `222 75% 12%`  | `#081837`, always dark                               |

### Desktop palette (dark, from Figma `254-541` / `259-566`)

Warm near-neutral grays, same lime.

| Token                                                     | Hex                                                   |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `--background`                                            | `#252624` main pane                                   |
| `--card` / `--sidebar` / `--rail-elevated` / `--elevated` | `#2E2F2D`                                             |
| `--rail` / `--muted` / `--secondary` / `--well`           | `#121312`                                             |
| `--foreground`                                            | `#EBEBE8`                                             |
| `--accent` (hover)                                        | `#38393A`                                             |
| `--border` / `--hairline`                                 | `#424540`                                             |
| `--input`                                                 | `#3D3E3C`                                             |
| `--focus-border`                                          | `#B0EA10` (composer focus is the lime itself on dark) |
| `--toast`                                                 | `#F4F5F5` light card, dark text                       |

### Mobile web palette

Cool neutrals (hue 220), radius 0.75rem, and two extra signals the desktop lacks:
`--point-blue` `#2A7EF4` for inline text links and `--verified` `#007AFF` for the
verified check. My bubble is `--bubble-mine` `#102346` navy, peer bubble `#F6F6F6`.
Dark theme is pure neutral (`0 0% 7%` ground). Full table in the web `styles.css`.

### Builder palette

Same tokens as desktop, but sage-tinted (hue 90 to 130, low chroma) so the neutral
ground coheres with the lime, and the rails are deep sage-dark instead of light. The
payload editor adds three code hues (`--code-key` violet, `--code-string` lime,
`--code-literal` amber) in `syntax.css`. Strings carry the brand colour on purpose:
they are the message's actual words.

### Rules

- No raw hex in components. Every colour is `hsl(var(--token))` through a Tailwind
  class. The one exception is `avatarStyle`, which derives a per-user hue and reads
  `--avatar-l` / `--avatar-fg` for lightness.
- No `gray-*`, `amber-*`, `slate-*` utilities. Depth comes from `elevated`, `well`,
  `hairline`; warnings from `warning`.
- A shadow is tinted (`--shadow-color`), never flat black.
- Text under 4.5:1 is not text. Placeholders are held to 4.5:1 as well.

## Typography

**Pretendard**, weights 400 / 500 / 600 / 700 / 800, loaded from Google Fonts with the
system stack as fallback. Antialiased. Every app sets it on `html`.

### Desktop scale (`apps/desktop-web/tailwind.config.js`)

Hierarchy comes from weight and tracking, not only size.

| Class           | Size / leading | Tracking | Weight | Used for                        |
| --------------- | -------------- | -------- | ------ | ------------------------------- |
| `text-display`  | 24 / 30        | -0.024em | 800    | onboarding, empty hero          |
| `text-title`    | 18 / 26        | -0.017em | 700    | dialog titles                   |
| `text-heading`  | 15 / 22        | -0.009em | 600    | section heads, empty-state lead |
| `text-body`     | 15 / 23.2      | -0.003em | 400    | message text, composer          |
| `text-callout`  | 14 / 20.8      | -0.002em | 400    | rows, secondary copy            |
| `text-caption`  | 13 / 17.6      | 0        | 400    | timestamps, hints               |
| `text-micro`    | 11.5 / 15.2    | 0        | 400    | edited marker                   |
| `text-overline` | 11 / 16        | +0.08em  | 600    | uppercase labels                |

Fixed sizes that live in components rather than the scale, measured against Figma:

- Channel header title: 18px semibold, tracking -0.01em, in a 68px header.
- Message author: 16px bold, tracking -0.005em. Time beside it: 13px medium, tabular
  nums, `text-description`.
- Sidebar action rows: 14px, tracking -0.01em, `text-label`.
- Unread pill: 11px semibold, tabular nums, in an 18px pill.
- Avatar fallback initial: `text-caption` semibold in a 36px avatar.

### Mobile web scale (`apps/web/tailwind.config.js`)

Only the steps the block renderer needs are defined; everything else sizes with
utilities. Body is 16px here because a message bubble already uses 16px, and block text
must not read smaller than the bubble beside it.

| Class           | Size / leading | Weight |
| --------------- | -------------- | ------ |
| `text-title`    | 20 / 28        | 700    |
| `text-heading`  | 17 / 24        | 600    |
| `text-body`     | 16 / 24        | 400    |
| `text-callout`  | 15 / 22        | 400    |
| `text-caption`  | 14 / 20        | 400    |
| `text-overline` | 12 / 16        | 600    |

Fixed: page header title 17px semibold; bubble text 16px, line-height 1.28, tracking
-0.08px; author name `text-xs` muted above a peer bubble; button labels 14px (md) and
16px (lg) semibold.

## Spacing, radius, elevation

- Tailwind's 4px grid. Desktop main pane gutters are 24px (`px-6`), sidebar 16px
  (`px-4`), builder pane headings 16 / 12.
- **Radius**: `--radius` is 0.5rem on desktop and builder, 0.75rem on mobile web.
  `rounded-lg` = radius, `md` = radius − 2, `sm` = radius − 4. Fixed radii: cloud rail
  tiles 14px, mobile bubbles 18px with the sender-side top corner squared, mobile buttons
  full pill, mobile cards `rounded-2xl`.
- **Elevation** (desktop, builder): three named shadows, low opacity, tinted.
  `shadow-raised` for a card on the ground, `shadow-overlay` for popovers and menus,
  `shadow-well` inset for a recessed control. Nothing else casts a shadow.
- **Layering** is done with surface tokens, not shadows: `bg-elevated` above
  `bg-background` above `bg-well`, separated by `border-hairline`. Cards only when
  elevation is the right affordance, never nested.
- Overlays: `bg-overlay/…` scrim; dialog and sheet content on `bg-popover`.

## Layout

### Desktop shell (`DesktopLayout.tsx`, Figma `187-3`)

```
[ cloud rail ][ place rail ][ channel sidebar | drag ][ main pane ][ trailing panel ]
```

| Region          | Code                                                                                                                                     | Figma                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cloud rail      | `w-rail` = 68px, `bg-rail`, 48px tiles at 14px radius, user menu pinned bottom                                                           | 80px "Icon Rail", 48px tile                                              |
| Place rail      | 68px, `bg-rail-elevated`, only when the cloud has places                                                                                 | 80px "Workspace Rail", 48px active / 40px inactive tiles with 12px label |
| Channel sidebar | default 286px, drag 200 to 480, persisted in `chatic.sidebar.width`; `bg-sidebar`, hairline both edges                                   | 286px "Channel List Panel", 16px inset                                   |
| Sidebar header  | place name, pill search 41px tall on `bg-well`, four 24px action rows (profile, notifications, activity, saved), hairline                | same                                                                     |
| Channel row     | 34px tall, `#` or 24px avatar leading, star or 18px unread pill trailing, section header 43px with chevron and `+`                       | same                                                                     |
| Main header     | 68px, hairline bottom, `#` + 18px title + member count chip, three 36px bordered icon squares (star, search, more)                       | same                                                                     |
| Message row     | 36px avatar, 16px name + 13px time, body `text-body`, hover `bg-accent/70` with a floating toolbar                                       | 35px avatar                                                              |
| Composer        | boxed on `bg-input`, 50px toolbar row (+ B I S code), hairline, input area with emoji and send on the right, backdrop blur, 24px gutters | 121px box, 24px gutters                                                  |
| Trailing panels | resizable, defaults: thread 384, settings / saved / mentions / profile 320, debug 440                                                    | —                                                                        |

The rail width difference (68 versus 80) is a deliberate code choice shared by
`DesktopLayout` and `AppShellSkeleton` through the `w-rail` token, so the boot skeleton
cannot drift from the shell. Change it in one place or not at all.

### Mobile web shell (`UnifiedLayout.tsx`, ADR-0011)

- `w-full max-w-app mx-auto`: fill the device, cap at `--app-width` 768px — the upper bound
  of the phone class, not a phone's width, so a foldable unfolded (~690px) is filled too.
  Overlays are portalled out of the shell, so `libs/ui-kit` and `libs/web-ui-kit` re-read
  the same variable.
- Main tabs (`/`, `/mypage`) scroll the page and get the floating bottom nav. Detail
  routes are `h-dvh overflow-hidden` and own their scroll.
- **PageHeader**: 48px minimum, centred 17px title, back chevron left, glass fill
  (`bg-white/[0.32] backdrop-blur-xl`) that owns the top safe-area inset itself.
- **FloatingTabBar** (`libs/web-ui-kit`): full-width gradient layer with a centred
  166 × 62 glass pill, two 48px tabs (Chat, My), unread badge on Chat. Active tab
  `#222325`, inactive `#53555B`. Sits over content; the page pads its bottom.
- Safe areas and keyboard come from native-injected variables: `pt-safe-top`,
  `pb-safe-bottom`, `pb-keyboard`.

### Builder (`BuilderLayout.tsx`, Figma `75-53`)

Compose · Message · Payload as three columns above `lg`, tabs below. Outer panes drag;
the message pane takes what is left and holds the only lit surface (`bg-elevated` stage
on a `bg-well` ground) so the message reads as figure against ground. A Desktop / Mobile
toggle sets the stage width. Figma frames it at 1920 with a 88px top bar and panes of
327 / 736 / 777.

## Components

### `libs/ui-kit` — primitives (shadcn on Radix)

accordion, alert, alert-dialog, avatar, badge, breadcrumb, button, card, checkbox,
command, context-menu, dialog, dropdown-menu, input, label, pagination, popover,
scroll-area, select, separator, sheet, skeleton, switch, table, tabs, textarea, toast,
tooltip. Shared by desktop-web, web and admin. `Button` variants: default (lime),
destructive, outline, secondary, ghost, link; sizes default 36px, sm 32, lg 40, icon 36.

Every lib that ships markup is named by path in the app's Tailwind `content`, because
the nx glob helper returns nothing under plain `vite build` (see the project CLAUDE.md).

### `libs/web-ui-kit` — mobile system, three layers

resources (tokens, `Icon*` aliases, brand assets) → foundations (Button family, Badge
family, TextField / SearchInput / MessageInput, MessageBubble, avatars, toast) →
composites (AppHeader, ChatRoomHeader, ModalTopBar, BottomSheet, AlertDialog,
ListSection, ListRow, FloatingTabBar, MessageRow, DateDivider, EmptyState). Stateless,
slot based, i18n-agnostic, tokens only. Button system is `solid | outline | ghost` ×
`green | black | gray`, full pill, 50px tall at md / lg. Details in the lib README.

### `libs/block-kit` — the message renderer

`BlockKitMessage` plus `messageClasses.ts`: bold, inline code on `bg-well`, code block
with hairline border, quote with a lime left rule, mention `bg-primary/10
text-primary-ink`, self-mention `bg-warning/30`. The desktop composer imports these same
classes so what you type is what readers see.

### Desktop shared shapes

- `HEADER_ICON_BUTTON`: 36px square, hairline border, `hover:bg-accent`.
- `SIDEBAR_ACTION_ROW`: full-width 14px row, `text-label`, hover to foreground.
- `ResizablePanel` + `PanelResizeHandle`: keyboard-resizable, `aria-valuemin/max`.
- `Skeleton` / `AppShellSkeleton`: boot placeholder mirroring the real shell.
- `ConnectionBanner`, `UpdateBanner`, `Hint`, `ProfileCard` popover (256px).

## Icons

`lucide-react` everywhere, 16px in rows and chips, 18px in header buttons, 24px in
mobile navigation. `libs/web-ui-kit` components do not import lucide directly; they use
the `Icon*` aliases in `resources/icons`, which also hold the custom duotone glyphs
(thread, pin, gallery-add, tier icons) and the DoU brand mark. Figma draws the rail
icons from a bold "Solar" style set; in code they are the lucide equivalents.

## Motion and interaction

- **Focus**: `.focus-ring` on every interactive element — a 2px background gap then a
  4px `primary/60` ring, visible only on `:focus-visible`.
- **Press**: `.tactile` scales to 0.97 over 140ms with `ease-tactile`
  (`cubic-bezier(0.16, 1, 0.3, 1)`). Transform only, no layout.
- **Transitions**: colour changes use `transition-colors ease-tactile`. Panels animate
  width with `duration-200`.
- **Keyframes**: slide-in / slide-out (300ms), fade (200ms), `cloud-bounce` (600ms) for
  the rail tile on switch. `tailwindcss-animate` for Radix enter / exit.
- **Reduced motion**: a global `prefers-reduced-motion: reduce` block collapses every
  animation and transition to 0.01ms. Nothing is gated on a transition finishing.
- Targets: 36px minimum, 40px for primary controls.

## State vocabulary

| State                 | Desktop                                                                       | Mobile web                                                                     |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Unread channel        | 18px pink pill with the count, or an 8px pink dot when only presence is known | `#F41F52` badge on the Chat tab (ADR-0011), `--point-pink` count pill in lists |
| Unread in a rail tile | 8px lime dot with a `ring-sidebar` cutout                                     | —                                                                              |
| Favorite              | orange filled star, trailing                                                  | —                                                                              |
| Draft                 | muted glyph trailing the name                                                 | —                                                                              |
| Mine vs theirs        | same row shape, author resolved from profile                                  | navy bubble right / gray bubble left                                           |
| Sending / failed      | row at 50% opacity, then `text-destructive` caption with retry                | spinner, then red alert icon with retry                                        |
| Connecting            | amber pill in the header with a pulsing dot                                   | —                                                                              |
| Empty                 | 56px `bg-primary/10` glyph tile, heading, caption, one action                 | `EmptyState` composite                                                         |
| Loading               | `Skeleton` rows matching the final layout                                     | `RoomSkeleton`                                                                 |

Unread is derived client-side, never read from the server's lagging count (rule in the
project CLAUDE.md). Optimistic writes render at once; nothing flashes a stale value.

## Theme

- Light is the default on every surface. Dark is the `.dark` class on `html`.
- Desktop and builder switch through `libs/theme` (`ThemeProvider`, `useTheme`).
  `apps/web` reads `usePreferenceStore` and syncs the native shell (ADR-0054); its shell
  pins `colorScheme: light` on the layout root.
- Every token is defined in both blocks. A colour that exists only in one theme is a bug.
- Toasts invert: dark card on light theme, light card on dark theme.

## Do / Don't

**Do**

- Reach for the semantic token first (`text-muted-foreground`, `bg-well`,
  `border-hairline`); reach for the fixed-size utility only where the Figma spec fixes
  a pixel value, and cite the node in a comment.
- Put a new colour in `styles.css` (both themes) and `tailwind.config.js` in the same
  commit, and in `web-ui-kit/tokens.css` too if `apps/web` will read it.
- Give a new control `focus-ring tactile` and a 36px target.
- Render message bodies through `libs/block-kit`; extend `messageClasses.ts` rather than
  restyling in the app.
- Add a Storybook story and test beside any new `libs/web-ui-kit` component.

**Don't**

- Use lime as text on a light surface without `primary-ink`.
- Add a second accent hue, a gradient, a glow, or a decorative shadow.
- Hardcode a gray, a hex, or a rail / sidebar width outside the token.
- Nest a card in a card. Separate with a hairline or spacing instead.
- Read a Figma value into `apps/desktop-web` by copying from `apps/web`; the two scales
  differ on purpose (15px vs 16px body, 0.5rem vs 0.75rem radius).

## File index

| Concern                             | Path                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand, principles, a11y commitments | `PRODUCT.md`                                                                                                                                                                                      |
| Desktop tokens                      | `apps/desktop-web/src/styles.css`, `apps/desktop-web/tailwind.config.js`                                                                                                                          |
| Desktop shell                       | `apps/desktop-web/src/app/features/chat/components/DesktopLayout.tsx`, `CloudRail.tsx`, `PlaceRail.tsx`, `SidebarHeader.tsx`, `ChannelList.tsx`, `ChatPane.tsx`, `MessageRow.tsx`, `Composer.tsx` |
| Desktop shared styles               | `apps/desktop-web/src/app/features/chat/components/{sidebarStyles,headerStyles}.ts`, `apps/desktop-web/src/app/shared/components/`                                                                |
| Mobile tokens                       | `apps/web/src/styles.css`, `apps/web/tailwind.config.js`, `libs/web-ui-kit/src/resources/styles/tokens.css`                                                                                       |
| Mobile shell                        | `apps/web/src/app/ui/layouts/UnifiedLayout.tsx`, `apps/web/src/app/ui/components/{PageHeader,BottomNavigation}.tsx`                                                                               |
| Mobile kit                          | `libs/web-ui-kit/README.md`                                                                                                                                                                       |
| Builder                             | `apps/block-kit-builder/src/{styles,syntax}.css`, `apps/block-kit-builder/src/app/layout/BuilderLayout.tsx`                                                                                       |
| Primitives                          | `libs/ui-kit/src/components/ui/`                                                                                                                                                                  |
| Message renderer                    | `libs/block-kit/src/{BlockKitMessage.tsx,messageClasses.ts}`                                                                                                                                      |
| Theme switch                        | `libs/theme/src/`, ADR-0054                                                                                                                                                                       |
| Layout decisions                    | `docs/adr/0011-*.md` (mobile shell), `0014` / `0021` / `0023` / `0024` (Figma refinements), `0083-desktop-favorites-*`                                                                            |
