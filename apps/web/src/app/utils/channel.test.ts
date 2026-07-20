import { resolveChannelName } from './channel';

describe('resolveChannelName — 개인 방 이름 병합', () => {
    it('내 $join.nick이 있으면 channel.name보다 우선한다', () => {
        expect(resolveChannelName({ name: 'Owner Room', $join: { nick: 'My Room' } })).toBe('My Room');
    });

    it('$join.nick이 없거나 공백이면 channel.name으로 폴백한다', () => {
        expect(resolveChannelName({ name: 'Owner Room', $join: { nick: '   ' } })).toBe('Owner Room');
        expect(resolveChannelName({ name: 'Owner Room', $join: undefined })).toBe('Owner Room');
        expect(resolveChannelName({ name: 'Owner Room', $join: null })).toBe('Owner Room');
    });

    it('둘 다 없으면 빈 문자열을 반환한다(호출자 i18n 폴백)', () => {
        expect(resolveChannelName({ name: undefined, $join: undefined })).toBe('');
        expect(resolveChannelName({ name: '  ', $join: { nick: null } })).toBe('');
        expect(resolveChannelName(null)).toBe('');
        expect(resolveChannelName(undefined)).toBe('');
    });
});
