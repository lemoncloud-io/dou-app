import { resolveDmTitle } from './dmTitle';

describe('resolveDmTitle', () => {
    const UNNAMED = '대화 상대';
    const base = { unnamedLabel: UNNAMED };

    it('prefers my join nick over everything else', () => {
        expect(
            resolveDmTitle({ ...base, joinNick: '토끼친구', peerNick: '토끼', channelName: '서버가 만든 이름' })
        ).toBe('토끼친구');
    });

    it("falls back to the peer's profile nick when I have not named the room", () => {
        expect(resolveDmTitle({ ...base, peerNick: '토끼', channelName: '서버가 만든 이름' })).toBe('토끼');
        expect(resolveDmTitle({ ...base, joinNick: '   ', peerNick: '토끼' })).toBe('토끼');
        expect(resolveDmTitle({ ...base, joinNick: null, peerNick: '토끼' })).toBe('토끼');
    });

    it('falls back to channel.name when neither name exists', () => {
        expect(resolveDmTitle({ ...base, channelName: '서버가 만든 이름' })).toBe('서버가 만든 이름');
        expect(resolveDmTitle({ ...base, peerNick: '  ', channelName: '서버가 만든 이름' })).toBe('서버가 만든 이름');
    });

    it('falls back to the label when the whole chain is empty', () => {
        expect(resolveDmTitle(base)).toBe(UNNAMED);
        expect(resolveDmTitle({ ...base, joinNick: '  ', peerNick: null, channelName: '   ' })).toBe(UNNAMED);
    });

    it('trims every tier', () => {
        expect(resolveDmTitle({ ...base, joinNick: '  토끼친구  ' })).toBe('토끼친구');
        expect(resolveDmTitle({ ...base, peerNick: '  토끼  ' })).toBe('토끼');
        expect(resolveDmTitle({ ...base, channelName: '  방  ' })).toBe('방');
    });

    // Same hazard as the self-chat title: the server seeds a join nick with the raw user id in some
    // flows, and that must never surface as a room title.
    const UID = '6f9a03e5-5e28-424e-bc1f-1ebdb34631eb';

    it('ignores a join nick that is my raw user id', () => {
        expect(resolveDmTitle({ ...base, joinNick: UID, peerNick: '토끼', selfUserId: UID })).toBe('토끼');
    });

    it('ignores a UUID-shaped join nick even without a userId hint', () => {
        expect(resolveDmTitle({ ...base, joinNick: UID, peerNick: '토끼' })).toBe('토끼');
        expect(resolveDmTitle({ ...base, joinNick: UID.toUpperCase(), peerNick: '토끼' })).toBe('토끼');
    });

    it('falls through a raw-id join nick to channel.name when the peer has no profile', () => {
        expect(resolveDmTitle({ ...base, joinNick: UID, channelName: '서버 이름', selfUserId: UID })).toBe('서버 이름');
    });

    it('still accepts a custom nick that merely contains hex and dashes', () => {
        expect(resolveDmTitle({ ...base, joinNick: 'cafe-2024', peerNick: '토끼', selfUserId: UID })).toBe('cafe-2024');
    });
});
