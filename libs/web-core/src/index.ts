// @chatic/web-core — session SSoT (identity/relay/cloud + activeServer), transport, and shared hooks
// for Chatic web clients. Exports are grouped by concern below; the public catalog lives in
// docs/hooks/public-surface.md and docs/session/public-api.md.

// --- Config: env-derived endpoints, build identifiers, i18n key -----------------------------
export * from './config';

// --- Transport: low-level API client, signing, request builder ------------------------------
export * from './transport';

// --- API: typed request functions + payload/response types ----------------------------------
export * from './api';

// --- Session: global session context + shared session types ---------------------------------
export * from './session/contexts';
export * from './session/types';

// --- Hooks: background orchestration, session actions, and readers --------------------------
export * from './hooks';

// --- app-runtime bridge (consumed by @chatic/app-runtime's socket delegate, not app-facing) -
// SDK AuthController bridge helpers (kind-explicit, per-server; multi-socket-design.md §7), session
// teardown, and the optimistic selected-site read model. `./session/services` is not auto re-exported,
// so these are named explicitly.
export {
    getServerAuthRegistration,
    signServerAuth,
    commitServerRefreshedToken,
    logoutCloudSession,
    logoutRelaySession,
    applySelectedSite,
    loginRelayByToken,
} from './session/services';
export type { LogoutOptions, ServerKind } from './session/services';
// Selected-site read model getter, for app-runtime's socket-driven site switch (auth.switch).
export { getSelectedSiteId } from './session/contextStore';
