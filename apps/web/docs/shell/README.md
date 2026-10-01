# shell — the frame every screen is rendered into

Four things wrap every route and belong to no feature: the chrome a page is drawn inside, the table
that decides which page that is, the theme both are painted with, and the cover that hides them until
the first one is ready. Changing any of them changes
every screen at once, which is why they are documented here rather than in a feature.

A document belongs here if it is about the frame rather than the content. What fills the frame is
[`../feature/`](../feature/); what supplies the frame's data is [`../state/`](../state/README.md).

| Document                             | Owns                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [layout-shell.md](./layout-shell.md) | `UnifiedLayout`, the floating bottom nav, trailing clearance, and the `--app-width` cap                                                                                                 |
| [routing.md](./routing.md)           | The authenticated/unauthenticated route tables and the `ROUTES` builder — the one source of absolute paths — and `app/navigation/`, which owns the history stack and the back judgement |
| [theme.md](./theme.md)               | Theme state, its DOM application, and the web half of the native sync                                                                                                                   |
| [boot-cover.md](./boot-cover.md)     | The `index.html` cover over the page until the first screen paints, and the signal that lifts the app's launch splash                                                                   |

The value model behind `theme.md` is not the web's: the contract, the default and the storage format
belong to `apps/mobile/docs/system/theme.md`, and this app implements the web side of it.
