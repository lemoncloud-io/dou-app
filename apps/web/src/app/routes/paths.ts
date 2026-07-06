/**
 * Single source of truth for absolute navigation paths.
 *
 * Use these builders instead of hardcoding path strings in
 * navigate() / <Navigate to> / <Link to> / redirect().
 *
 * Paths are grouped by page type (auth flow / main entry / domain detail /
 * mypage hub), not strictly by feature. The literal URLs are unchanged from
 * the route definitions in `routes/` and each feature's `routes/index.tsx`;
 * only their access point is centralized.
 *
 * - Parameterless paths are string constants (literal types via `as const`).
 * - Parameterized paths are builder functions that enforce argument types and
 *   keep template assembly in one place.
 */
export const ROUTES = {
    root: '/',

    // ── Auth & account (Public / Common) ─────────────────────────
    auth: {
        login: '/auth/login',
        logout: '/auth/logout',
        oauthResponse: '/auth/oauth-response',
    },
    account: {
        signup: {
            root: '/account/signup',
            verify: '/account/signup/verify',
            password: '/account/signup/password',
        },
        resetPassword: {
            root: '/account/reset-password',
            verify: '/account/reset-password/verify',
            newPassword: '/account/reset-password/new-password',
        },
    },

    // ── Main entry (Private) ─────────────────────────────────────
    home: '/',

    // ── Channel (Private) ────────────────────────────────────────
    channels: {
        root: '/channels',
        create: '/channels/create',
        room: (channelId: string) => `/channels/${channelId}/room`,
        settings: (channelId: string) => `/channels/${channelId}/settings`,
    },

    // ── Place (Private) ──────────────────────────────────────────
    place: {
        detail: (placeId: string) => `/place/${placeId}`,
    },

    // ── Subscription (Private) ───────────────────────────────────
    subscription: {
        root: '/subscription',
        plans: '/subscription/plans',
    },

    // ── MyPage hub (Private) ─────────────────────────────────────
    mypage: {
        root: '/mypage',
        login: '/mypage/login',
        account: {
            info: '/mypage/account',
            manage: '/mypage/account-manage',
            edit: '/mypage/edit',
            cloudProfile: '/mypage/cloud-profile',
            siteProfile: '/mypage/site-profile',
            withdrawal: '/mypage/withdrawal',
        },
        policy: {
            root: '/mypage/policy',
            terms: '/mypage/policy/terms',
            licenses: '/mypage/policy/licenses',
            privacy: '/mypage/policy/privacy',
        },
    },

    // ── Debug tools (Private, hidden) ────────────────────────────
    debug: {
        root: '/debug',
        login: '/debug/login',
        dashboard: '/debug/dashboard',
        logBuffer: '/debug/log-buffer',
        cacheTest: '/debug/cache-test',
        uploadTest: '/debug/upload-test',
        badgeCount: '/debug/badge-count',
        inviteRedirect: '/debug/invite-redirect',
        push: '/debug/push',
    },
} as const;

/**
 * Route param key contracts, paired with the parameterized builders above.
 * Use with useParams to avoid stringly-typed key typos:
 *   useParams<Record<typeof ROUTE_PARAMS.channelId, string>>()
 */
export const ROUTE_PARAMS = {
    channelId: 'channelId',
    placeId: 'placeId',
    token: 'token',
} as const;
