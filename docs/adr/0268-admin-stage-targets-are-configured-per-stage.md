# ADR-0268: Admin console stage targets are configured per stage, never derived

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/admin-stage-endpoints`
> · Scope: `apps/admin/src/app/config/stageEndpoints.ts`, the stage toggles of the memberships,
> cloud-deployments, report-logs and socket-lab features, `.github/workflows/deploy-*.yml`,
> `.github/workflows/force-deploy.yml`
> · Amended: 2026-11-02 — sign-in is production in every build, and the toggles open on the build's
> stage (decision 4)

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
   depend on which stage the build's session signs in to. In the deploy workflows, the relay, archive
   and socket of each stage are the web app's own servers, so they read the web app's secrets
   (`WEB_DEV_DOU_ENDPOINT` for the `d1` relay, `WEB_PROD_WS_ENDPOINT` for the `v1` socket, …). Goods
   and presence, which the web app does not call, have secrets of their own with no DEV/PROD part
   (`ADMIN_D1_GOODS_ENDPOINT`, not `ADMIN_DEV_D1_…`).

4. **Sign-in is production in every build; the toggles open on the build's stage.** The admin
   accounts live on `v1`, so the runtime keys name `v1` in development builds too. Which stage a
   screen opens on is a separate question, answered by the build: `v1` for a production build, `d1`
   for any other. Deriving it from the session would open a development build on production, and an
   operator's first write would land there.

The memberships console still sends no override for the session's own stage, so the http client's
deep-link and `window.DOU_ENDPOINT` overrides keep applying there. The refund keeps its own guard: it
fires only when the endpoint's own `dou-XX` segment names the stage selected.

## Consequences

- **Ten more keys** in each `.env` of the app, but only four more Actions secrets. The repository is
  near GitHub's 100-secret limit, and a secret per key would have reached it. The keys are the cost
  the derived rule avoided; they buy the ability to move any one stage of any one service on its own.
- **The admin console follows the web app's stage addresses.** When the web app's dev or production
  relay, archive or socket secret changes, the admin build picks it up on its next deploy; goods and
  presence still have to be changed on their own.
- **A screen whose keys are missing stops working loudly** instead of calling a made-up address. A
  build deployed before its secrets are added shows "(not configured)" on the other stage.
- **The runtime keys are unchanged.** `VITE_DOU_ENDPOINT`, `VITE_WS_ENDPOINT` and the rest still
  configure the signed-in session; the new keys only serve the stage toggles.
