import {
    normalizeChannelSort,
    normalizeCloudPromoDismissedAt,
    normalizeInviteIds,
    normalizeRecentSearches,
    parseChannelSort,
    parseCloudPromoDismissedAt,
    parseInviteIds,
    parseRecentSearches,
    parseThemeBridgeValue,
} from './preferenceParsers';

describe('normalizeChannelSort / parseChannelSort', () => {
    it('cid:sid 스코프의 유효한 정렬값만 남긴다', () => {
        expect(normalizeChannelSort({ 'cloud-1:place-1': 'unread', 'cloud-2:place-2': 'recent' })).toEqual({
            'cloud-1:place-1': 'unread',
            'cloud-2:place-2': 'recent',
        });
    });

    it('cid 없이 저장된 레거시(bare placeId) 항목은 버린다', () => {
        // A bare placeId can't be attributed to a cloud, so honoring it would leak one cloud's
        // setting into another cloud's same-id place.
        expect(normalizeChannelSort({ 'place-1': 'unread', 'cloud-1:place-1': 'unread' })).toEqual({
            'cloud-1:place-1': 'unread',
        });
    });

    it('알 수 없는 정렬 방식은 버린다', () => {
        expect(normalizeChannelSort({ 'cloud-1:place-1': 'oldest' })).toEqual({});
    });

    it('객체가 아니거나 배열이면 빈 맵이다', () => {
        expect(normalizeChannelSort(null)).toEqual({});
        expect(normalizeChannelSort(['unread'])).toEqual({});
    });

    it('손상된 JSON 문자열은 빈 맵으로 폴백한다', () => {
        expect(parseChannelSort('{broken')).toEqual({});
    });
});

// normalizePinnedChannels/parsePinnedChannels cases moved to
// libs/shared/src/preferences/pinnedChannels.test.ts (shared with desktop-web).

describe('normalizeInviteIds / parseInviteIds', () => {
    it('비어있지 않은 문자열만 남긴다', () => {
        expect(normalizeInviteIds(['ok', '', null, 1, 'ok2'])).toEqual(['ok', 'ok2']);
    });

    it('배열이 아니면 빈 배열이다', () => {
        expect(normalizeInviteIds({ a: 1 })).toEqual([]);
    });

    it('손상된 값은 "기록 없음"으로 degrade한다 — 던지지 않는다', () => {
        expect(parseInviteIds('not json')).toEqual([]);
        expect(parseInviteIds('{"a":1}')).toEqual([]);
        expect(parseInviteIds('[1, null, "", "ok"]')).toEqual(['ok']);
    });
});

describe('normalizeRecentSearches / parseRecentSearches', () => {
    it('문자열 배열을 그대로 반환한다', () => {
        expect(normalizeRecentSearches(['lemon', 'mango'])).toEqual(['lemon', 'mango']);
    });

    it('배열이 아닌 값(객체)은 빈 배열로 폴백한다', () => {
        expect(normalizeRecentSearches({ lemon: true })).toEqual([]);
    });

    it('문자열이 아닌 항목은 걸러낸다', () => {
        expect(normalizeRecentSearches(['lemon', 42, null, 'mango'])).toEqual(['lemon', 'mango']);
    });

    it('손상된 JSON은 빈 배열로 폴백한다', () => {
        expect(parseRecentSearches('{not valid json')).toEqual([]);
    });
});

describe('normalizeCloudPromoDismissedAt / parseCloudPromoDismissedAt', () => {
    const NOW = 1_800_000_000_000;

    it('정상 epoch ms를 그대로 반환한다', () => {
        expect(normalizeCloudPromoDismissedAt(NOW - 1000, NOW)).toBe(NOW - 1000);
        expect(parseCloudPromoDismissedAt(String(NOW - 1000), NOW)).toBe(NOW - 1000);
    });

    it('없음/빈 값은 0(닫힌 적 없음)이다', () => {
        expect(normalizeCloudPromoDismissedAt(null, NOW)).toBe(0);
        expect(normalizeCloudPromoDismissedAt(undefined, NOW)).toBe(0);
        expect(parseCloudPromoDismissedAt('', NOW)).toBe(0);
    });

    it('숫자가 아니거나 0 이하인 값은 0으로 강등한다', () => {
        // A corrupt write must not be able to hide the banner forever.
        expect(parseCloudPromoDismissedAt('not-a-number', NOW)).toBe(0);
        expect(parseCloudPromoDismissedAt('0', NOW)).toBe(0);
        expect(parseCloudPromoDismissedAt('-5', NOW)).toBe(0);
        expect(parseCloudPromoDismissedAt('Infinity', NOW)).toBe(0);
    });

    it('공백 문자열과 지수 표기 오버플로도 0으로 강등한다', () => {
        expect(parseCloudPromoDismissedAt('   ', NOW)).toBe(0);
        expect(parseCloudPromoDismissedAt('1e400', NOW)).toBe(0);
    });

    it('미래 시각도 0으로 강등한다', () => {
        // Only a clock change or a bad write can produce this; honoring it would hide the banner
        // until that future date.
        expect(parseCloudPromoDismissedAt(String(NOW + 1), NOW)).toBe(0);
    });
});

describe('parseThemeBridgeValue', () => {
    it('평문 테마 문자열을 그대로 반환한다', () => {
        expect(parseThemeBridgeValue('dark')).toBe('dark');
        expect(parseThemeBridgeValue('light')).toBe('light');
        expect(parseThemeBridgeValue('system')).toBe('system');
    });

    it('zustand-persist JSON 봉투에서 내부 테마 값을 꺼낸다', () => {
        expect(parseThemeBridgeValue('{"state":{"theme":"light"},"version":0}')).toBe('light');
    });

    it('유효하지 않은 값은 null을 반환한다', () => {
        expect(parseThemeBridgeValue('blue')).toBeNull();
        expect(parseThemeBridgeValue('{"state":{"theme":"blue"}}')).toBeNull();
        expect(parseThemeBridgeValue('{broken json')).toBeNull();
        expect(parseThemeBridgeValue(null)).toBeNull();
        expect(parseThemeBridgeValue(123)).toBeNull();
    });
});
