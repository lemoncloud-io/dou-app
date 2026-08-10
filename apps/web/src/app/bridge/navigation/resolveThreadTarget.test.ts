import type { DomainChat } from '@chatic/data';

import { resolveThreadTarget } from './resolveThreadTarget';

const chat = (fields: Partial<DomainChat>): DomainChat => fields as unknown as DomainChat;

describe('resolveThreadTarget — 푸시로 받은 chat이 답글이면 스레드 경로를 준다', () => {
    it('답글이면 parentId를 rootNo로 삼아 스레드 경로를 만든다', () => {
        const reply = chat({ id: 'C1:42', channelId: 'C1', chatNo: 42, parentId: '7' });
        expect(resolveThreadTarget(reply, 'C1:42')).toBe('/channels/C1/thread/7');
    });

    // A top-level message needs no hop — the room the caller already landed on is correct.
    it('최상위 메시지면 null (방에 그대로 머문다)', () => {
        const root = chat({ id: 'C1:42', channelId: 'C1', chatNo: 42 });
        expect(resolveThreadTarget(root, 'C1:42')).toBeNull();
    });

    it('chat을 못 찾았으면 null', () => {
        expect(resolveThreadTarget(null, 'C1:42')).toBeNull();
        expect(resolveThreadTarget(undefined, 'C1:42')).toBeNull();
    });

    // The id is `<channelId>:<chatNo>`, so a record that arrived without channelId still routes.
    it('chat에 channelId가 없으면 chatId에서 파싱한다', () => {
        expect(resolveThreadTarget(chat({ parentId: '7' }), 'C1:42')).toBe('/channels/C1/thread/7');
    });

    // The optimistic encoding carries the parent's FULL id; only the chatNo half is the rootNo.
    it('parentId가 full id 인코딩이어도 chatNo만 떼어 쓴다', () => {
        const reply = chat({ id: 'C1:42', channelId: 'C1', parentId: 'C1:7' });
        expect(resolveThreadTarget(reply, 'C1:42')).toBe('/channels/C1/thread/7');
    });

    it('채널을 어디서도 못 구하면 null', () => {
        expect(resolveThreadTarget(chat({ parentId: '7' }), '')).toBeNull();
    });
});
