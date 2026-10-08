import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@chatic/app-runtime', () => ({ runtime: {} }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@chatic/config', () => ({
    config: { get: (key: string) => (key === 'net.socialOauth.endpoint' ? 'https://relay.example' : undefined) },
}));

import '../../../../i18n';
import { setStorageAdapter } from '@chatic/shared';

import { OAUTH_LOGIN_START_TTL_MS, takeOAuthLoginStart } from '../utils';
import { useSocialLogin } from './useSocialLogin';

describe('useSocialLogin.start', () => {
    const open = vi.fn();

    beforeEach(() => {
        // The shell's persistent backing, as main.tsx wires it.
        setStorageAdapter(localStorage);
        localStorage.clear();
        open.mockReset();
        vi.stubGlobal('open', open);
    });

    it('records the start before opening the browser', () => {
        let recordedAtOpen: unknown = null;
        open.mockImplementation(() => {
            recordedAtOpen = JSON.parse(localStorage.getItem('chatic-oauth-login-start') ?? 'null');
        });
        const { result } = renderHook(() => useSocialLogin());

        act(() => result.current.start('google'));

        expect(recordedAtOpen).toMatchObject({ provider: 'google' });
        expect(open).toHaveBeenCalledWith(expect.stringContaining('/oauth/google/authorize?redirect='), '_blank');
    });

    it('stamps a start that is fresh and has a nonce, without sending the nonce to the relay yet', () => {
        const before = Date.now();
        const { result } = renderHook(() => useSocialLogin());

        act(() => result.current.start('google'));

        const record = takeOAuthLoginStart();
        expect(record?.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(record!.startedAt).toBeGreaterThanOrEqual(before);
        expect(record!.startedAt).toBeLessThan(before + OAUTH_LOGIN_START_TTL_MS);
        expect(String(open.mock.calls[0][0])).not.toContain(record!.nonce);
    });

    it('replaces an earlier start, so only the latest login can be completed', () => {
        const { result } = renderHook(() => useSocialLogin());

        act(() => result.current.start('google'));
        const first = JSON.parse(localStorage.getItem('chatic-oauth-login-start') ?? 'null');
        act(() => result.current.start('google'));

        expect(takeOAuthLoginStart()?.nonce).not.toBe(first.nonce);
    });
});
