# shell — the frame every screen is rendered into

The things here wrap every route and belong to no feature: the chrome a page is drawn inside, the
table that decides which page that is, the theme both are painted with, the cover that hides them
until the first one is ready, and the keyboard rules every text field follows. Changing any of them
changes every screen at once, which is why they are documented here rather than in a feature.

A document belongs here if it is about the frame rather than the content. What fills the frame is
[`../feature/`](../feature/); what supplies the frame's data is [`../state/`](../state/README.md).

| Document                                                 | Owns                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [layout-shell.md](./layout-shell.md)                     | `UnifiedLayout`, the floating bottom nav, trailing clearance, docked footers over the inset and the keyboard, snackbar clearance (`--toast-lift`), the chat composer's bottom inset over the keyboard and the attach panel, and the `--app-width` cap |
| [routing.md](./routing.md)                               | The authenticated/unauthenticated route tables and the `ROUTES` builder — the one source of absolute paths — and `app/navigation/`, which owns the history stack and the back judgement                                                               |
| [page-transitions.md](./page-transitions.md)             | How one screen gives way to the next: the per-platform animation, the capture that waits for the destination, and which back animates on which platform                                                                                               |
| [theme.md](./theme.md)                                   | Theme state, its DOM application, and the web half of the native sync                                                                                                                                                                                 |
| [return-key.md](./return-key.md)                         | `useReturnKeyFlow`: what the soft keyboard's return key reads and does in every text field — next, done, search — and which fields it leaves alone                                                                                                    |
| [keyboard-dismiss.md](./keyboard-dismiss.md)             | `useDismissKeyboardOnTap`: a tap on empty space closes the soft keyboard on every screen, and what a tap may land on without closing it                                                                                                               |
| [boot-cover.md](./boot-cover.md)                         | The `index.html` cover over the page until the first screen paints, and the signal that lifts the app's launch splash                                                                                                                                 |
| [scroll-menus-and-back.md](./scroll-menus-and-back.md)   | Scroll restoration, scroll-driven header chrome, letting a menu leave before navigating, and the WebView back handler                                                                                                                                 |
| [history-stack-rules.md](./history-stack-rules.md)       | The feature graph, stack-policy entry rules, rewinds, depth, the tracker, and when a transition retires the push banner                                                                                                                               |
| [chrome-and-focus-notes.md](./chrome-and-focus-notes.md) | Who owns the notch inset, chrome measurement, the readable band on focus, keyboard detection, the foreground push card                                                                                                                                |

The value model behind `theme.md` is not the web's: the contract, the default and the storage format
belong to `apps/mobile/docs/system/theme.md`, and this app implements the web side of it.
