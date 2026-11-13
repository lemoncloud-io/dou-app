import { CONNECTION_CALL_METHODS, CONNECTION_LOCAL_MEMBERS, CONNECTION_STREAMS } from '../bridge/contract';
import type { ConnectionSnapshot, RuntimeConnection } from '../connection/runtimeConnection';

/** No socket yet: idle, nothing verified — the snapshot a fresh page starts from. */
export const emptyConnectionSnapshot = (): ConnectionSnapshot => ({
    active: {
        state: 'idle',
        isConnected: false,
        isVerified: false,
        connectionId: null,
    } as ConnectionSnapshot['active'],
    verifiedSlots: [],
});

/** Sockets a test drives: `set` replaces the snapshot and tells every subscriber. */
export interface FakeRuntimeConnection extends RuntimeConnection {
    set(next: Partial<ConnectionSnapshot>): void;
}

// Every member but the view's two, from the contract's lists, so a member added there is covered here.
const MEMBERS: readonly (keyof RuntimeConnection)[] = [
    ...CONNECTION_CALL_METHODS,
    ...CONNECTION_STREAMS,
    ...CONNECTION_LOCAL_MEMBERS,
];

/**
 * Sockets for a test of something that reads or drives them through the engine — hand them to the React
 * surface in an engine (`initAppRuntime({ ...coreEngine, connection })`). The snapshot is the test's to
 * set; every other member is one the test passes, and any it did not throws, naming itself.
 */
export const fakeRuntimeConnection = (
    initial: Partial<ConnectionSnapshot> = {},
    members: Partial<RuntimeConnection> = {}
): FakeRuntimeConnection => {
    let current: ConnectionSnapshot = { ...emptyConnectionSnapshot(), ...initial };
    const listeners = new Set<() => void>();
    const unexpected = Object.fromEntries(
        MEMBERS.map(member => [
            member,
            () => {
                throw new Error(`[fakeRuntimeConnection] unexpected call: ${member}`);
            },
        ])
    ) as unknown as RuntimeConnection;
    return {
        ...unexpected,
        ...members,
        snapshot: () => current,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        set(next) {
            current = { ...current, ...next };
            for (const listener of [...listeners]) listener();
        },
    };
};
