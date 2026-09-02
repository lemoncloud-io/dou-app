/**
 * The route-keyed "is the signing credential still alive?" read. What matters here is that relay and
 * cloud are answered from their OWN stores — a cross-wired answer would send the recovery to the
 * wrong server — and that "cannot tell" is never reported as stale.
 */
import { credentialFreshness } from './credentialFreshness';

const mockGetRelayToken = jest.fn();
const mockGetCloudCredential = jest.fn();

jest.mock('../store/stores', () => ({
    relayStore: { getRelayToken: (...a: unknown[]) => mockGetRelayToken(...a) },
    cloudStore: { getCredential: (...a: unknown[]) => mockGetCloudCredential(...a) },
}));

const NOW = new Date('2026-09-02T00:00:00.000Z').getTime();
const atOffset = (ms: number) => new Date(NOW + ms).toISOString();

const relayTokenWith = (expiration?: string) => ({
    Token: { credential: expiration ? { Expiration: expiration } : {} },
});

beforeEach(() => {
    jest.clearAllMocks();
    mockGetRelayToken.mockReturnValue(null);
    mockGetCloudCredential.mockReturnValue(undefined);
});

describe('credentialFreshness.timeToExpiry', () => {
    it('relay는 relay 토큰의 자격증명 만료시각을 읽는다', () => {
        mockGetRelayToken.mockReturnValue(relayTokenWith(atOffset(30 * 60_000)));

        expect(credentialFreshness.timeToExpiry('relay', NOW)).toBe(30 * 60_000);
        expect(mockGetCloudCredential).not.toHaveBeenCalled();
    });

    it('cloud는 cloud 스토어를 읽는다 — 두 자격증명은 수명이 따로 논다', () => {
        mockGetCloudCredential.mockReturnValue({ Expiration: atOffset(10 * 60_000) });

        expect(credentialFreshness.timeToExpiry('cloud', NOW)).toBe(10 * 60_000);
        expect(mockGetRelayToken).not.toHaveBeenCalled();
    });

    it('oauth·iap도 relay 자격증명으로 서명하므로 relay와 같은 답을 준다', () => {
        mockGetRelayToken.mockReturnValue(relayTokenWith(atOffset(-1_000)));

        expect(credentialFreshness.timeToExpiry('oauth', NOW)).toBe(-1_000);
        expect(credentialFreshness.timeToExpiry('iap', NOW)).toBe(-1_000);
    });

    it('세션이 없으면 null — 0이 아니다', () => {
        expect(credentialFreshness.timeToExpiry('relay', NOW)).toBeNull();
    });

    it('자격증명에 만료시각이 없으면 null', () => {
        mockGetRelayToken.mockReturnValue(relayTokenWith(undefined));

        expect(credentialFreshness.timeToExpiry('relay', NOW)).toBeNull();
    });

    it('만료시각이 파싱되지 않으면 null — NaN을 남은 시간으로 흘려보내지 않는다', () => {
        mockGetRelayToken.mockReturnValue(relayTokenWith('not-a-date'));

        expect(credentialFreshness.timeToExpiry('relay', NOW)).toBeNull();
    });
});

describe('credentialFreshness.isStale', () => {
    it('만료시각이 지났으면 true', () => {
        mockGetRelayToken.mockReturnValue(relayTokenWith(atOffset(-1)));

        expect(credentialFreshness.isStale('relay', NOW)).toBe(true);
    });

    it('1분이라도 남았으면 false — 여유 마진은 이 함수의 관심사가 아니다', () => {
        mockGetRelayToken.mockReturnValue(relayTokenWith(atOffset(60_000)));

        expect(credentialFreshness.isStale('relay', NOW)).toBe(false);
    });

    // 측정 불가를 stale로 부르면, 무서명으로 나간 요청(다른 원인·다른 처방)에 자신 있게
    // 틀린 설명을 붙이게 된다.
    it('측정할 수 없으면 false', () => {
        expect(credentialFreshness.isStale('relay', NOW)).toBe(false);
        expect(credentialFreshness.isStale('cloud', NOW)).toBe(false);
    });
});
