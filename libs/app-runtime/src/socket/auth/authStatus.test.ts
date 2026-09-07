import { canRefreshThroughSocket, deriveAuthStatus, needsSocketKick } from './authStatus';
import type { AuthSignals, AuthStatus } from './authStatus';

const MARGIN = 5 * 60_000;

/** A healthy, comfortably-fresh slot. Each case overrides only the field it is about. */
const healthy = (over: Partial<AuthSignals> = {}): AuthSignals => ({
    hasToken: true,
    verifiedOnThisConnection: true,
    controller: 'authenticated',
    credentialMs: 30 * 60_000,
    marginMs: MARGIN,
    storedSessionExpired: false,
    ...over,
});

describe('deriveAuthStatus — 진리표 (ADR-0076 결정 1)', () => {
    it('토큰이 없으면 absent — 소켓이 무슨 말을 하든', () => {
        expect(deriveAuthStatus(healthy({ hasToken: false }))).toBe('absent');
        // Even a fully verified socket cannot outvote "there is no token to authenticate".
        expect(
            deriveAuthStatus(healthy({ hasToken: false, verifiedOnThisConnection: true, controller: 'authenticated' }))
        ).toBe('absent');
    });

    it('컨트롤러가 종단 expired면 expired — 핸드셰이크보다 우선한다', () => {
        expect(deriveAuthStatus(healthy({ controller: 'expired', verifiedOnThisConnection: false }))).toBe('expired');
        // The zombie shape: token in the store, controller gave up. Reporting `handshaking` here
        // would promise a handshake that will never be attempted.
        expect(deriveAuthStatus(healthy({ controller: 'expired', credentialMs: -1 }))).toBe('expired');
    });

    it('이 연결에서 미검증이면 handshaking', () => {
        expect(deriveAuthStatus(healthy({ verifiedOnThisConnection: false }))).toBe('handshaking');
        // Controller state alone does not rescue it: after a transport drop the SDK still reports
        // `authenticated` from the connection that died, which is why isKindVerified is the input.
        expect(deriveAuthStatus(healthy({ verifiedOnThisConnection: false, controller: 'authenticated' }))).toBe(
            'handshaking'
        );
        expect(deriveAuthStatus(healthy({ verifiedOnThisConnection: false, controller: null }))).toBe('handshaking');
    });

    it('저장된 세션 시계가 만료면 stale — 자격증명이 멀쩡해 보여도', () => {
        expect(deriveAuthStatus(healthy({ storedSessionExpired: true }))).toBe('stale');
        expect(deriveAuthStatus(healthy({ storedSessionExpired: true, credentialMs: 60 * 60_000 }))).toBe('stale');
    });

    it('자격증명이 마진 이하면 stale, 경계값 포함', () => {
        expect(deriveAuthStatus(healthy({ credentialMs: MARGIN - 1 }))).toBe('stale');
        expect(deriveAuthStatus(healthy({ credentialMs: MARGIN }))).toBe('stale'); // 경계는 stale 쪽
        expect(deriveAuthStatus(healthy({ credentialMs: MARGIN + 1 }))).toBe('verified');
        expect(deriveAuthStatus(healthy({ credentialMs: -1 }))).toBe('stale'); // 이미 지났다
    });

    it('측정 불가(credentialMs null)는 fresh가 아니라 stale이다', () => {
        // Guessing "fresh" with nothing to read is the direction that 403s. The pre-existing relay
        // guard made the same call (`remaining == null` → credentialRunningOut).
        expect(deriveAuthStatus(healthy({ credentialMs: null }))).toBe('stale');
    });

    it('전부 건강하면 verified', () => {
        expect(deriveAuthStatus(healthy())).toBe('verified');
        // `storedSessionExpired: null` means "not measured" (cloud) — it must not read as expired.
        expect(deriveAuthStatus(healthy({ storedSessionExpired: null }))).toBe('verified');
    });

    it('컨트롤러의 비-종단 상태들은 검증 여부로만 갈린다', () => {
        // `disconnected` is in the SDK type but the controller never emits it (SDK dist confirmed),
        // so it must not get a branch of its own — it lands wherever verification puts it.
        const nonTerminal = ['', 'pending', 'validating', 'authenticated', 'failed', 'disconnected'] as const;
        for (const controller of nonTerminal) {
            expect(deriveAuthStatus(healthy({ controller, verifiedOnThisConnection: false }))).toBe('handshaking');
        }
        for (const controller of nonTerminal) {
            expect(deriveAuthStatus(healthy({ controller }))).toBe('verified');
        }
    });
});

describe('deriveAuthStatus — 기존 판정 사본과의 동등성 (이관 전 잠금)', () => {
    // requestRelaySessionRefresh 의 사전 조건: client && auth && connected && authenticated &&
    // isKindVerified. 그 조합이 통과시키던 상태가 정확히 verified/stale 둘이다.
    it('canRefreshThroughSocket 은 verified·stale 에서만 true', () => {
        const all: AuthStatus[] = ['absent', 'handshaking', 'verified', 'stale', 'expired'];
        expect(all.filter(canRefreshThroughSocket)).toEqual(['verified', 'stale']);
    });

    // recoverUnverifiedSockets 의 조건: 슬롯이 바인딩됐고 !isKindVerified 면 킥. 바인딩됐다는 것은
    // 토큰이 있다는 뜻(바인딩이 identityToken 에 걸려 있다)이므로 absent 는 애초에 오지 않는다.
    it('needsSocketKick 은 handshaking·expired 에서만 true', () => {
        const all: AuthStatus[] = ['absent', 'handshaking', 'verified', 'stale', 'expired'];
        expect(all.filter(needsSocketKick)).toEqual(['handshaking', 'expired']);
    });

    // useSessionStalenessGuard 의 두 트리거(저장 세션 만료 · 자격증명 마진 이하)가 한 상태로 모인다.
    it('가드의 두 트리거가 모두 stale 하나로 모인다', () => {
        expect(deriveAuthStatus(healthy({ storedSessionExpired: true }))).toBe('stale');
        expect(deriveAuthStatus(healthy({ credentialMs: MARGIN - 1 }))).toBe('stale');
        expect(deriveAuthStatus(healthy({ credentialMs: null }))).toBe('stale');
    });
});
