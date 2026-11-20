# ADR-0361: The backend's addresses live in one env file per stage

> Status: Accepted · Decided: 2026-11-20 · Implemented: `feat/env-per-backend`
> · Scope: the repository root's env files, `hybrid-shell.config.ts`, `scripts/check-env.js` and
> `scripts/env-keys.js`, `scripts/finish-deploy-env.js` and the deploy workflows, landing's build
> configurations, the desktop-web end-to-end suite's dev server
> · The behaviour is documented in [ONBOARDING.md](../../ONBOARDING.md) (Env and Firebase files) and
> [apps/shell-adapter](../../apps/shell-adapter/README.md) (A backend on this machine)

## Context

Every app keeps its own `apps/<app>/.env`, `.env.dev` and `.env.prod`, and each repeats the same backend
addresses: the OAuth, relay, socket and archive endpoints, the project, the stage. Five apps by three files
hold about ten such keys each. The deploy does not work this way: it writes web, landing and desktop-web
from one set of secrets per stage (`WEB_<STAGE>_*`) and admin from its own. Only the local copies are
per app, and they had already drifted — a key the deploy writes was missing from one app, and one app's
prod file named another project. `yarn check:env` was added to make that visible; it does not stop the
copies from multiplying. The virtual shell's localhost backend made the cost plain: running it against a
server on this machine meant writing a localhost file into every app.

## Decision

### 1. One shared file per stage, at the repository root

The web group's backend keys (the list in `scripts/env-keys.js`) live in root files, one per way of
running the apps:

| File             | Read by                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `.env.dev`       | `nx build --configuration=dev` of any app; the virtual shell on dev   |
| `.env.prod`      | `nx build --configuration=prod` of any app; the virtual shell on prod |
| `.env.serve`     | `nx serve` of any app — the backend a dev server talks to             |
| `.env.localhost` | the virtual shell on localhost                                        |

An app's own files keep only what is that app's: its debug code, the session switches, a key only it
reads.

### 2. Nx's own load order is the mechanism

Nx loads a task's env files before it runs the task, the project's first and the workspace root's after,
and a key already set is not replaced. So an app's own file wins over the shared one, and a root
`.env.<configuration>` fills in every key the app's files leave out. No loader is written for it, and the
apps' Vite configs do not change. The two things that start Vite without Nx follow the same order by
hand: the virtual shell lists the root file first in `web.envFiles`, where later files win, and the
desktop-web end-to-end suite hands its dev server the keys of `.env.serve` that `apps/desktop-web/.env`
leaves out.

The order only holds for a configuration Nx knows. landing's build had none, so `--configuration=dev`
and `--configuration=prod` both built from `apps/landing/.env` alone and its stage files were never
read; it now declares `dev` and `prod` like the other apps.

A root `.env` is not used: Nx loads it for every task, tests included, and the backend's addresses have
no business in a unit test's environment.

### 3. The phone app and admin keep their own copies

React Native's config plugin reads one file per build, so `apps/mobile/.env.<stage>` keeps its backend
keys; `yarn check:env` holds them to the shared file. Admin is deployed from its own secrets and signs in
to servers of its own choosing per stage, so its files keep every key; Nx still loads the root file under
them, which only fills a key admin does not set.

### 4. The deploy keeps writing its own file, held to the same list

The deploy writes each app's complete `apps/<app>/.env` from its secrets, and an app's file wins over the
root's, which the deploy never writes. The file it writes is held to the same key list:
`scripts/finish-deploy-env.js` drops the lines whose secret is empty and stops the job when a backend key
the app carries is missing or `VITE_ENV` is not the stage being deployed — before, a missing secret
vanished with the empty lines and the app was built without that server's address. The secrets stay named
in the workflows, because GitHub hands a step only the secrets its expressions name.

## Consequences

- One edit moves every web-group app to another backend. A localhost run changes its endpoints in one
  root file; the web's and the phone app's localhost files are plain copies of their dev ones.
- A local `landing:build:prod` now builds against the prod backend in `apps/landing/.env.prod`; before,
  it used whatever `apps/landing/.env` named. The deploy is unaffected: it writes `apps/landing/.env`
  for the stage it deploys, and no stage file exists there.
- The migration is the secrets repository's, in two moves: add the root files, then delete the backend keys
  from the web, landing and desktop-web files. Until the second move the apps' own keys still win, so this
  change can land first and nothing reads differently.
- A backend key left in an app's `.env` wins over the shared file in every stage, because Nx loads the
  app's `.env` as the fallback for every configuration before any root file. `yarn check:env` fails on
  one that differs from the shared value.
- desktop-web's local `.env` pointed at prod; once its keys move out, `nx serve desktop-web` talks to the
  backend in `.env.serve` like every other app.
- A root file Nx reads applies to any project run with that configuration. A project that needs another
  backend has to set every key itself, as admin does.

## Alternatives

- **A loader in each Vite config that reads the shared file.** Four copies of the same code, and every
  tool that starts Vite another way (the virtual shell, a test harness) would need it too. Nx already does
  the loading.
- **Generate each app's files from one source.** The copies would come back as generated files that
  someone edits by hand; the drift `check:env` found is exactly that.
- **Move the phone app onto the shared file now.** It needs a merge step in front of React Native's
  config plugin on both platforms' builds; left for when the deploy's env is reworked.
