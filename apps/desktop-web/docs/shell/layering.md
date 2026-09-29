# Layering

One stacking scale, in `tailwind.config.js` (`theme.extend.zIndex`). Components use these names, not
numeric `z-*`. ui-kit's dialogs, menus and toasts sit at 50 and above, so everything here stays at 50
or below.

| Class       | Value | For                                                                                                                      |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `z-raised`  | 10    | above its own row or pane: the message toolbar, a sticky date pill or section label, a resize handle, the docked sidebar |
| `z-float`   | 20    | over a pane's content: jump pills, the mention list, a scrim                                                             |
| `z-overlay` | 25    | over a whole pane: the file drop zone                                                                                    |
| `z-drawer`  | 30    | a panel or the sidebar drawer laid over its neighbour                                                                    |
| `z-popover` | 50    | fixed to the viewport, level with ui-kit's popovers                                                                      |

The literals used to be 1, 10, 20, 30 and 50 with no names, and the drop zone tied the thread panel
at 30.

The design side of layering (surfaces, shadows, scrims) is in the root `DESIGN.md`, under "Spacing,
radius, elevation".
