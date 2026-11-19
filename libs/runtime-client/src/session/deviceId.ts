import { v4 as uuidv4 } from 'uuid';

import { identityStore } from '@chatic/session';

/**
 * The page's own device id, in the session's plain port. Read-or-made and stored in one step, so a
 * second caller gets the same id rather than making its own.
 */
export const readSessionDeviceId = (): string => identityStore.getOrMakeDeviceId(() => uuidv4());

/**
 * The page's own id, read (and made) on the first call only — so a page given the shell's id never
 * touches the session's store. That matters when the session runs in the app's process: the page then
 * has no session store of its own, and reading it would throw.
 */
export const lazySessionDeviceId = (): (() => string) => {
    let id: string | undefined;
    return () => (id ??= readSessionDeviceId());
};
