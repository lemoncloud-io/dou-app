import type { PreferenceKey } from '@chatic/app-messages';

// ---------------------------------------------------------------------------
// Storage strategy types
// ---------------------------------------------------------------------------

/**
 * native+local: on native synced to native bridge; on web uses localStorage.
 * local:        localStorage only, bridge never involved.
 * session:      sessionStorage, tab-scoped and cleared on tab close.
 */
type NativeLocalEntry = { strategy: 'native+local'; nativeKey: PreferenceKey; localKey: string; defaultValue: string };
type LocalEntry = { strategy: 'local'; localKey: string; defaultValue: string };
type SessionEntry = { strategy: 'session'; sessionKey: string; defaultValue: string };
export type PreferenceEntry = NativeLocalEntry | LocalEntry | SessionEntry;

// ---------------------------------------------------------------------------
// Central preference registry
//
// Every app-level setting key lives here exactly once.
// `strategy` controls how reads and writes are routed:
//
//   Write flow:
//     1. Zustand store is updated (always, in-memory source of truth)
//     2. If native+local → persist to native bridge (native) or localStorage (web)
//     3. If local        → persist to localStorage
//     4. If session      → persist to sessionStorage
//
//   Read flow (initialization):
//     1. Read from localStorage / sessionStorage synchronously for initial value
//     2. If native: PreferenceLoader fetches from native and hydrates store
//     3. If neither has a value: use `defaultValue`
//
// Keys owned by external modules (language) are listed for reference
// so the full picture lives in one place.
// ---------------------------------------------------------------------------

/** Theme preference value — 'system' resolves against the OS color scheme at runtime. */
export type Theme = 'dark' | 'light' | 'system';

/** Channel-list sort method, chosen per place. 'recent' matches the pre-setting default. */
export type ChannelSortMethod = 'recent' | 'unread';

/** Default channel sort when a place has no stored preference. */
export const DEFAULT_CHANNEL_SORT: ChannelSortMethod = 'recent';

/** How long a dismissed cloud-promo banner stays hidden before it is shown again (24h, ADR-0034). */
export const CLOUD_PROMO_DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Scope key for the per-place client preferences (channel sort, pinned channels).
 *
 * A site id is only unique WITHIN its cloud, so these preferences are keyed by `<cid>:<sid>` —
 * otherwise the same place id in another cloud would silently inherit the first cloud's sort order
 * and pins. Returns null when either half is unknown; callers then fall back to defaults and skip
 * the write rather than storing a half-formed key.
 */
export const placeScopeKey = (cloudId?: string | null, placeId?: string | null): string | null =>
    cloudId && placeId ? `${cloudId}:${placeId}` : null;

/** A stored key belongs to the current scheme only if it carries both halves. */
export const isPlaceScopeKey = (key: string): boolean => key.includes(':');

export const PREFERENCES = {
    // -----------------------------------------------------------------------
    // Managed by usePreferenceStore
    // -----------------------------------------------------------------------
    blurLastMessage: {
        strategy: 'native+local',
        nativeKey: 'blurLastMessage',
        localKey: 'chatic-blur-last-message',
        defaultValue: 'false',
    },
    isFirstRun: {
        strategy: 'native+local',
        nativeKey: 'isFirstRun',
        // localStorage stores 'true' when onboarding IS completed (legacy key — kept for migration compat).
        // isFirstRun is the inverse: 'true' stored here means onboarding NOT yet done.
        localKey: 'chatic-onboarding-completed',
        defaultValue: 'false',
    },
    theme: {
        strategy: 'native+local',
        nativeKey: 'theme',
        // Legacy ThemeProvider key — kept so an existing user's explicit choice survives the migration.
        localKey: 'vite-ui-theme',
        // 'system' follows the OS scheme: mobile OS inside the WebView, prefers-color-scheme on web.
        defaultValue: 'system',
    },
    // Whether the user hid the floating issue-report button. Web-only widget, so
    // 'local' (localStorage only) — no native bridge / app-messages PreferenceKey needed.
    // Restored via the MyPage settings toggle.
    issueReportHidden: {
        strategy: 'local',
        localKey: 'chatic-issue-report-hidden',
        defaultValue: 'false',
    },
    // Device-global push mute (server-owned by chatic-pushes-api via device.update-remote). There is
    // no server read path, so this local cache is the optimistic display source; 'false' = unmuted
    // (notifications ON) is the assumed default. 'local' (web) — the write is what actually persists.
    pushMuted: {
        strategy: 'local',
        localKey: 'chatic-push-muted',
        defaultValue: 'false',
    },
    // Per-place channel sort method. The value is a JSON map keyed by the place scope
    // ({"<cid>:<sid>":"unread", ...}) stored under one key — a place with no entry falls back
    // to DEFAULT_CHANNEL_SORT. See placeScopeKey: the key carries the cloud id because a site
    // id is only unique within its cloud. Client-only preference (no server sync), so 'local'
    // (localStorage); the write is the source of truth.
    channelSort: {
        strategy: 'local',
        localKey: 'chatic-channel-sort',
        defaultValue: '{}',
    },
    // Pinned channels, per place. The value is a JSON map of place scope → channelId[]
    // ({"<cid>:<sid>":["<channelId>", ...]}) stored under one key; see placeScopeKey. Pinning is
    // a CLIENT-ONLY concept — neither ChannelModel nor JoinModel carries a pin field — so 'local'
    // (localStorage) and the write is the source of truth. Not synced across devices.
    pinnedChannels: {
        strategy: 'local',
        localKey: 'chatic-pinned-channels',
        defaultValue: '{}',
    },
    // Live store version the user last dismissed the update prompt for. A once-per-version nag:
    // re-shown only when a newer live version appears. Purely a local UX guard (no server/native
    // reader), so 'local' rather than 'native+local' — nothing consumes this key on the native side.
    dismissedUpdateVersion: {
        strategy: 'local',
        localKey: 'chatic-dismissed-update-version',
        defaultValue: '',
    },
    // Epoch ms of the last time the cloud-promo banner was dismissed; '' means never. The banner
    // reappears once CLOUD_PROMO_DISMISS_TTL_MS has passed, so this is a timestamp rather than a
    // boolean. Home and the cloud switcher share this single key on purpose — dismissing in one
    // place hides it in both (ADR-0034). Local-only: nothing on the native side reads it.
    cloudPromoDismissedAt: {
        strategy: 'local',
        localKey: 'chatic-cloud-promo-dismissed-at',
        defaultValue: '',
    },
    // -----------------------------------------------------------------------
    // Owned by i18next / useBackHandler — registered here for reference
    // -----------------------------------------------------------------------
    language: {
        strategy: 'native+local',
        nativeKey: 'language',
        localKey: 'chatic-language',
        defaultValue: 'ko',
    },

    // -----------------------------------------------------------------------
    // Session-only: intentionally ephemeral, never sent to native bridge
    // -----------------------------------------------------------------------
    debugSettings: {
        strategy: 'session',
        sessionKey: 'chatic_debug_mode',
        defaultValue: 'false',
    },
} as const satisfies Record<string, PreferenceEntry>;

export type PreferenceName = keyof typeof PREFERENCES;
