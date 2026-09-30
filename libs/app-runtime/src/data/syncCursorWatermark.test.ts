import { applyPendingSyncCursorReset, getSyncCursorsValidAfter, requestSyncCursorReset } from './syncCursorWatermark';

beforeEach(() => localStorage.clear());

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
});
