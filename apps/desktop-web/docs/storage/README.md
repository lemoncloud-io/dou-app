# Where desktop-web keeps its state

Everything this app keeps between loads goes through a medium from `@chatic/storage`; no feature names
`localStorage` or `sessionStorage` itself, and the root ESLint config refuses it — along with a zustand
`persist` given no `storage`, which would fall back to `localStorage` directly.

## Who decides

`main.tsx` calls `runtime.boot.resolveStorageMedia()` once and hands the result out:

| To                  | What                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the session         | `secret` — the shell's `safeStorage` vault when it says it keeps one, else `localStorage` in the shell, `sessionStorage` in a browser tab; `plain` — `localStorage` in the shell, `sessionStorage` in a browser tab |
| `@chatic/config`    | its `local`/`session` ports, through `createWebConfigPorts(media)`                                                                                                                                                  |
| the runtime         | `device` for the sync cursor watermark, the raw `webSession` for a window's invited-cloud cache                                                                                                                     |
| this app's features | `deviceMedium` and `tabMedium` from `src/app/storage/`                                                                                                                                                              |

The features' media are the same in the shell and in a browser tab.

## The features' two media

- **`deviceMedium`** — outlives the window (`localStorage`): panel widths, the sidebar sections,
  reading and notification preferences, the mention inbox, my threads, saved items, the last and the
  selected channel, joined and known clouds and which account their records belong to, push badges, recent emoji, the welcome and per-account
  onboarding marks, each cloud's mini app links and their per-account consent, the language, the theme (`ThemeProvider`'s `storage`), the debug switch and the
  debug sync baseline.
- **`tabMedium`** — dies with the window (`sessionStorage`): the debug overlay toggle, the
  socket-wedge reload stamp, the sign-in hand-off mark.

Both are tolerant: a full or blocked storage costs the value, not the screen. Both are switchable, so
a zustand store or the i18n module created at import time still writes where `main.tsx` pointed them.
Key names did not change when the app moved onto them, so nothing stored before was lost.

## Adding state

Pick `deviceMedium` or `tabMedium` and import it from `src/app/storage`. For a zustand store, pass
`storage: persistStorageOver(deviceMedium)`. A value that is a setting belongs in `@chatic/config`
instead; a value an account should not leave behind on sign-out needs its key added to
`useAccountResetOnLogout`'s list.
