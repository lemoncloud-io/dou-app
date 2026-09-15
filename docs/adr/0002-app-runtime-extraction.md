# App Runtime extracted to a shared lib; presentation rebuilt per platform

The platform-agnostic chat engine — data repositories, real-time sync (`ChatSyncScheduler`), socket connection, auth bootstrap, and core data hooks — currently lives inside `apps/web/src/app`. We are extracting it into `libs/app-runtime` so every client (web, desktop-web, later others) boots the same engine. Presentation — pages and layouts — is NOT shared: each client rebuilds it natively for its form factor.

## Considered Options

- **Fork the engine** into `apps/desktop-web`: fast start, but two copies of sync/socket logic diverge — double the bugs. Rejected (violates "replace, don't deprecate").
- **Feature-library-ize everything**: extract all `apps/web` feature pages into `libs/feature-*` and share UI too. Cleanest reuse, but a large, risky refactor of the live production app, and desktop's multi-panel layout reuses little mobile-shaped UI anyway. Rejected for now.
- **Engine-only sharing** (chosen): share `libs/app-runtime` + `ui-kit` + logic hooks; rebuild presentation per platform.

## Consequences

- The boundary is explicit: **engine is shared, UI is per-platform.** A page belongs in a client app, not in `app-runtime`. Only genuinely identical, complex feature pages get extracted to a lib case-by-case.
- The extraction touches the live `apps/web`. It must proceed without regressing the production app — engine files move behind their existing public surface, web keeps booting throughout.
- Mobile-coupled god-components (e.g. `CreateChannelPage`, 815 lines) must have their data/state logic pulled into runtime hooks during extraction; their presentation does not move.
