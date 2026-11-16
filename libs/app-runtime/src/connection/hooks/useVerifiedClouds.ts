import { useSyncExternalStore } from 'react';

import { readConnection, subscribeConnection } from '../connectionCommands';

const readVerified = (): readonly string[] => readConnection().verifiedSlots;

/**
 * The clouds whose socket slot is bound and verified right now — the relay among them — in slot
 * order. For a consumer that works across every cloud it has a socket to, such as a resend queue that
 * may only send to a cloud whose socket can carry it. `useSlotVerified` answers the same question for
 * one slot, but a hook cannot be called once per slot of a set that changes.
 *
 * The engine keeps the list the same array until the set changes, whatever order the notifications
 * arrive in.
 */
export const useVerifiedClouds = (): readonly string[] =>
    useSyncExternalStore(subscribeConnection, readVerified, readVerified);
