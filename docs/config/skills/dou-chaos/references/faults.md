# Fault primitives in web-e2e

The `chaos` fixture (`apps/web-e2e/src/support/chaos.ts`) records every fault in a timeline drawn in the
evidence report. Faults stack: delays add up, the first matching refusal, error, hang or drop decides.

| Fault                   | How                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Socket drop             | `await chaos.dropSocket({ downFor: 6_000 })`; a cloud's with `endpoint: CLOUD.wss`                     |
| Offline                 | `await chaos.offline()` … `await chaos.online()` (the page's link; the dev server stays up)            |
| Slow reply              | `const lift = chaos.latency(1_500, { socket: ['auth.switch'], endpoint })`; `lift()` ends it           |
| Server error on socket  | `chaos.failSocket('auth.switch', { endpoint, error: '503 SERVICE UNAVAILABLE - busy', times: 1 })`     |
| HTTP 5xx or hang        | `chaos.failHttp('GET /memberships/0/mine', { status: 503, times: 2 })`, or `{ hang: true, hangMs }`    |
| Expired or revoked auth | `await chaos.expireToken({ refreshFailures: 1 })`                                                      |
| Held reply              | wrap a handler: `backend.useSocket({ 'x.y': (d, f) => gate.then(() => original(d, f)) })`, `handlerOf` |
| Out-of-order replies    | hold reply A, let reply B through, then release A                                                      |
| Background and resume   | the steps in `src/support/app.ts` (the app's own lifecycle events)                                     |

Don't use `page.context().setOffline(true)`: in WebKit it also cuts the dev server and bypasses the socket
routes, so lazy modules fail and the page lands on its error screen.

Assertions that catch recovery bugs:

- `expect.poll(() => backend.sent('x').length).toBe(1)` — exactly once, not at least once.
- `backend.sent('x').every(f => f.connection > 1)` — it went out on the new connection.
- The UI state after recovery equals the UI state with no fault; `chaos.recovered(what)` marks it.
- Where the page may take either of two paths (retried or rolled back), assert the invariant both keep.
