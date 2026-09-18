# login

**The one screen that performs an explicit sign-in.** Everywhere else, session state changes on its
own — guest keepalive on boot, cloud switch from chat home, logout from
[settings](./README.md). This is the exception: a user typing an email and password to replace or
promote the current session. Screen code: `apps/testbed/src/app/pages/LoginPage.tsx`, route
`/auth/login`, outside the app shell (no bottom nav).

## Behavior

- A standalone route, not reachable from guest boot itself — the app never routes here on its own.
- On success, navigates to chat home (or back to wherever the user came from).
- Rejects a second submit while one is in flight; on failure, keeps the entered values and shows the
  error inline rather than clearing the form.

Built entirely on `app-runtime`'s email-login hook and session-state hooks — no page-local session
logic.

## Verifying

- After a successful login, the session summary on [settings](./README.md) and the session panel in
  [overlay/](../overlay/README.md) should agree on the new state.

## Related

- [README.md](./README.md) — settings and session actions
- [invite.md](./invite.md) — accepting an invite requires a guest session first
