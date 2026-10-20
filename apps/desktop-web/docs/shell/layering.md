# Layering

One stacking scale, in `tailwind.config.js` (`theme.extend.zIndex`). Components use these names, not
numeric `z-*`. ui-kit's dialogs and menus sit at 50, so everything here stays at 50 or below, except
`z-alert`. That includes ordinary toasts: the kit puts its toast viewport at 100, and `AppToaster` brings it down to
`z-toast`.

| Class       | Value | For                                                                                                                      |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `z-raised`  | 10    | above its own row or pane: the message toolbar, a sticky date pill or section label, a resize handle, the docked sidebar |
| `z-float`   | 20    | over a pane's content: jump pills, the mention list, a scrim                                                             |
| `z-overlay` | 25    | over a whole pane: the file drop zone                                                                                    |
| `z-drawer`  | 30    | a panel or the sidebar drawer laid over its neighbour                                                                    |
| `z-toast`   | 40    | the toast viewport: over every pane, under an open dialog (see below)                                                    |
| `z-popover` | 50    | fixed to the viewport, level with ui-kit's popovers                                                                      |
| `z-alert`   | 60    | the toast viewport while an error toast shows: over an open dialog (see below)                                           |

The literals used to be 1, 10, 20, 30 and 50 with no names, and the drop zone tied the thread panel
at 30.

Toasts sit under the modal layer on purpose. At the kit's 100 a "channel created" toast from the
previous step covered the title of the dialog opened next. Moving the toast aside does not help in a
short window, where a centred dialog fills the height, so an open dialog wins and the toast shows
dimmed behind its scrim. It is still announced by its live region.

An error toast is the exception. It is most often the failure of the dialog in front of it — an
invite code the server refused, a rename it turned down — and under the scrim it could not be read,
so the server's own words in it (`400 INVALID - grace-timeout by invite[…]`) never reached the
person. While an error toast raised during the dialog shows, `AppToaster` raises the viewport to
`z-alert`. Radix's toast viewport is a dismissable-layer branch, so clicking the toast's close button
does not count as a click outside the dialog.

Only an error raised while the modal is open lifts (Radix disables pointer events on the body then,
which `AppToaster` reads when the toast first appears). An error toast from before the dialog stays
under the dim: Radix gives a layer older than the modal no pointer events, so lifted it would cover
the dialog's title with a close button that cannot be pressed. While the viewport is lifted, any
other toast in it rises too; that is accepted, since it lasts only as long as the error.

The design side of layering (surfaces, shadows, scrims) is in the root `DESIGN.md`, under "Spacing,
radius, elevation".
