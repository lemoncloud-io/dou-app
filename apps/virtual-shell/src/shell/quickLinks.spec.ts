import { resolveDeepLink } from 'virtual-shell/mobile-deeplink';

import { roomLink, screenLinks } from './quickLinks';

describe('screenLinks', () => {
    it('offers the main screens and a sample invite', () => {
        expect(screenLinks().map(link => link.id)).toEqual(['home', 'my', 'settings', 'notifications', 'invite']);
    });

    it('offers only links the app resolves to a screen of the web', () => {
        for (const link of screenLinks()) expect(resolveDeepLink(link.url)).toMatchObject({ kind: 'web' });
    });
});

describe('roomLink', () => {
    it("is the room's universal link, which the app opens on the room", () => {
        expect(resolveDeepLink(roomLink({ channelId: 'U:1' }))).toEqual({ kind: 'web', path: '/channels/U:1/room' });
    });
});
