# In-app check in the virtual shell

The virtual shell runs the web inside the app's bridge, boot globals and push/link routing, in one browser
tab, with no simulator. What is imitated and what is not: [`apps/shell-adapter/README.md`](../../../../../apps/shell-adapter/README.md).

## Run

1. `yarn local` (dev; it does not return — run it in the background). Open `http://localhost:5007/__shell/`.
2. Wait for `window.virtualShell.status().handshake === 'ready'`. Skip the onboarding once.
3. Take a log cursor before acting: `const mark = s.logs().at(-1)?.seq ?? 0`. Every `waitFor` after a relaunch
   (`app.restart()`, a platform change, a cold `push.tap` / `deeplink`) takes `since`.
4. Prefer a scenario file: `await s.scenario.run('/__shell/scenarios/<file>.yaml', { vars })`, or
   `npx hybrid-shell run apps/shell-adapter/scenarios/<file>.yaml`. One-off checks drive the tools
   (`push.tap`, `deeplink`, `app.background`, `net.offline`, `device.set`) and read `status().path`, the frame
   and `s.logs({ since: mark })`. Keep a useful one with `s.logs.toScenario({ since: mark, name })`.

## Rules

- prod only when the person asked for prod in this task (`yarn local --env prod`, writes forbidden); never press
  the shell's DEV | PROD switch.
- Never pick an account or type a password. Ask the person to sign in once in that browser tab.
- A situation made only with raw bridge events is not a pass; repeat it with the tools.

## Classify before calling it a defect

| Symptom                                                 | Usually                         | Defect?                       |
| ------------------------------------------------------- | ------------------------------- | ----------------------------- |
| CORS error with 401/403                                 | call made before sign-in        | no; sign in and re-check      |
| CORS error with 200 or failed `OPTIONS`                 | API refuses the shell origin    | yes (proxy or API allow list) |
| handshake stays `pending`, `handshakeLate: true`        | CSP blocks injection            | shell side                    |
| `unsupported in virtual shell` / `no answer` for method | outside the imitation           | no; adapter item              |
| permission denied yet the action works                  | web used a browser API          | no                            |
| event sent, screen unchanged                            | cold-start queue or no listener | only if the app takes it      |

Report: what was checked here (with `status().env`), what is not checkable here (every `unsupported` the run
touched), and `s.logs.export({ format: 'md', since: mark })`. Stop the server if you started it.
