import { MemoryStore } from '@chatic/storage';

import { runtimeStores } from '../storage/runtimeStores';
import { applyPendingSyncCursorReset, getSyncCursorsValidAfter, requestSyncCursorReset } from './syncCursorWatermark';

beforeEach(() => {
    runtimeStores.reset();
    localStorage.clear();
});

describe('syncCursorWatermark', () => {
    it('trusts every cursor until a clear has asked for a reset', () => {
        applyPendingSyncCursorReset(1_000);

        expect(getSyncCursorsValidAfter()).toBe(0);
    });

    it("moves the watermark to the booting page's start time once a clear asked for it", () => {
        requestSyncCursorReset();
        // The clear's own page does not move it — the in-flight write it must cover lands later.
        expect(getSyncCursorsValidAfter()).toBe(0);

        applyPendingSyncCursorReset(5_000);

        expect(getSyncCursorsValidAfter()).toBe(5_000);
    });

    it('consumes the request, so the next boot leaves the watermark where it is', () => {
        requestSyncCursorReset();
        applyPendingSyncCursorReset(5_000);

        applyPendingSyncCursorReset(9_000);

        expect(getSyncCursorsValidAfter()).toBe(5_000);
    });

    it('reads an unreadable stored value as no watermark', () => {
        localStorage.setItem('chatic.syncCursors.validAfter', 'garbage');

        expect(getSyncCursorsValidAfter()).toBe(0);
    });

    it('keeps the watermark in whatever store the entry point gave the runtime as `device`', () => {
        const device = new MemoryStore();
        runtimeStores.configure({ device });

        requestSyncCursorReset();
        applyPendingSyncCursorReset(7_000);

        expect(device.get('chatic.syncCursors.validAfter')).toBe('7000');
        expect(localStorage.length).toBe(0);
        expect(getSyncCursorsValidAfter()).toBe(7_000);
    });

    it('keeps the request for the next boot when the watermark could not be written', () => {
        const device = new MemoryStore();
        // A full storage: the write is dropped, as the tolerant device store drops it.
        device.set = key => {
            if (key === 'chatic.syncCursors.validAfter') return;
            MemoryStore.prototype.set.call(device, key, '1');
        };
        runtimeStores.configure({ device });

        requestSyncCursorReset();
        applyPendingSyncCursorReset(7_000);

        expect(getSyncCursorsValidAfter()).toBe(0);
        expect(device.get('chatic.syncCursors.resetPending')).toBe('1');
    });
});
