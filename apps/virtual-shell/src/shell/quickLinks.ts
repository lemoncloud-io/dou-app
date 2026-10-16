import type { KnownRoom } from './VirtualShell';

/** A link the deep link card offers in one click. */
export interface QuickLink {
    id: string;
    url: string;
}

/** The dev domain the app's universal links use; the shell resolves it the way the app does. */
const LINK_ORIGIN = 'https://app-dev.chatic.io';

/** The app's own screens, as links: what `resolveDeepLink` turns into these paths. */
const SCREENS: ReadonlyArray<{ id: string; path: string }> = [
    { id: 'home', path: '/' },
    { id: 'my', path: '/mypage' },
    { id: 'settings', path: '/mypage/settings' },
    { id: 'notifications', path: '/mypage/settings/notifications' },
];

/**
 * Ready links: the app's main screens, and an invite link with a code no server knows — which shows
 * the app's own "invite is not valid" screen, the path an invite takes. Rooms come from `roomLink`.
 */
export const screenLinks = (): QuickLink[] => [
    ...SCREENS.map(screen => ({ id: screen.id, url: `${LINK_ORIGIN}${screen.path}` })),
    { id: 'invite', url: `${LINK_ORIGIN}/s?code=invt:0:virtual-shell-sample&relay` },
];

/** A room's own universal link. */
export const roomLink = (room: Pick<KnownRoom, 'channelId'>): string =>
    `${LINK_ORIGIN}/channels/${room.channelId}/room`;
