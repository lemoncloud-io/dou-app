import { sortChannels, toTime } from './sortChannels';

import type { DomainChannel } from '@chatic/data';

// Minimal channel factory — only the fields sortChannels reads.
const channel = (id: string, lastActivityAt: number): DomainChannel =>
    ({ id, lastActivityAt }) as unknown as DomainChannel;

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
});
