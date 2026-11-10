# @chatic/runtime-web

**The web adapter: what fills the runtime's ports in a web page.** The browser and the desktop shell
run the session, the sockets, sync and the data layer in the page. This package will hold the pieces
that are true of a page and of nothing else — the page's storage media, its `navigator.onLine`, a
socket opened by the page — and hand them to the runtime as a
[`RuntimePorts`](../runtime-core/README.md).

It is empty today. Each web app already chooses its storage media in one place of its own (apps/web
and apps/desktop-web through `resolveStorageMedia()`, admin and the landing site in their own media
module), and the session has no default left to move. The runtime's own device/tab defaults in
`@chatic/app-runtime`, and the sockets', HTTP's and device signals' browser answers, move here one port
at a time, each with the step that turns its wiring into a port. Nothing imports this package yet.

## Rules

- Tagged `layer:adapter` and `platform:web`: it may not import `@chatic/app-runtime` (the React
  surface), React, or React Native. See [the layers](../runtime-core/README.md#layers).
- Nothing in the runtime imports it. An app's entry point does, and passes what it builds into the
  assembly.
