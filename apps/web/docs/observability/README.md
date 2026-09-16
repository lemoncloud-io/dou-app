# observability — looking into a running app

Two ways to find out what a build is actually doing: read what it recorded, or open the panel and
ask it. Both cross the whole app — any feature can log, and the debug panel reaches every platform
capability — so neither belongs to a feature.

A document belongs here if it is about inspecting the app rather than being part of it. The debug
panel's own screens, its unlock gate and its catalog are a feature and are documented as one in
[`../feature/debug/`](../feature/debug/README.md); this category covers the boundary around it.

| Document | Owns |
| --- | --- |
| [logging.md](./logging.md) | How this app wires `@chatic/logger` — boot order, the upload queue, and global error detection |
| [debug-panel.md](./debug-panel.md) | What the panel may ask the native shell to do, and what stays on each side of the bridge |

The web is the only debug surface in the product: `apps/mobile` renders no debug screen of its own
and only answers the commands this panel sends.
