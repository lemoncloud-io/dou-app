import { sortChannels, toTime } from './sortChannels';

import type { DomainChannel, DomainChat, DomainJoin } from '@chatic/data';

// Minimal channel factory — only the fields sortChannels reads.
const channel = (id: string, lastActivityAt: number): DomainChannel =>
    ({ id, lastActivityAt }) as unknown as DomainChannel;

const lastChat = (channelId: string, createdAtMs: number): DomainChat =>
    ({ id: `${channelId}:1`, channelId, createdAtMs }) as unknown as DomainChat;

const join = (channelId: string, updatedAt: number): DomainJoin =>
    ({ id: `${channelId}@me`, channelId, updatedAt }) as unknown as DomainJoin;

const ids = (channels: DomainChannel[]) => channels.map(c => c.id);

describe('toTime', () => {
    it('숫자 타임스탬프는 그대로 반환한다', () => {
        expect(toTime(1000)).toBe(1000);
    });

    it('ISO 문자열은 epoch ms로 파싱한다', () => {
        expect(toTime('2020-01-01T00:00:00.000Z')).toBe(Date.parse('2020-01-01T00:00:00.000Z'));
    });

    it('없거나 유효하지 않으면 0을 반환한다', () => {
        expect(toTime(undefined)).toBe(0);
        expect(toTime('not-a-date')).toBe(0);
        expect(toTime(NaN)).toBe(0);
    });
});

