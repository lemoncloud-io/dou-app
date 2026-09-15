# Desktop Shell builds are unsigned per-env; Windows is built in CI

The Desktop Shell (Electron, `apps/desktop`) is packaged as separate dev and prod installers. Each bakes the deployed Desktop Web URL at build time and is shipped **unsigned** for internal distribution. macOS installers are built locally; Windows installers are built on a GitHub Actions `windows-latest` runner because Windows NSIS targets cannot be cross-built from macOS without Wine.

The dev/prod split is the Shell's _only_ environment dimension: per ADR-0001 the Shell loads the Web remotely, so "which environment" reduces to "which Web URL is baked in". The URL is injected via electron-vite env files (`MAIN_VITE_DESKTOP_WEB_URL`, statically replaced into the main bundle) rather than read from `process.env` at runtime — a packaged app has no `process.env`, so the previous runtime read silently fell back to `localhost:5005`.

Three modes exist, mirroring `desktop-web`'s nx configurations: `development` (local `electron-vite dev`, no URL → localhost fallback), `dev` (packaged, deployed dev URL), `production` (packaged, deployed prod URL). Dev and prod installers carry distinct `appId`/`productName` (`io.chatic.desktop.dev` / "Chatic Dev") so both install side-by-side with separate userData.

## Considered Options

- **Signed + notarized, public distribution**: clean install, enables `electron-updater`. Rejected for now — needs an Apple Developer cert and a Windows EV cert (procurement + recurring cost) that do not yet exist, and the audience is internal testers who can dismiss a one-time Gatekeeper/SmartScreen warning.
- **Unsigned internal, manual artifact sharing** (chosen): zero signing setup. macOS `.dmg` opens via right-click→Open; Windows `.exe` past a SmartScreen warning. Installers shared by hand (CI artifact / drive).
- **Cross-build Windows from macOS**: rejected — NSIS needs Wine on macOS, fragile and slow; a `windows-latest` runner is the supported path.
- **Auto-update now**: rejected — `electron-updater` requires signed builds and a `publish` config. The call site (`main/index.ts`) stays as a no-op until signing lands.

## Consequences

- **The packaged URL is build-time, not runtime.** `main/index.ts` reads `import.meta.env.MAIN_VITE_DESKTOP_WEB_URL`; changing the target means rebuilding, not re-configuring. The local-dev fallback (`?? 'http://localhost:5005'`) is preserved so `desktop:dev` still drives the concurrent local Web server.
- **Distribution is manual.** No release channel, no auto-update. Going signed later is additive: add certs/secrets, `build.mac.notarize`, and `build.publish`, then flip the CI artifact step to a draft Release — no rewrite of the build wiring.
- **Windows builds are not reproducible on the dev machine.** Verifying a Windows-specific change requires a CI run (`workflow_dispatch`, dev/prod input), not a local build.
- **A blocking infra dependency is now explicit:** packaged shells load `desktop.dou-dev.chatic.io` / `desktop.dou.chatic.io`, which must exist (bucket + CloudFront + subdomain) and be targeted by `deploy-desktop-web.sh` (today it deploys under the Web bucket's `/dev`,`/prod` subpaths). Until then a packaged shell has nothing to load.
