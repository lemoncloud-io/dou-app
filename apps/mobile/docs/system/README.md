# system — OS-level state the shell shares with the web

Some state is not owned by either side alone: the OS hands it to the shell, and the web has to agree
with it on the same frame. This category owns **the contracts for that shared state** — the value
model, the default, the storage format, and the moment the two sides sync.

A document belongs here if the shell and the web must hold the *same* value at the *same* time, and
disagreement is visible to the user. Purely native capabilities live in
[../native/README.md](../native/README.md); the injection mechanics are in
[../webview/README.md](../webview/README.md).

| Document | Owns |
| --- | --- |
| [theme.md](./theme.md) | The web↔native theme contract — light default, storage format, and the boot-time sync |
| [deeplink.md](./deeplink.md) | Turning an inbound universal link, custom scheme, or push tap into one `OnNavigate` path |

Both fail the same way when they drift — a split screen, or a link that lands on the wrong route.
