# Fault primitives in web-e2e

| Fault                   | How                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Socket drop             | `await backend.dropSockets()`; the page reconnects as connection `n + 1`                                                              |
| Held reply              | wrap a handler: `backend.useSocket({ 'x.y': (d, f) => gate.then(() => original(d, f)) })`, with `original = backend.handlerOf('x.y')` |
| Slow reply              | the same wrapper with `new Promise(r => setTimeout(r, ms))`                                                                           |
| Server error on socket  | a handler that throws; the frame goes back as an error                                                                                |
| HTTP 5xx or delay       | `backend.useHttp(...)` returning the status, or `page.route(url, r => r.fulfill({ status: 503 }))`                                    |
| Offline                 | `await page.context().setOffline(true)` then `false`                                                                                  |
| Expired or revoked auth | answer `auth.update` with the error the server sends for an expired token                                                             |
| Background and resume   | the steps in `src/support/app.ts` (the app's own lifecycle events)                                                                    |
| Out-of-order replies    | hold reply A, let reply B through, then release A                                                                                     |

Assertions that catch recovery bugs:

- `expect.poll(() => backend.sent('x').length).toBe(1)` — exactly once, not at least once.
- `backend.sent('x').every(f => f.connection > 1)` — it went out on the new connection.
- The UI state after recovery equals the UI state with no fault.
