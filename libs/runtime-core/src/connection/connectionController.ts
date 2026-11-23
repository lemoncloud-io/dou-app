import { logger } from '@chatic/logger';
import { issueCloudTokens, BackgroundCloudTokens, createSocketSessionDelegate } from '@chatic/auth';
import { backgroundClouds, isLinkKnownDown, getSocketManager } from '@chatic/transport';
import { getSyncManager, startBackgroundReceive } from '@chatic/sync';

import { currentBackgroundSelection, liveBackgroundReadiness } from './backgroundSlots';
import { subscribeSlotSignals } from './slotSignals';
import { deriveSocketSlots, hasRelaySlot } from './socketSlots';
import { SocketBinder } from './SocketBinder';
import { SocketReauthBinder } from './SocketReauthBinder';

export interface ConnectionControllerOptions {
    deviceId: () => string | null | undefined;
}

export interface ConnectionController {
    startBackground(): () => void;
    startSockets(): () => void;
    subscribeSocketPass(listener: () => void): () => void;
    getSocketPassVersion(): number;
    flushSockets(): void;
}

const guarded = (what: string, step: () => void): void => {
    try {
        step();
    } catch (error) {
        logger.error('SOCKET', `[ConnectionController] ${what} failed`, { error });
    }
};

const coalesced = (pass: () => void): (() => void) => {
    let pending = false;
    return () => {
        if (pending) return;
        pending = true;
        void Promise.resolve().then(() => {
            pending = false;
            pass();
        });
    };
};

const createTokenPreparer = (): BackgroundCloudTokens =>
    new BackgroundCloudTokens({
        ...liveBackgroundReadiness,
        issue: cid => issueCloudTokens(cid, { allowCache: false }),
        onIssued: () => backgroundClouds.invalidate(),
        takeExpired: cid => backgroundClouds.takeExpired(cid),
        isOnline: () => !isLinkKnownDown(),
        now: () => Date.now(),
        setTimer: (run, ms) => setTimeout(run, ms),
        clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });

export const createConnectionController = ({ deviceId }: ConnectionControllerOptions): ConnectionController => {
    const delegate = createSocketSessionDelegate();

    let runSocketPass: (() => void) | null = null;
    let socketPassDue = false;
    let socketPassVersion = 0;
    const socketPassListeners = new Set<() => void>();

    const flushSockets = (): void => {
        if (!socketPassDue) return;
        socketPassDue = false;
        runSocketPass?.();
    };

    const scheduleSocketPass = (): void => {
        if (socketPassDue) return;
        socketPassDue = true;
        socketPassVersion += 1;
        for (const listener of [...socketPassListeners]) listener();
        void Promise.resolve().then(flushSockets);
    };

    return {
        startBackground() {
            let stopped = false;
            const preparer = createTokenPreparer();
            const sync = () => preparer.sync(hasRelaySlot(deviceId()) ? currentBackgroundSelection() : []);
            const schedule = coalesced(() => {
                if (!stopped) guarded('background check', sync);
            });

            const unsubscribeClients = getSocketManager().subscribeSlotClients(() => guarded('background check', sync));
            const unsubscribeSignals = subscribeSlotSignals(schedule);
            const unsubscribeStore = backgroundClouds.subscribe(schedule);
            let stopReceive: (() => void) | null = null;
            const stop = () => {
                stopped = true;
                unsubscribeClients();
                unsubscribeSignals();
                unsubscribeStore();
                preparer.dispose();
                stopReceive?.();
            };

            try {
                sync();
                stopReceive = startBackgroundReceive();
            } catch (error) {
                stop();
                throw error;
            }
            return stop;
        },

        startSockets() {
            getSyncManager();

            const manager = getSocketManager();
            const binder = new SocketBinder(manager);
            const reauth = new SocketReauthBinder(manager);

            const pass = () => {
                const slots = deriveSocketSlots(deviceId());
                guarded('socket reconcile', () => binder.apply(slots, delegate));
                guarded('socket re-auth', () => reauth.apply(slots, delegate));
            };
            const run = () => guarded('socket pass', pass);
            runSocketPass = run;
            socketPassDue = false;

            const unsubscribeSignals = subscribeSlotSignals(scheduleSocketPass);
            const unsubscribeStore = backgroundClouds.subscribe(scheduleSocketPass);
            run();

            return () => {
                if (runSocketPass === run) {
                    runSocketPass = null;
                    socketPassDue = false;
                }
                unsubscribeSignals();
                unsubscribeStore();
                binder.detachAll();
            };
        },

        subscribeSocketPass(listener) {
            socketPassListeners.add(listener);
            return () => {
                socketPassListeners.delete(listener);
            };
        },

        getSocketPassVersion: () => socketPassVersion,

        flushSockets,
    };
};
