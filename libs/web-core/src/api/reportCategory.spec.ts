import { classifyReport } from './reportCategory';

/** Build an error with an HTTP-ish shape the transport classifier understands. */
const httpError = (status: number): Error => Object.assign(new Error(`HTTP ${status}`), { status });

describe('classifyReport — 에러 리포트 카테고리 분류', () => {
    it('window.onerror에서 error가 null이면 script-error', () => {
        const cat = classifyReport(new Error('Script error.'), { source: 'window.onerror', errorWasNull: true });
        expect(cat).toBe('script-error');
    });

    it('componentStack이 있으면 react-render', () => {
        const cat = classifyReport(new Error('render boom'), { source: 'error-boundary', componentStack: '  at X' });
        expect(cat).toBe('react-render');
    });

    it('403은 auth', () => {
        expect(classifyReport(httpError(403))).toBe('auth');
    });

    it('5xx는 http-5xx', () => {
        expect(classifyReport(httpError(500))).toBe('http-5xx');
        expect(classifyReport(httpError(503))).toBe('http-5xx');
    });

    it('4xx(403 제외)는 http-4xx', () => {
        expect(classifyReport(httpError(404))).toBe('http-4xx');
        expect(classifyReport(httpError(400))).toBe('http-4xx');
    });

    it('네트워크 에러는 network', () => {
        const netErr = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        expect(classifyReport(netErr)).toBe('network');
    });

    it('rejection 채널이지만 network 성격이면 network가 우선', () => {
        const netErr = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        expect(classifyReport(netErr, { source: 'unhandledrejection' })).toBe('network');
    });

    it('성격 불명 + rejection 채널이면 unhandled-rejection', () => {
        expect(classifyReport(new Error('weird'), { source: 'unhandledrejection' })).toBe('unhandled-rejection');
    });

    it('컨텍스트도 없고 성격도 불명이면 unknown', () => {
        expect(classifyReport(new Error('mystery'))).toBe('unknown');
    });

    it('categoryOverride는 다른 모든 분류 규칙을 우회한다 (ADR-0047)', () => {
        // 감지 시점에 종류가 확정된 리포트: network 성격이어도 재분류하지 않는다.
        const netErr = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
        expect(classifyReport(netErr, { categoryOverride: 'page-crash' })).toBe('page-crash');
        expect(classifyReport(new Error('x'), { categoryOverride: 'webview-crash' })).toBe('webview-crash');
        expect(classifyReport(new Error('x'), { categoryOverride: 'native-crash' })).toBe('native-crash');
        expect(classifyReport(new Error('x'), { source: 'resource-error', categoryOverride: 'resource-error' })).toBe(
            'resource-error'
        );
        expect(classifyReport(new Error('x'), { categoryOverride: 'csp-violation' })).toBe('csp-violation');
        expect(classifyReport(new Error('x'), { categoryOverride: 'native-error' })).toBe('native-error');
    });
});
