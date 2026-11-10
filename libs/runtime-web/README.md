# @chatic/runtime-web

**The web adapter: what fills the runtime's ports in a web page.** The browser and the desktop shell
run the session, the sockets, sync and the data layer in the page. This package will hold the pieces
that are true of a page and of nothing else — the page's stores, its `navigator.onLine`, a
socket opened by the page — and hand them to the runtime as a
[`RuntimePorts`](../runtime-core/README.md).

It is empty today. The web's choices still live where they always have — the defaults in
`@chatic/session` and `@chatic/app-runtime` — and move here one port at a time, each with the step that
turns its wiring into a port. Nothing imports this package yet.

## Rules

- Tagged `layer:adapter` and `platform:web`: it may not import `@chatic/app-runtime` (the React
  surface), React, or React Native. See [the layers](../runtime-core/README.md#layers).
- Nothing in the runtime imports it. An app's entry point does, and passes what it builds into the
  assembly.
