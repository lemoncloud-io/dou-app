import { render, screen } from '@testing-library/react';

import { useInitWebCore, useSessionAuth, useTokenRefresh } from '@chatic/web-core';
import { SessionGate } from './SessionGate';

jest.mock('@chatic/shared', () => ({
    LoadingFallback: () => <div data-testid="splash" />,
}));

jest.mock('@chatic/web-core', () => ({
    useInitWebCore: jest.fn(),
    useSessionAuth: jest.fn(),
    useTokenRefresh: jest.fn(),
}));

const initMock = useInitWebCore as jest.Mock;
const authMock = useSessionAuth as jest.Mock;
const tokenMock = useTokenRefresh as jest.Mock;

const setup = (opts: {
    isWebCoreReady: boolean;
    isAuthenticated: boolean;
    activeProfile: unknown;
    isInitialized?: boolean;
    initStatus?: string;
}) => {
    initMock.mockReturnValue(opts.isWebCoreReady);
    authMock.mockReturnValue({ isAuthenticated: opts.isAuthenticated, activeProfile: opts.activeProfile });
    tokenMock.mockReturnValue({ isInitialized: opts.isInitialized ?? false, initStatus: opts.initStatus ?? 'pending' });
    render(
        <SessionGate>
            <div data-testid="app" />
        </SessionGate>
    );
};

const seesApp = () => screen.queryByTestId('app') !== null;
const seesSplash = () => screen.queryByTestId('splash') !== null;

describe('SessionGate', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows splash while webCore is not ready and there is no cached profile', () => {
        setup({ isWebCoreReady: false, isAuthenticated: true, activeProfile: null });
        expect(seesSplash()).toBe(true);
        expect(seesApp()).toBe(false);
    });

    it('renders the app immediately when a cached profile exists (fast path)', () => {
        setup({ isWebCoreReady: false, isAuthenticated: true, activeProfile: { uid: 'u1' } });
        expect(seesApp()).toBe(true);
    });

    it('renders the app when webCore is ready and the session is unauthenticated', () => {
        setup({ isWebCoreReady: true, isAuthenticated: false, activeProfile: null });
        expect(seesApp()).toBe(true);
    });

    it('renders the app when ready+authenticated and token refresh has failed', () => {
        setup({
            isWebCoreReady: true,
            isAuthenticated: true,
            activeProfile: null,
            isInitialized: true,
            initStatus: 'failed',
        });
        expect(seesApp()).toBe(true);
    });

    it('keeps the splash when ready+authenticated but token refresh has not settled', () => {
        setup({
            isWebCoreReady: true,
            isAuthenticated: true,
            activeProfile: null,
            isInitialized: false,
            initStatus: 'pending',
        });
        expect(seesSplash()).toBe(true);
        expect(seesApp()).toBe(false);
    });
});
