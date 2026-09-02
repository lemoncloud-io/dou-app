import { renderHook } from '@testing-library/react';

/**
 * The deadline/renew BODY lives in `@chatic/app-runtime`'s `useCloudCredentialGuard` (its own tests
 * cover the margin, the offline skip, the self-arming timer and the failure path).
 *
 * apps/web's POLICY is the one thing here: the WebView foreground trigger the hub cannot see, and
 * NOT gating it on the cloud socket — unlike the relay half, cloud renewal is a re-issue over relay
 * HTTP, so a dead cloud socket is the reason to renew rather than a reason to wait.
 */
const mockGuard = jest.fn(() => ({ check: mockCheck }));
const mockCheck = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    useCloudCredentialGuard: (...args: unknown[]) => mockGuard(...(args as [])),
}));

const foregroundHandlers: Array<() => void> = [];
jest.mock('../bridge', () => ({
    useAppForeground: (handler: () => void) => {
        foregroundHandlers.push(handler);
    },
}));

import { useCloudCredentialRenewal } from './useCloudCredentialRenewal';

const render = () => {
    foregroundHandlers.length = 0;
    mockGuard.mockClear();
    mockCheck.mockClear();
    renderHook(() => useCloudCredentialRenewal());
};

describe('useCloudCredentialRenewal — apps/web 정책', () => {
    it('포그라운드 복귀에서 검사한다 — 절전된 WebView는 타이머가 늦게 뜬다', () => {
        render();

        foregroundHandlers.forEach(h => h());

        expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    it('소켓 상태로 게이팅하지 않는다 — 죽은 클라우드 소켓이 갱신의 이유다', () => {
        render();

        expect(mockGuard).toHaveBeenCalledTimes(1);
        expect(foregroundHandlers).toHaveLength(1);
    });
});
