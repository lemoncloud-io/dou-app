import { CONNECTION_CALL_METHODS, CONNECTION_LOCAL_MEMBERS, CONNECTION_STREAMS } from '../../remote/contract';
import type { ConnectionSnapshot, RuntimeConnection } from '../connection/runtimeConnection';

export const emptyConnectionSnapshot = (): ConnectionSnapshot => ({
    active: {
        state: 'idle',
        isConnected: false,
        isVerified: false,
        connectionId: null,
    } as ConnectionSnapshot['active'],
    verifiedSlots: [],
    online: true,
});

export interface FakeRuntimeConnection extends RuntimeConnection {
    set(next: Partial<ConnectionSnapshot>): void;
}

const MEMBERS: readonly (keyof RuntimeConnection)[] = [
    ...CONNECTION_CALL_METHODS,
    ...CONNECTION_STREAMS,
    ...CONNECTION_LOCAL_MEMBERS,
];

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
