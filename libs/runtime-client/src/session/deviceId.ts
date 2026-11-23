import { v4 as uuidv4 } from 'uuid';

import { identityStore } from '@chatic/session';

export const readSessionDeviceId = (): string => identityStore.getOrMakeDeviceId(() => uuidv4());

export const lazySessionDeviceId = (): (() => string) => {
    let id: string | undefined;
    return () => (id ??= readSessionDeviceId());
};
