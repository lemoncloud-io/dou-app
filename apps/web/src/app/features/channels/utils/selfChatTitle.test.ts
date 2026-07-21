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
});
