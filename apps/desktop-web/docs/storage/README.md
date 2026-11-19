# Where desktop-web keeps its state

Everything this app keeps between loads goes through a store from `@chatic/storage`; no feature names
`localStorage` or `sessionStorage` itself, and the root ESLint config refuses it — along with a zustand
`persist` given no `storage`, which would fall back to `localStorage` directly.

## Who decides

`src/config/adapters/stores.ts` calls `resolveStorageStores()` (`@chatic/runtime-web`) once, as
`desktopStores`, and that one set is handed out:

| To                  | What                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the session         | `secret` — the shell's `safeStorage` vault when it says it keeps one, else `localStorage` in the shell, `sessionStorage` in a browser tab; `plain` — `localStorage` in the shell, `sessionStorage` in a browser tab |
| `@chatic/config`    | its `local`/`session` ports, through `createWebConfigPorts(desktopStores)`                                                                                                                                          |
| the runtime         | `device` for the sync cursor watermark, the raw `webSession` for a window's invited-cloud cache                                                                                                                     |
| this app's features | `deviceStore`, `tabStore` and `plainStore` from `src/app/storage/`, pointed at the set by `main.tsx`                                                                                                                |

The runtime takes its share through the page's runtime declaration (`src/config/desktop-web.ts`): its
`storage.desktop` adapter hands the session the set's `secret`, `plain` and `device` — loading the vault
first when there is one — and `cache.desktop-web-storage` keeps the invited-cloud rows in its
`webSession`. They are the app's own adapters, not `@chatic/runtime-web`'s `storage.*` and
`cache.web-storage`, because those build store objects of their own: where site data is blocked every
store is page memory, and a second set would hide the session from the features and from config. Every
port is fixed to that one adapter, so a `port.*` setting cannot move the session elsewhere.

`deviceStore` and `tabStore` are the same in the shell and in a browser tab; `plainStore` is the
session's `plain` and follows it.

## The features' three stores

- **`deviceStore`** — outlives the window (`localStorage`): panel widths, the sidebar sections,
  reading and notification preferences, the mention inbox, my threads, saved items, the last and the
  selected channel, joined and known clouds and which account their records belong to, push badges, recent emoji, the welcome and per-account
  onboarding marks, each cloud's mini app links and their per-account consent, the language, the theme (`ThemeProvider`'s `storage`), the debug switch and the
  debug sync baseline.
- **`tabStore`** — dies with the window (`sessionStorage`): the debug overlay toggle, the
  socket-wedge reload stamp, the sign-in hand-off mark.
- **`plainStore`** — the session's `plain`: `localStorage` in the shell, `sessionStorage` in a browser
  tab. For what travels with a sign-in: the Google sign-in start a relaunch from the deeplink must find,
  the nonces it already used, and the sign-in notice the signed-in window shows once.

`deviceStore` and `tabStore` are tolerant: a full or blocked storage costs the value, not the screen.
`plainStore` is not, like the session port it stands for. All three are switchable, so a zustand store
or the i18n module created at import time still writes where `main.tsx` pointed them.
Key names did not change when the app moved onto them, so nothing stored before was lost.

## Adding state

Pick `deviceStore` or `tabStore` — `plainStore` only for state that belongs with a sign-in — and
import it from `src/app/storage`. For a zustand store, pass
`storage: persistStorageOver(deviceStore)`. A value that is a setting belongs in `@chatic/config`
instead; a value an account should not leave behind on sign-out needs its key added to
`useAccountResetOnLogout`'s list.
