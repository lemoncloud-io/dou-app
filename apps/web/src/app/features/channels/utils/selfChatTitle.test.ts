import { resolveSelfChatTitle } from './selfChatTitle';

describe('resolveSelfChatTitle', () => {
    const FALLBACK = '나와의 채팅';
    // Second arg = my active site-profile nick (e.g. "호동생호"), NOT the account/user name.
    const SITE_NICK = '호동생호';

    it('prefers the join nick when present', () => {
        expect(resolveSelfChatTitle('내 메모장', SITE_NICK, FALLBACK)).toBe('내 메모장');
    });

    it('trims the nick', () => {
        expect(resolveSelfChatTitle('  기록  ', SITE_NICK, FALLBACK)).toBe('기록');
    });

    it('falls back to the site-profile nick when the join nick is empty/blank', () => {
        expect(resolveSelfChatTitle('', SITE_NICK, FALLBACK)).toBe(SITE_NICK);
        expect(resolveSelfChatTitle('   ', SITE_NICK, FALLBACK)).toBe(SITE_NICK);
        expect(resolveSelfChatTitle(null, SITE_NICK, FALLBACK)).toBe(SITE_NICK);
        expect(resolveSelfChatTitle(undefined, SITE_NICK, FALLBACK)).toBe(SITE_NICK);
    });

    it('falls back to the label when both the join nick and site-profile nick are missing', () => {
        expect(resolveSelfChatTitle('', '', FALLBACK)).toBe(FALLBACK);
        expect(resolveSelfChatTitle(null, undefined, FALLBACK)).toBe(FALLBACK);
        expect(resolveSelfChatTitle('  ', '  ', FALLBACK)).toBe(FALLBACK);
    });

    // An unnamed self-chat is server-seeded with nick = userId (a raw UUID). That raw id must not
    // surface as the title — it falls through to the human site-profile nick.
    const UID = '6f9a03e5-5e28-424e-bc1f-1ebdb34631eb';

    it('ignores a nick equal to the owning userId and uses the site-profile nick', () => {
        expect(resolveSelfChatTitle(UID, SITE_NICK, FALLBACK, UID)).toBe(SITE_NICK);
    });

    it('ignores a UUID-shaped nick even without a userId hint', () => {
        expect(resolveSelfChatTitle(UID, SITE_NICK, FALLBACK)).toBe(SITE_NICK);
        // Case-insensitive on the hex.
        expect(resolveSelfChatTitle(UID.toUpperCase(), SITE_NICK, FALLBACK)).toBe(SITE_NICK);
    });

    it('falls to the label when the nick is a raw id and there is no site-profile nick', () => {
        expect(resolveSelfChatTitle(UID, '', FALLBACK, UID)).toBe(FALLBACK);
    });

    it('still accepts a real custom nick that merely contains hex/dashes', () => {
        // Not UUID-shaped and not the userId → a legitimate custom name.
        expect(resolveSelfChatTitle('cafe-2024', SITE_NICK, FALLBACK, UID)).toBe('cafe-2024');
    });
});
