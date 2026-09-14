import type { DomainChat } from './models';
import { compareByChatNo, isPreviewableChat, pickPreviewChat } from './chatPreview';

// apps/web의 useLastChat(행별 구독 훅, ADR-0057로 폐지)이 커버하던 프리뷰 판정 케이스를
// 순수 함수 단위로 이식한 것. 이 판정은 홈/관리 목록 렌더와 last-chat 폴백 경로가 공유한다.
const chat = (chatNo: number, content: string, fields: Partial<DomainChat> = {}): DomainChat =>
    ({ chatNo, content, ...fields }) as unknown as DomainChat;

describe('pickPreviewChat', () => {
    it('빈 창은 undefined — 프리뷰 없음', () => {
        expect(pickPreviewChat([])).toBeUndefined();
    });

    it('정렬 순서와 무관하게 max chatNo 메시지를 고른다', () => {
        expect(pickPreviewChat([chat(5, 'a'), chat(9, 'c'), chat(7, 'b')])).toEqual(chat(9, 'c'));
    });

    // ADR-0047 결정 3 — 한 메시지에 리액션이 몰려 최신 행들이 전부 리액션 이벤트여도,
    // 그 아래의 마지막 실제 메시지까지 닿아야 한다(빈 프리뷰 회귀 방지).
    it('리액션 이벤트가 창을 채워도 그 아래의 실제 메시지에 닿는다', () => {
        const burst = Array.from({ length: 25 }, (_, i) =>
            chat(10 + i, '', { ownerId: 'u1', stereo: 'system', subType: 'reaction' })
        );
        expect(pickPreviewChat([chat(9, '마지막 대화', { ownerId: 'u1', stereo: 'user' }), ...burst])?.content).toBe(
            '마지막 대화'
        );
    });

    it('시스템 행(본인/타인)과 스레드 답글은 프리뷰를 점거하지 못한다', () => {
        const picked = pickPreviewChat([
            chat(3, 'hello', { ownerId: 'u1', stereo: 'user' }),
            chat(4, 'u1 joined', { ownerId: 'u1', stereo: 'system' }),
            chat(5, 'reply', { ownerId: 'u1', stereo: 'user', parentId: '3' }),
        ]);
        expect(picked?.chatNo).toBe(3);
    });

    it('창 전체가 시스템 행이면 undefined', () => {
        expect(pickPreviewChat([chat(1, 'me joined', { ownerId: 'me', stereo: 'system' })])).toBeUndefined();
    });

    it('pending(chatNo 0)은 최신으로 이기고, 실패 전송은 제외된다', () => {
        const pending = chat(0, '보내는 중', { isPending: true });
        expect(pickPreviewChat([chat(9, '커밋'), pending])).toEqual(pending);

        const failed = chat(0, '실패', { isFailed: true });
        expect(pickPreviewChat([chat(9, '커밋'), failed])?.content).toBe('커밋');
    });

    it('톰스톤(hidden)은 여전히 프리뷰다 — 행이 "삭제된 메시지" 문구로 렌더된다', () => {
        const tombstone = chat(9, '지워진 본문', { hidden: true });
        expect(isPreviewableChat(tombstone)).toBe(true);
        expect(pickPreviewChat([chat(8, '이전'), tombstone])).toEqual(tombstone);
    });
});

describe('compareByChatNo', () => {
    it('chatNo 0(pending)은 어떤 커밋 행보다 최신이고, pending끼리는 createdAt 순', () => {
        expect(compareByChatNo(chat(9, 'a'), chat(0, 'p'))).toBeLessThan(0);
        expect(compareByChatNo(chat(0, 'p1', { createdAt: 100 }), chat(0, 'p2', { createdAt: 200 }))).toBeLessThan(0);
    });
});
