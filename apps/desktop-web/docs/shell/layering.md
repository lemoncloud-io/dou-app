# Layering

One stacking scale, in `tailwind.config.js` (`theme.extend.zIndex`). Components use these names, not
numeric `z-*`. ui-kit's dialogs and menus sit at 50, so everything here stays at 50 or below. That
includes toasts: the kit puts its toast viewport at 100, and `AppToaster` brings it down to
`z-toast`.

| Class       | Value | For                                                                                                                      |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `z-raised`  | 10    | above its own row or pane: the message toolbar, a sticky date pill or section label, a resize handle, the docked sidebar |
| `z-float`   | 20    | over a pane's content: jump pills, the mention list, a scrim                                                             |
| `z-overlay` | 25    | over a whole pane: the file drop zone                                                                                    |
| `z-drawer`  | 30    | a panel or the sidebar drawer laid over its neighbour                                                                    |
| `z-toast`   | 40    | the toast viewport: over every pane, under an open dialog (see below)                                                    |
| `z-popover` | 50    | fixed to the viewport, level with ui-kit's popovers                                                                      |

The literals used to be 1, 10, 20, 30 and 50 with no names, and the drop zone tied the thread panel
at 30.

Toasts sit under the modal layer on purpose. At the kit's 100 a "channel created" toast from the
previous step covered the title of the dialog opened next. Moving the toast aside does not help in a
short window, where a centred dialog fills the height, so an open dialog wins and the toast shows
dimmed behind its scrim. It is still announced by its live region.

The design side of layering (surfaces, shadows, scrims) is in the root `DESIGN.md`, under "Spacing,
radius, elevation".
