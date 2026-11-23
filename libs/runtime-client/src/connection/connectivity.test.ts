import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeRuntimeConnection } from '@chatic/runtime-core/testing/connection';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import { deriveConnectivity, readOnlineSignal } from './connectivity';
import type { ConnectivitySignals } from './connectivity';

const signals = (
    over: Omit<ConnectivitySignals, 'connectionId' | 'hasVerifiedSocket'> & { hasVerifiedSocket?: boolean }
): ConnectivitySignals => ({
    connectionId: null,
    hasVerifiedSocket: over.isConnected && over.isVerified,
    ...over,
});

describe('deriveConnectivity', () => {
    it.each([
        ['connected', true, false],
        ['connecting', false, false],
        ['closed', false, false],
        ['idle', false, false],
    ] as const)(
        'reports offline when the browser is offline and no slot is verified (socket %s)',
        (state, isConnected, isVerified) => {
            expect(deriveConnectivity(signals({ isBrowserOnline: false, state, isConnected, isVerified }))).toBe(
                'offline'
            );
        }
    );

    it('reports online when the browser is stuck offline but the active socket is verified', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: false, state: 'connected', isConnected: true, isVerified: true })
            )
        ).toBe('online');
    });

    it('reports reconnecting, not offline, when the browser is stuck offline and only another slot is verified', () => {
        expect(
            deriveConnectivity(
                signals({
                    isBrowserOnline: false,
                    hasVerifiedSocket: true,
                    state: 'closed',
                    isConnected: false,
                    isVerified: false,
                })
            )
        ).toBe('reconnecting');
    });

    it.each([
        ['connecting', false, false],
        ['closing', false, false],
    ] as const)('reports reconnecting while the socket is %s and the browser is online', (state, c, v) => {
        expect(deriveConnectivity(signals({ isBrowserOnline: true, state, isConnected: c, isVerified: v }))).toBe(
            'reconnecting'
        );
    });

    it('reports reconnecting — not offline — for a closed socket while the browser is online', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: true, state: 'closed', isConnected: false, isVerified: false })
            )
        ).toBe('reconnecting');
    });

    it('reports reconnecting while connected but not yet verified', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: true, state: 'connected', isConnected: true, isVerified: false })
            )
        ).toBe('reconnecting');
    });

    it('reports online only when the socket is connected AND verified', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: true, state: 'connected', isConnected: true, isVerified: true })
            )
        ).toBe('online');
    });

    it('stays quiet on the pre-connect idle boot state', () => {
        expect(
            deriveConnectivity(signals({ isBrowserOnline: true, state: 'idle', isConnected: false, isVerified: false }))
        ).toBe('online');
    });
});

describe('readOnlineSignal', () => {
    afterEach(() => resetRuntimeEngine());

    it("reads the engine's online signal at call time", () => {
        const connection = fakeRuntimeConnection();
        connection.set({ online: true });
        initAppRuntime({ ...coreEngine, connection });

        expect(readOnlineSignal()).toBe(true);
        connection.set({ online: false });
        expect(readOnlineSignal()).toBe(false);
    });
});
