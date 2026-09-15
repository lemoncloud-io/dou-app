# Mount the floating bottom navigation once in the web layout shell, and move the nav into web-ui-kit

> Status: Accepted · Decided: 2026-07-15

`apps/web`'s bottom navigation lives in `apps/web/src/app/ui/components/BottomNavigation.tsx`, and it
is rendered **separately by `HomePage` and `MyPage`** rather than by a shared shell. It is a small
centred pill, `w-[166px]`, with two tabs (Chat / My). MyPage draws its card menu with `apps/web`'s own
markup and uses no `libs/web-ui-kit` components. `libs/web-ui-kit` has no bottom navigation component
yet.

This round (1) redesigns the bottom navigation to match the reference Figma (node `1937-26448`) — a
floating bar that spans the full width — (2) moves it into `libs/web-ui-kit` as a pure UI component,
(3) mounts it exactly once in the shared shell (`UnifiedLayout`), which then owns visibility and the
active tab, and (4) rebuilds MyPage and the surrounding web shell on web-ui-kit.

## Decision

- **Move the navigation UI into `libs/web-ui-kit`.** Define a stateless, slot-based bottom navigation
  component under a new folder, `libs/web-ui-kit/src/composites/navigation/`, and export it from
  `composites/index.ts` and the top-level barrel. Follow the component-set convention (`*.tsx` +
  `*.test.tsx` + `*.stories.tsx`, a `*Props` export, `cn` plus semantic tokens plus `Icon*` aliases
  only). App logic — routing, active-tab detection, transition animation — stays out of web-ui-kit and
  belongs to a thin adapter on the `apps/web` side.

- **Mount it once, in the shared shell (`UnifiedLayout`).** Remove the individual
  `<BottomNavigation />` renders from `HomePage` and `MyPage`; the shell is the only thing that draws
  the nav. Adding pages then cannot duplicate or forget it.

- **Route-driven visibility.** The bottom nav shows **only on main tab destinations**: `/` (Chat) and
  `/mypage` (My). It hides on every detail, edit, chat room and settings screen below them. The active
  tab derives from the current path — exact match at the root, prefix match otherwise.

- **Keep the two tabs.** Chat (`/`) and My (`/mypage`). Neither the number nor the kind changes here.

- **Take the shape from Figma.** The nav is a **full-width floating area** (a gradation layer behind
  it, 375×98) holding a **centred glass pill** (166×62, Blur + Fill + Glass Effect / Liquid Glass
  Frost). Inside the pill are the two tabs, Chat and MY (48×48 each, icon plus label), with an unread
  badge at the top right of the Chat tab (red `#F41F52`, rendered `+999`). The active tab is a dark
  pill (`#222325`), inactive is `#53555B`. Exact sizes, colours and spacing come from Figma and are
  applied in dev-2.

- **Scrolling and safe area.** When content grows, the page or shell body container scrolls
  (`overflow-y-auto overscroll-contain`) and the floating nav sits above it. The nav container stays
  click-through (`pointer-events` isolated), and its bottom inset uses the CSS variable the native
  shell injects, `--safe-bottom` (Tailwind `pb-safe-bottom` / `calc(var(--safe-bottom,0px) + …)`). The
  body reserves bottom padding the height of the nav so the last item is not covered.

- **Clean up MyPage and the web shell.** Rebuild MyPage's card menu and profile section out of
  web-ui-kit components (`ListSection`, `ListRow`, `ScreenLayout`, avatars, badges). Where a component
  is missing, define it in web-ui-kit first and then use it.

- **MyPage renders four states.** Against the reference Figma (nodes `1937-26448` / `26598` / `26749`
  / `27282`):
    1. Signed out (`27282`): **no** profile, my info, subscription, account management or sign-out. A
       "Sign in" header (subtitle: "Sign in and keep your conversations safe") plus the terms and app
       version card, nothing else. In the bottom nav, Chat is inactive and MY is active.
    2. Signed in, no subscription (`26448`): the subscription row reads "Manage subscription".
    3. Signed in, on the free plan (`26598`): "Free plan" plus a `D-N` badge.
    4. Signed in, subscribed (`26749`): "Subscribed".
       The avatar, name and email at the top show the **account** profile, not the cloud or site
       profile. The menu items Figma keeps hidden (place settings, self-chat settings, backup, the
       profile edit pencil, the account switch chevron) are out of scope here.

## Alternatives

- **Keep rendering per page**: each page renders `<BottomNavigation />` itself. Smallest change, but
  every new tab screen risks a duplicate or an omission, and the route-based hiding rule has to be
  repeated in each page. Rejected.

- **Leave the nav in `apps/web` and only restyle it**: match Figma without moving it into web-ui-kit.
  Rejected — it contradicts the "components come from web-ui-kit" requirement and the convention that
  separates pure UI from app logic.

- **Move the routing logic into web-ui-kit too**: the nav component owns `react-router` and active-tab
  detection itself. Rejected — it couples the library to app routing and breaks the stateless
  principle. The adapter split wins.

- **Always visible (never hidden)**: keep the nav on every screen. Rejected — it gets in the way on
  detail, edit and chat room screens, and it contradicts the reference design.

## Consequences

- The shell becomes the nav's single owner, so visibility and active-tab rules live in one place
  (`UnifiedLayout`). A new tab screen needs no nav code of its own.
- The hardcoded padding `HomePage` and `MyPage` used to clear the nav (`pb-32` and friends) has to be
  reworked against the shell. Bottom spacing and scroll handling change on both pages.
- `apps/web`'s existing `BottomNavigation.tsx` is removed and replaced by the web-ui-kit component plus
  a thin adapter — replaced, not deprecated.
- web-ui-kit gains the nav component, and any missing component it needs, so the storybook and test
  surface grows.
- The visual spec depends on Figma. Screenshots, structure and colour tokens for the reference nodes
  (`1937-26448` / `26598` / `26749` / `27282`) are captured, so dev-2 can match it pixel for pixel.
- MyPage branches four ways on auth and subscription state, so the dev-2 spec has to settle which hook
  or store each signal comes from (signed in or not, subscription state, free-trial days remaining
  `D-N`).
