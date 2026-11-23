import { canRefreshThroughSocket, deriveAuthStatus, needsLivenessProbe, needsSocketKick } from './authStatus';
import type { AuthSignals, AuthStatus } from './authStatus';

const MARGIN = 5 * 60_000;

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
        expect(
            deriveAuthStatus(healthy({ hasToken: false, verifiedOnThisConnection: true, controller: 'authenticated' }))
        ).toBe('absent');
    });

    it('컨트롤러가 종단 expired면 expired — 핸드셰이크보다 우선한다', () => {
        expect(deriveAuthStatus(healthy({ controller: 'expired', verifiedOnThisConnection: false }))).toBe('expired');
        expect(deriveAuthStatus(healthy({ controller: 'expired', credentialMs: -1 }))).toBe('expired');
    });

    it('이 연결에서 미검증이면 handshaking', () => {
        expect(deriveAuthStatus(healthy({ verifiedOnThisConnection: false }))).toBe('handshaking');
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
        expect(deriveAuthStatus(healthy({ credentialMs: MARGIN }))).toBe('stale');
        expect(deriveAuthStatus(healthy({ credentialMs: MARGIN + 1 }))).toBe('verified');
        expect(deriveAuthStatus(healthy({ credentialMs: -1 }))).toBe('stale');
    });

    it('측정 불가(credentialMs null)는 fresh가 아니라 stale이다', () => {
        expect(deriveAuthStatus(healthy({ credentialMs: null }))).toBe('stale');
    });

    it('전부 건강하면 verified', () => {
        expect(deriveAuthStatus(healthy())).toBe('verified');
        expect(deriveAuthStatus(healthy({ storedSessionExpired: null }))).toBe('verified');
    });

    it('컨트롤러의 비-종단 상태들은 검증 여부로만 갈린다', () => {
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
    it('canRefreshThroughSocket 은 verified·stale 에서만 true', () => {
        const all: AuthStatus[] = ['absent', 'handshaking', 'verified', 'stale', 'expired'];
        expect(all.filter(canRefreshThroughSocket)).toEqual(['verified', 'stale']);
    });

    it('needsSocketKick 은 handshaking·expired 에서만 true', () => {
        const all: AuthStatus[] = ['absent', 'handshaking', 'verified', 'stale', 'expired'];
        expect(all.filter(needsSocketKick)).toEqual(['handshaking', 'expired']);
    });

    it('needsLivenessProbe is true for verified and stale only, the complement of the kick', () => {
        const all: AuthStatus[] = ['absent', 'handshaking', 'verified', 'stale', 'expired'];
        expect(all.filter(needsLivenessProbe)).toEqual(['verified', 'stale']);
        expect(all.filter(status => needsLivenessProbe(status) && needsSocketKick(status))).toEqual([]);
    });

    it('가드의 두 트리거가 모두 stale 하나로 모인다', () => {
        expect(deriveAuthStatus(healthy({ storedSessionExpired: true }))).toBe('stale');
        expect(deriveAuthStatus(healthy({ credentialMs: MARGIN - 1 }))).toBe('stale');
        expect(deriveAuthStatus(healthy({ credentialMs: null }))).toBe('stale');
    });
});
