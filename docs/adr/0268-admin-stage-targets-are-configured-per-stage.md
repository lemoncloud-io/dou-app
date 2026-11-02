# ADR-0268: Admin console stage targets are configured per stage, never derived

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/admin-stage-endpoints`
> · Scope: `apps/admin-v2/src/app/config/stageEndpoints.ts`, the stage toggles of the memberships,
> cloud-deployments, report-logs and socket-lab features, `.github/workflows/deploy-*.yml`,
> `.github/workflows/force-deploy.yml`

## Context

The operator console lets an operator switch between the dev (`d1`) and production (`v1`) stage at
run time on four screens: memberships, cloud deployments, the log console and the socket lab's
Observe tab. One build therefore talks to both stages.

None of those screens had a key of its own for the other stage. Each rebuilt it from a key the
session already had, by swapping a path segment on the same host: `VITE_DOU_ENDPOINT`'s `dou-d1`
became `dou-v1` for the relay and `cgs-v1` for the goods service, `VITE_ARCHIVE_ENDPOINT`'s `arc-XX`
was swapped, the socket lab stripped `/d1` off `VITE_BACKEND_ENDPOINT` and appended `skt-XX`, and the
Observe tab replaced `cht-d1` in `VITE_WS_ENDPOINT`. The goods doc chose this on purpose — "no new
env key, nothing to add to every operator's `.env`" — and named the condition under which it would
stop holding: a service moving to another host.

That condition arrived for every service at once. The server moved the dev stage to a new domain
while production stayed on the old one. From then on, a URL rebuilt from the dev endpoint names
production paths on the dev host, a server that does not serve them, and the reverse. The socket
lab's `/d1` strip had already been wrong for any build whose backend endpoint was production.

## Decision

1. **Every stage of every service the toggles reach has its own env key**:
   `VITE_<STAGE>_<SERVICE>_ENDPOINT` for the relay, goods, archive, presence and socket services on
   `D1` and `V1` — ten keys, read through one module.
2. **Nothing is derived from another key.** An unset key leaves that stage unconfigured: the screen
   shows "(not configured)" and calls nothing, and a call that would otherwise fall back somewhere
   throws with the missing key's name. In particular, an unset key for the other stage never lets a
   memberships call fall through to the session's own relay.
3. **The values are the same in every build.** They describe where each stage lives, which does not
   depend on which stage the build's session signs in to. The deploy secrets that feed them carry no
   DEV/PROD part (`ADMIN_D1_RELAY_ENDPOINT`, not `ADMIN_DEV_D1_…`).

The memberships console still sends no override for the session's own stage, so the http client's
deep-link and `window.DOU_ENDPOINT` overrides keep applying there. The refund keeps its own guard: it
fires only when the endpoint's own `dou-XX` segment names the stage selected.

## Consequences

- **Ten more keys** in each `.env` of the app and ten more Actions secrets. That is the cost the
  derived rule avoided; it now buys the ability to move any one stage of any one service on its own.
- **A screen whose keys are missing stops working loudly** instead of calling a made-up address. A
  build deployed before its secrets are added shows "(not configured)" on the other stage.
- **The runtime keys are unchanged.** `VITE_DOU_ENDPOINT`, `VITE_WS_ENDPOINT` and the rest still
  configure the signed-in session; the new keys only serve the stage toggles.
