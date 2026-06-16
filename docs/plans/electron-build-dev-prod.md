# Plan — Electron desktop build (dev/prod, mac local + win CI)

Status: ready · Size: M (~6 files) · See ADR-0003 for the decisions behind this.

## Goal

Package `apps/desktop` as separate dev/prod installers. macOS built locally, Windows
built on GitHub Actions. Unsigned (internal). Each build bakes the deployed Desktop Web
URL at build time (fixes the packaged-prod-loads-localhost bug).

## Decisions (locked — see ADR-0003)

| #   | Decision          | Choice                                                                              |
| --- | ----------------- | ----------------------------------------------------------------------------------- |
| 1   | Signing           | Unsigned internal; signed = later additive step                                     |
| 2   | URL bake          | electron-vite env files + `MAIN_VITE_DESKTOP_WEB_URL`, `--mode`, localhost fallback |
| 3   | dev/prod identity | split `appId`+`productName` via electron-builder `-c.*`, keep single `chatic://`    |
| 4   | Windows CI        | `workflow_dispatch` (dev/prod input) on `windows-latest` → upload artifact          |
| 5   | Icons             | master = mobile iOS 1024 png; prod=DefaultIcon, dev=WhiteIcon; auto-gen icns/ico    |
| 6   | Auto-update       | parked (needs signing); code stays, no publish config                               |

Three modes mirror `desktop-web` nx configs: `development` (local → localhost),
`dev` (packaged → deployed dev URL), `production` (packaged → deployed prod URL).

URLs: dev `https://desktop.dou-dev.chatic.io/index.html`, prod `https://desktop.dou.chatic.io/index.html`.

## Steps

1. **Fix URL injection** — `apps/desktop/src/main/index.ts:37`
   `process.env.VITE_DESKTOP_WEB_URL` → `import.meta.env.MAIN_VITE_DESKTOP_WEB_URL`
   (keep `?? 'http://localhost:5005'` fallback).

2. **Env files** (committed — URLs public, not secret)
    - `apps/desktop/.env.dev` → `MAIN_VITE_DESKTOP_WEB_URL=https://desktop.dou-dev.chatic.io/index.html`
    - `apps/desktop/.env.production` → `MAIN_VITE_DESKTOP_WEB_URL=https://desktop.dou.chatic.io/index.html`
    - update `.env.example` to document the new var; no `.env.development` (absence → localhost).

3. **Icons** — `apps/desktop/build/`
    - `icon.png` ← `apps/mobile/ios/Chatic/Images.xcassets/DefaultIcon.appiconset/1024.png` (prod)
    - `icon-dev.png` ← `WhiteIcon.appiconset/1024.png` (dev)
    - `tray.png` ← 32px downscale; replace `nativeImage.createEmpty()` at `main/index.ts:98`
      with `createFromPath(...)`; verify path resolves in the packaged app (else move under resources).

4. **`apps/desktop/package.json` scripts**

    ```
    build:dev         electron-vite build --mode dev
    build:prod        electron-vite build --mode production
    package:mac:dev   yarn build:dev  && electron-builder --mac -c.appId=io.chatic.desktop.dev -c.productName="Chatic Dev" -c.mac.icon=build/icon-dev.png
    package:mac:prod  yarn build:prod && electron-builder --mac
    package:win:dev   yarn build:dev  && electron-builder --win -c.appId=io.chatic.desktop.dev -c.productName="Chatic Dev" -c.win.icon=build/icon-dev.png
    package:win:prod  yarn build:prod && electron-builder --win
    ```

    Base `build` block stays prod identity. Auto-detected `build/icon.png` = prod icon.

5. **Windows CI** — `.github/workflows/build-desktop-win.yml`
   `workflow_dispatch` with `env` choice (dev/prod) → checkout → setup-node(.nvmrc) →
   `yarn install --frozen-lockfile` → `yarn workspace @chatic/desktop package:win:<env>` →
   `actions/upload-artifact` (`apps/desktop/release/*.exe`).
   (root `postinstall` self-skips CocoaPods on the Windows runner.)

6. **Root `package.json` passthroughs**
   `desktop:package:mac:dev|prod` (+ win passthroughs) → `yarn workspace @chatic/desktop ...`.

## Verification

1. `cd apps/desktop && yarn build:prod` → exit 0; grep prod URL in `out/main/index.js`.
2. `yarn package:mac:dev` → `release/Chatic Dev-0.0.1.dmg`; installs alongside prod.
3. Trigger win workflow manually → artifact zip downloads.

## Blocking dependency (out of scope)

`desktop.dou-dev.chatic.io` / `desktop.dou.chatic.io` infra (bucket + CF + subdomain) must
exist and `deploy-desktop-web.sh` must target them before a packaged shell can load.
File as a separate infra task.