describe('sortChannels', () => {
    // c1 oldest → c3 newest activity.
    const c1 = channel('c1', 100);
    const c2 = channel('c2', 200);
    const c3 = channel('c3', 300);
    const channels = [c1, c2, c3];

    describe("'recent' — 최근 활동순", () => {
        it('활동 시각 내림차순으로 정렬한다', () => {
            const result = sortChannels({ channels, unreadByChannel: {}, sortMethod: 'recent' });
            expect(ids(result)).toEqual(['c3', 'c2', 'c1']);
        });

        it('원본 배열을 변경하지 않는다', () => {
            sortChannels({ channels, unreadByChannel: {}, sortMethod: 'recent' });
            expect(ids(channels)).toEqual(['c1', 'c2', 'c3']);
        });
    });

    describe("'unread' — 안읽은 메시지 우선", () => {
        it('안읽은 방을 상위로 올리고, 그룹 내부는 최근 활동순을 유지한다', () => {
            // c1 (oldest) has unread → floats above read c3/c2.
            const result = sortChannels({
                channels,
                unreadByChannel: { c1: 3 },
                sortMethod: 'unread',
            });
            expect(ids(result)).toEqual(['c1', 'c3', 'c2']);
        });

        it('안읽은 방이 여러 개면 그들 사이도 최근 활동순이다', () => {
            const result = sortChannels({
                channels,
                unreadByChannel: { c1: 1, c2: 2 },
                sortMethod: 'unread',
            });
            // Unread group (c2 newer than c1) first, then read c3.
            expect(ids(result)).toEqual(['c2', 'c1', 'c3']);
        });

        it('안읽은 방이 없으면 최근 활동순과 동일하다', () => {
            const result = sortChannels({ channels, unreadByChannel: {}, sortMethod: 'unread' });
            expect(ids(result)).toEqual(['c3', 'c2', 'c1']);
        });

        it('unread 카운트가 0인 방은 읽은 것으로 취급한다', () => {
            const result = sortChannels({
                channels,
                unreadByChannel: { c1: 0, c2: 5 },
                sortMethod: 'unread',
            });
            expect(ids(result)).toEqual(['c2', 'c3', 'c1']);
        });
    });

    describe('마지막 메시지 시각 기준 (lastChatByChannel)', () => {
        it('채널의 lastActivityAt이 아니라 마지막 메시지 시각으로 정렬한다', () => {
            // 채널 시각은 c3 > c2 > c1이지만, 마지막 메시지 시각은 그 반대다.
            const result = sortChannels({
                channels,
                lastChatByChannel: new Map([
                    ['c1', lastChat('c1', 3000)],
                    ['c2', lastChat('c2', 2000)],
                    ['c3', lastChat('c3', 1000)],
                ]),
                unreadByChannel: {},
                sortMethod: 'recent',
            });
            expect(ids(result)).toEqual(['c1', 'c2', 'c3']);
        });

        it('내 읽음 커서(join.updatedAt)는 정렬에 전혀 영향을 주지 않는다', () => {
            // 내가 c3을 방금 읽어 join이 갱신돼도, 순서는 메시지 시각과 channel.updatedAt만 본다.
            const result = sortChannels({
                channels: [c1, c2, { ...c3, $join: join('c3', 9000) } as unknown as DomainChannel],
                lastChatByChannel: new Map([['c1', lastChat('c1', 3000)]]),
                unreadByChannel: {},
                sortMethod: 'recent',
            });
            expect(ids(result)).toEqual(['c1', 'c3', 'c2']);
        });

        it('캐시된 메시지가 없는 방은 기존 시각 체인으로 폴백한다', () => {
            // c2만 메시지가 있고, c1/c3은 채널 시각(100/300)으로 비교된다.
            const result = sortChannels({
                channels,
                lastChatByChannel: new Map([['c2', lastChat('c2', 500)]]),
                unreadByChannel: {},
                sortMethod: 'recent',
            });
            expect(ids(result)).toEqual(['c2', 'c3', 'c1']);
        });

        it('맵이 비어 있으면 기존 정렬과 동일하다', () => {
            const result = sortChannels({
                channels,
                lastChatByChannel: new Map(),
                unreadByChannel: {},
                sortMethod: 'recent',
            });
            expect(ids(result)).toEqual(['c3', 'c2', 'c1']);
        });

        it('createdAtMs가 없으면 createdAt으로 비교한다 (문자열 타임스탬프 포함)', () => {
            const isoChat = { id: 'c1:1', channelId: 'c1', createdAt: '2020-01-01T00:00:00.000Z' };
            const result = sortChannels({
                channels,
                lastChatByChannel: new Map([['c1', isoChat as unknown as DomainChat]]),
                unreadByChannel: {},
                sortMethod: 'recent',
            });
            expect(ids(result)).toEqual(['c1', 'c3', 'c2']);
        });
    });

    describe('고정된 방 (클라이언트 전용 핀)', () => {
        it('고정된 방을 최상단으로 올린다', () => {
            const result = sortChannels({
                channels,
                unreadByChannel: {},
                sortMethod: 'recent',
                pinnedChannelIds: new Set(['c1']),
            });
            expect(ids(result)).toEqual(['c1', 'c3', 'c2']);
        });

        it('고정된 방이 여러 개면 그들 사이도 최근 활동순이다', () => {
            const result = sortChannels({
                channels,
                unreadByChannel: {},
                sortMethod: 'recent',
                pinnedChannelIds: new Set(['c1', 'c2']),
            });
            expect(ids(result)).toEqual(['c2', 'c1', 'c3']);
        });

        it('핀은 unread 정렬보다 우선한다', () => {
            // c3 has no unread but is pinned; c1 has unread — the pin still wins.
            const result = sortChannels({
                channels,
                unreadByChannel: { c1: 3 },
                sortMethod: 'unread',
                pinnedChannelIds: new Set(['c3']),
            });
            expect(ids(result)).toEqual(['c3', 'c1', 'c2']);
        });

        it('핀 집합이 비어 있으면 기존 정렬과 동일하다', () => {
            const result = sortChannels({
                channels,
                unreadByChannel: {},
                sortMethod: 'recent',
                pinnedChannelIds: new Set(),
            });
            expect(ids(result)).toEqual(['c3', 'c2', 'c1']);
        });
    });
});
