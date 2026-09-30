import type { ConfigRegistryModule } from '../types';

/**
 * User-facing preferences, absorbed from `PREFERENCES` (`apps/web/src/app/stores/preferenceKeys.ts`).
 *
 * `ui.onboardingCompleted` drops the old inversion: the legacy `isFirstRun` state was the negation
 * of what its localStorage key stored, which needed a comment to warn readers. This key's name
 * matches what it holds.
 *
 * `channelSort`/`pinnedChannels`/`homeSectionsCollapsed`/`recentSearches` are `'internal'` on purpose
 * even though a person changes them — the place they change is a sort picker, a pin gesture, a
 * section header, a search box, not a settings screen, so a generic settings UI must not render a
 * row for them.
 */
export const uiModule: ConfigRegistryModule = {
    'ui.theme': {
        title: 'Theme',
        description: 'Shows the screen in light or dark.',
        type: 'enum',
        values: ['light', 'dark', 'system'],
        defaultValue: 'light',
        surface: 'user',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    // `shell`, like the theme, so the choice reaches the native app and survives a WebView storage
    // wipe. apps/web resolves the language while its i18n module is imported, before `config.init()`,
    // so it reads the boot envelope and the local mirror itself, in the resolver's order.
    'ui.language': {
        title: 'Language',
        description: "The app's display language. 'system' follows the device language.",
        type: 'enum',
        values: ['system', 'ko', 'en'],
        defaultValue: 'system',
        surface: 'user',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    'ui.blurLastMessage': {
        title: 'Blur last message preview',
        description: 'Blurs the last message content shown in the channel list.',
        type: 'boolean',
        defaultValue: false,
        surface: 'user',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    'ui.onboardingCompleted': {
        title: 'Onboarding completed',
        description: 'Decides whether to show the first-run guide again.',
        type: 'boolean',
        defaultValue: false,
        surface: 'internal',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    'ui.pushMuted': {
        title: 'Mute push notifications',
        description: 'Turns off push notifications for the whole device.',
        type: 'boolean',
        defaultValue: false,
        surface: 'user',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.channelSort': {
        title: 'Channel sort order',
        description: 'Stores the channel list sort order, per place.',
        type: 'json',
        defaultValue: {},
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.pinnedChannels': {
        title: 'Pinned channels',
        description: 'The list of channels pinned to the top, per place.',
        type: 'json',
        defaultValue: {},
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.channelOrder': {
        title: 'Channel display order',
        description: "The sidebar's channel/DM display order per place (changed by dragging).",
        type: 'json',
        defaultValue: {},
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.homeSectionsCollapsed': {
        title: 'Home sections collapsed',
        description: 'The list of sections (places, chat rooms, self chat) collapsed on the home screen.',
        type: 'json',
        defaultValue: {},
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.recentSearches': {
        title: 'Recent searches',
        description: 'The list of recently entered search terms in unified search.',
        type: 'json',
        defaultValue: [],
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.cloudPromoDismissedAt': {
        title: 'Cloud promo dismissed at',
        description: 'When the add-a-cloud promo banner was last dismissed.',
        type: 'number',
        defaultValue: 0,
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.dismissedUpdateVersion': {
        title: 'Update notice dismissed version',
        description: "The last version whose update notice was dismissed. It won't reappear until a newer version.",
        type: 'string',
        defaultValue: '',
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
};
