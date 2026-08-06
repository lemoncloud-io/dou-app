import { resolveChannelAvatar } from './resolveChannelAvatar';

const call = (stereo: string, thumbnail?: string, extra: { myThumbnail?: string; peerThumbnail?: string } = {}) =>
    resolveChannelAvatar({ channel: { stereo, thumbnail } as never, ...extra });

describe('resolveChannelAvatar', () => {
    it('self 방은 내 플레이스 프로필 사진 + 1인 글리프를 쓴다', () => {
        expect(call('self', undefined, { myThumbnail: 'me.png' })).toEqual({ src: 'me.png', glyph: 'user' });
    });

    it('self 방은 channel.thumbnail을 무시한다 (방 자체의 사진 개념이 없다)', () => {
        expect(call('self', 'room.png', { myThumbnail: 'me.png' }).src).toBe('me.png');
        expect(call('self', 'room.png').src).toBeUndefined();
    });

    it('dm 방은 상대 프로필 사진 + 1인 글리프를 쓰고 channel.thumbnail을 무시한다', () => {
        expect(call('dm', 'room.png', { peerThumbnail: 'peer.png', myThumbnail: 'me.png' })).toEqual({
            src: 'peer.png',
            glyph: 'user',
        });
        expect(call('dm', 'room.png').src).toBeUndefined();
    });

    it('그룹 방은 channel.thumbnail + 2인 글리프를 쓴다 (내 사진·상대 사진에 영향받지 않는다)', () => {
        expect(call('group', 'room.png', { myThumbnail: 'me.png', peerThumbnail: 'peer.png' })).toEqual({
            src: 'room.png',
            glyph: 'group',
        });
    });

    it('사진이 없으면 src는 undefined이고, 글리프로 placeholder를 그리게 한다', () => {
        expect(call('group')).toEqual({ src: undefined, glyph: 'group' });
        expect(call('self')).toEqual({ src: undefined, glyph: 'user' });
        expect(call('dm')).toEqual({ src: undefined, glyph: 'user' });
    });

    it('공백뿐인 값은 사진으로 보지 않는다', () => {
        expect(call('self', undefined, { myThumbnail: '   ' }).src).toBeUndefined();
        expect(call('dm', undefined, { peerThumbnail: ' ' }).src).toBeUndefined();
        expect(call('group', '  ').src).toBeUndefined();
    });

    it('stereo를 모르는(빈) 채널은 그룹으로 취급한다 — 로딩 중 기본값', () => {
        expect(resolveChannelAvatar({ channel: {} as never })).toEqual({ src: undefined, glyph: 'group' });
    });
});
