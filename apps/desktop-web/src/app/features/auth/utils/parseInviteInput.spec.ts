import { describe, expect, it } from 'vitest';

import { isTrustedInviteBackend, parseInviteInput } from './parseInviteInput';

const CONFIGURED = ['https://api.eureka.codes/dou-d1', 'https://api.eureka.codes/d1'];

describe('parseInviteInput', () => {
    it('composes the API Gateway backend from api + stage', () => {
        expect(parseInviteInput('https://app-dev.chatic.io/s?code=invt:1:abc&api=uzjpiaey7a&stage=dev')).toEqual({
            code: 'invt:1:abc',
            backend: 'https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev',
        });
    });

    it('leaves a bare code without a backend', () => {
        expect(parseInviteInput('  invt:1:abc ')).toEqual({ code: 'invt:1:abc' });
    });
});

describe('isTrustedInviteBackend', () => {
    it('accepts the API Gateway address a server-issued invite composes', () => {
        expect(isTrustedInviteBackend('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev', [])).toBe(
            true
        );
        expect(isTrustedInviteBackend('https://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/prod/', [])).toBe(
            true
        );
    });

    it('accepts a backend this build is configured with, ignoring a trailing slash', () => {
        expect(isTrustedInviteBackend('https://api.eureka.codes/d1/', CONFIGURED)).toBe(true);
    });

    it('rejects any other server named by a backend param', () => {
        expect(isTrustedInviteBackend('https://evil.example/d1', CONFIGURED)).toBe(false);
        // Same host, different deployment path: not one this build talks to.
        expect(isTrustedInviteBackend('https://api.eureka.codes/v1', CONFIGURED)).toBe(false);
        expect(isTrustedInviteBackend('http://uzjpiaey7a.execute-api.ap-northeast-2.amazonaws.com/dev', [])).toBe(
            false
        );
        expect(isTrustedInviteBackend('https://uzjpiaey7a.execute-api.us-east-1.amazonaws.com/dev', [])).toBe(false);
    });

    it('rejects an api param crafted to move the host', () => {
        const parsed = parseInviteInput('https://app.chatic.io/s?code=invt:1:abc&api=evil.example%23&stage=dev');
        expect(parsed?.backend).toBeDefined();
        expect(isTrustedInviteBackend(parsed?.backend as string, CONFIGURED)).toBe(false);
    });

    it('does not treat an unconfigured (empty) entry as a match', () => {
        expect(isTrustedInviteBackend('', ['', ''])).toBe(false);
    });
});
