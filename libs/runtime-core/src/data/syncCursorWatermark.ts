import { runtimeStores } from '../storage/runtimeStores';

const PENDING_KEY = 'chatic.syncCursors.resetPending';
const VALID_AFTER_KEY = 'chatic.syncCursors.validAfter';

export const requestSyncCursorReset = (): void => {
    runtimeStores.device().set(PENDING_KEY, '1');
};

export const applyPendingSyncCursorReset = (now: number = Date.now()): void => {
    const store = runtimeStores.device();
    if (store.get(PENDING_KEY) !== '1') return;
    store.set(VALID_AFTER_KEY, String(now));
    if (store.get(VALID_AFTER_KEY) !== String(now)) return;
    store.remove(PENDING_KEY);
};

export const getSyncCursorsValidAfter = (): number => {
    const value = Number(runtimeStores.device().get(VALID_AFTER_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
};
