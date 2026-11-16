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
    /**
     * The device id every slot is bound with. Read on each pass rather than once, because the platform
     * may hand it over after the controller was made — a page reads the phone shell's injected id.
     */
    deviceId: () => string | null | undefined;
}

/**
 * The runtime's connections, kept in line with the session without React. Each half returns its own
 * stop, and the two start at different moments on purpose:
 *
 * - **`startBackground`** runs from the moment the host exists: it keeps the background clouds'
 *   tokens ready and their receive loops running. Neither waits for session init — before a relay
 *   session there is simply nothing to prepare or receive for.
 * - **`startSockets`** runs once the session is initialised: it binds the slots the session asks for
 *   and re-authenticates a slot whose identity changes in place. Binding against an unprepared
 *   session would register with credentials that are about to be replaced.
 *
 * A socket pass that a signal makes due runs in a microtask on its own. A host that renders can run
 * it sooner, inside its own commit: it subscribes to `subscribeSocketPass`, reads
 * `getSocketPassVersion`, and calls `flushSockets` when the version moves. Whichever comes first runs
 * the pass; the other finds nothing due.
 */
export interface ConnectionController {
    startBackground(): () => void;
    startSockets(): () => void;
    /** Tells `listener`, synchronously, each time a socket pass becomes due. */
    subscribeSocketPass(listener: () => void): () => void;
    /** Moves each time a socket pass becomes due. */
    getSocketPassVersion(): number;
    /** Runs the due socket pass now, if there is one. */
    flushSockets(): void;
}

/** Runs `step`, and logs what it throws instead of letting it escape a microtask unreported. */
const guarded = (what: string, step: () => void): void => {
    try {
        step();
    } catch (error) {
        logger.error('SOCKET', `[ConnectionController] ${what} failed`, { error });
    }
};

/**
 * Runs `pass` once after the current task's synchronous work, however many times it was asked.
 *
 * A session change arrives as several signals in a row — a cloud switch moves the selection, then the
 * cloud's tokens — and a pass between two of them would see half a switch. React batched those into
 * one render before this moved out of it; a microtask gives the same one pass, as soon after the last
 * signal.
 */
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
    // One delegate for the controller's lifetime: its members are all module-level functions, and the
    // binder re-bootstraps every slot when the delegate it is handed changes.
    const delegate = createSocketSessionDelegate();

    // The socket half's due pass. `runSocketPass` belongs to the running start; it is null while the
    // socket half is stopped, and a pass made due then has nothing to run.
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
        // Listeners first: a rendering host schedules its commit from here, and that has to be queued
        // ahead of the microtask below for the pass to land inside the commit.
        for (const listener of [...socketPassListeners]) listener();
        void Promise.resolve().then(flushSockets);
    };

    return {
        /**
         * Keeps the background clouds' tokens ready before their slots boot (see `BackgroundCloudTokens`),
         * and runs the receive loops of the clouds the user is not looking at (`@chatic/sync`'s
         * `BackgroundReceiver`).
         *
         * The preparer re-checks whenever the answer could have moved: the app's list or the token cache
         * (the background store), the committed cloud and the relay token (the slot signals), and a slot
         * binding or going away — a cloud whose slot was just torn down is the preparer's again, and that
         * is decided by the manager, not by any session store. With no relay session it is handed
         * nothing, so pending retries are forgotten: every cloud token is minted from that session.
         *
         * A throw from the first check or from starting the receive loops undoes the start and is
         * rethrown to the caller; one from a later check is logged.
         */
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

        /**
         * Binds the slots the session asks for, then re-reads them whenever a slot signal or the
         * background store moves. The first pass runs before this returns, so the sockets are binding
         * by the time the caller goes on.
         */
        startSockets() {
            // The sync engine must exist BEFORE a slot binds: it attaches a device runtime per bound slot,
            // and that runtime owns the slot's connect-driven `device.save` (whose `:ok` is what opens the
            // bootstrap's auth gate). Naming it here is the guarantee. It used to be luck — the first
            // repository read built the DataManager, which built the socket runtime, which built the sync
            // manager (see `@chatic/sync`'s runtime.ts).
            getSyncManager();

            const manager = getSocketManager();
            const binder = new SocketBinder(manager);
            const reauth = new SocketReauthBinder(manager);

            // Both read the same slots. The re-auth skips a slot whose reboot key moved — the binder's
            // bootstrap registers that one — so the two never register one slot twice. Each is guarded on
            // its own: a binder that throws must not cost the re-auth its turn, or a guest→social token
            // swap in the same pass would be lost.
            const pass = () => {
                const slots = deriveSocketSlots(deviceId());
                guarded('socket reconcile', () => binder.apply(slots, delegate));
                guarded('socket re-auth', () => reauth.apply(slots, delegate));
            };
            const run = () => guarded('socket pass', pass);
            runSocketPass = run;
            // A pass made due before this start belongs to the binder that was stopped; this one starts
            // from its own first pass.
            socketPassDue = false;

            const unsubscribeSignals = subscribeSlotSignals(scheduleSocketPass);
            const unsubscribeStore = backgroundClouds.subscribe(scheduleSocketPass);
            run();

            return () => {
                // Only this start's own runner: a stop that comes after a later start must not cut it off.
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
