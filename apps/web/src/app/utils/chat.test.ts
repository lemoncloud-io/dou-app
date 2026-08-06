import type { DomainChat } from '@chatic/data';

import { compareByChatNo, isFeedVisible, isOwnSystemChat, isPreviewableChat, pickPreviewChat } from './chat';

const chat = (fields: Partial<DomainChat>): DomainChat => fields as unknown as DomainChat;

const feedChat = (over: Partial<DomainChat> = {}): DomainChat =>
    chat({ id: 'C1:1', channelId: 'C1', chatNo: 1, content: 'hi', createdAt: 1_000, ...over });

describe('isOwnSystemChat — 내가 주체인 시스템 메시지 판별', () => {
    it('stereo가 system이고 ownerId가 내 uid면 true', () => {
        expect(isOwnSystemChat(chat({ stereo: 'system', ownerId: 'me' }), 'me')).toBe(true);
    });

    it('다른 사람의 시스템 메시지는 false', () => {
        expect(isOwnSystemChat(chat({ stereo: 'system', ownerId: 'other' }), 'me')).toBe(false);
    });

    it('내가 보낸 일반 메시지는 false', () => {
        expect(isOwnSystemChat(chat({ stereo: 'user', ownerId: 'me' }), 'me')).toBe(false);
        expect(isOwnSystemChat(chat({ ownerId: 'me' }), 'me')).toBe(false);
    });

    it('uid가 비어 있으면 ownerId가 비어 있어도 false (미인증 가드)', () => {
        expect(isOwnSystemChat(chat({ stereo: 'system', ownerId: '' }), '')).toBe(false);
        expect(isOwnSystemChat(chat({ stereo: 'system' }), '')).toBe(false);
    });
});

describe('compareByChatNo — chatNo 기준 정렬 (pending은 마지막)', () => {
    it('chatNo 오름차순으로 정렬한다', () => {
        expect(compareByChatNo(feedChat({ chatNo: 1 }), feedChat({ chatNo: 2 }))).toBeLessThan(0);
    });

    it('센티넬 chatNo 0(pending)은 모든 확정 행보다 뒤로 간다', () => {
        expect(compareByChatNo(feedChat({ chatNo: 0 }), feedChat({ chatNo: 999 }))).toBeGreaterThan(0);
    });

    it('pending끼리는 createdAt으로 전송 순서를 유지한다', () => {
        expect(
            compareByChatNo(feedChat({ chatNo: 0, createdAt: 1 }), feedChat({ chatNo: 0, createdAt: 2 }))
        ).toBeLessThan(0);
    });
});

describe('isFeedVisible — 본문 피드 가시성', () => {
    it('평범한 최상위 메시지는 보인다', () => {
        expect(isFeedVisible(feedChat())).toBe(true);
    });

    it('스레드 답글은 숨긴다 — 스레드 화면 소관이다', () => {
        expect(isFeedVisible(feedChat({ parentId: 'C1:1' }))).toBe(false);
    });

    // The row stays and renders as a tombstone. A message that just vanishes leaves
    // the people who were reading it with no account of what happened.
    it('삭제된 메시지는 tombstone으로 남긴다', () => {
        expect(isFeedVisible(feedChat({ hidden: true }))).toBe(true);
    });

    it('join/leave 시스템 행은 알림 줄로 남긴다', () => {
        expect(isFeedVisible(feedChat({ stereo: 'system', subType: 'join' }))).toBe(true);
    });

    // These are the input to foldReactions, shown as chips under the message they
    // point at. As feed rows they would be empty pills — the exact bug ADR-0045 fixes.
    it('리액션 이벤트는 숨긴다', () => {
        expect(isFeedVisible(feedChat({ stereo: 'system', subType: 'reaction' }))).toBe(false);
    });

    it('삭제된 리액션 이벤트도 tombstone이 되지 않고 숨겨진다', () => {
        expect(isFeedVisible(feedChat({ stereo: 'system', subType: 'reaction', hidden: true }))).toBe(false);
    });
});

describe('isPreviewableChat — 홈 목록 미리보기 자격', () => {
    it('평범한 최상위 메시지는 미리보기가 된다', () => {
        expect(isPreviewableChat(feedChat())).toBe(true);
    });

    it('삭제된 메시지도 미리보기가 된다 — 피드와 같은 tombstone 규칙', () => {
        expect(isPreviewableChat(feedChat({ hidden: true }))).toBe(true);
    });

    // It never reached the channel, and it keeps chatNo 0 indefinitely — ranked as
    // newest it would hold the preview and freeze the row's time.
    it('실패한 전송은 미리보기가 되지 않는다', () => {
        expect(isPreviewableChat(feedChat({ chatNo: 0, isFailed: true }))).toBe(false);
    });

    it('스레드 답글은 미리보기가 되지 않는다', () => {
        expect(isPreviewableChat(feedChat({ parentId: 'C1:1' }))).toBe(false);
    });

    it('리액션 이벤트는 미리보기가 되지 않는다', () => {
        expect(isPreviewableChat(feedChat({ stereo: 'system', subType: 'reaction' }))).toBe(false);
    });

    it('join/leave 시스템 행은 본문이 없어 미리보기가 되지 않는다', () => {
        expect(isPreviewableChat(feedChat({ stereo: 'system', subType: 'join' }))).toBe(false);
    });
});

describe('pickPreviewChat — 미리보기로 쓸 최신 메시지 선택', () => {
    it('도착 순서와 무관하게 가장 높은 chatNo를 고른다', () => {
        const picked = pickPreviewChat([
            feedChat({ id: 'C1:3', chatNo: 3, content: 'newest' }),
            feedChat({ id: 'C1:1', chatNo: 1, content: 'oldest' }),
            feedChat({ id: 'C1:2', chatNo: 2, content: 'middle' }),
        ]);
        expect(picked?.content).toBe('newest');
    });

    // A pending send carries chatNo 0 and would lose every numeric comparison, so your
    // own message would be missing from the home row until the server answered.
    it('내가 방금 보낸 pending 행이 확정 행들을 이긴다', () => {
        const picked = pickPreviewChat([
            feedChat({ id: 'C1:9', chatNo: 9, content: 'persisted' }),
            feedChat({ id: 'optimistic-1', chatNo: 0, isPending: true, content: 'just sent' }),
        ]);
        expect(picked?.content).toBe('just sent');
    });

    it('실패한 전송은 건너뛰고 마지막 전달된 메시지로 돌아간다', () => {
        const picked = pickPreviewChat([
            feedChat({ id: 'C1:9', chatNo: 9, content: 'delivered' }),
            feedChat({ id: 'optimistic-2', chatNo: 0, isFailed: true, content: 'never sent' }),
        ]);
        expect(picked?.content).toBe('delivered');
    });

    it('최신 행들이 답글·리액션이면 마지막 진짜 메시지로 폴스루한다', () => {
        const picked = pickPreviewChat([
            feedChat({ id: 'C1:5', chatNo: 5, content: 'real' }),
            feedChat({ id: 'C1:6', chatNo: 6, parentId: 'C1:5', content: 'reply' }),
            feedChat({ id: 'C1:7', chatNo: 7, stereo: 'system', subType: 'reaction' }),
        ]);
        expect(picked?.content).toBe('real');
    });

    it('미리보기 가능한 행이 하나도 없으면 undefined', () => {
        expect(pickPreviewChat([feedChat({ parentId: 'C1:1' })])).toBeUndefined();
        expect(pickPreviewChat([])).toBeUndefined();
    });
});
