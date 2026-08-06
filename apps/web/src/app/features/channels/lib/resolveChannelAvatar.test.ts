import { resolveChannelAvatar } from './resolveChannelAvatar';

const call = (stereo: string, thumbnail?: string, extra: { myThumbnail?: string; peerThumbnail?: string } = {}) =>
    resolveChannelAvatar({ channel: { stereo, thumbnail } as never, ...extra });

describe('resolveChannelAvatar', () => {
    it('self 방은 내 플레이스 프로필 사진을 쓴다', () => {
        expect(call('self', undefined, { myThumbnail: 'me.png' })).toBe('me.png');
    });

    it('self 방은 channel.thumbnail을 무시한다 (방 자체의 사진 개념이 없다)', () => {
        expect(call('self', 'room.png', { myThumbnail: 'me.png' })).toBe('me.png');
        expect(call('self', 'room.png')).toBeUndefined();
    });

    it('dm 방은 상대 프로필 사진을 쓰고 channel.thumbnail을 무시한다', () => {
        expect(call('dm', 'room.png', { peerThumbnail: 'peer.png', myThumbnail: 'me.png' })).toBe('peer.png');
        expect(call('dm', 'room.png')).toBeUndefined();
    });

    it('그룹 방은 channel.thumbnail을 쓴다 (내 프로필·상대 사진에 영향받지 않는다)', () => {
        expect(call('group', 'room.png', { myThumbnail: 'me.png', peerThumbnail: 'peer.png' })).toBe('room.png');
    });

    it('사진이 없으면 undefined를 반환해 호출부가 placeholder를 그리게 한다', () => {
        expect(call('group')).toBeUndefined();
        expect(call('self')).toBeUndefined();
        expect(call('dm')).toBeUndefined();
    });

    it('공백뿐인 값은 사진으로 보지 않는다', () => {
        expect(call('self', undefined, { myThumbnail: '   ' })).toBeUndefined();
        expect(call('dm', undefined, { peerThumbnail: ' ' })).toBeUndefined();
        expect(call('group', '  ')).toBeUndefined();
    });
});
