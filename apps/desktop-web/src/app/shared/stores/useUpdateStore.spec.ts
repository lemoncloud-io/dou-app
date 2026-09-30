import { beforeEach, describe, expect, it } from 'vitest';

import { useUpdateStore } from './useUpdateStore';

const store = () => useUpdateStore.getState();

describe('useUpdateStore', () => {
    beforeEach(() => useUpdateStore.setState({ status: 'idle', version: undefined, percent: 0, dismissed: false }));

    // The shell re-checks the feed every 30 minutes and on focus, so the same offer arrives
    // again and again. "Later" has to hold for it.
    it('keeps "Later" when the same version is offered again', () => {
        store().set({ status: 'available', version: '0.0.15' });
        store().dismiss();
        store().set({ status: 'available', version: '0.0.15' });
        expect(store().dismissed).toBe(true);
    });

    it('shows the banner again when a newer version is offered', () => {
        store().set({ status: 'available', version: '0.0.15' });
        store().dismiss();
        store().set({ status: 'available', version: '0.0.16' });
        expect(store().dismissed).toBe(false);
    });

    it('shows the banner again when the status moves on', () => {
        store().set({ status: 'available', version: '0.0.15' });
        store().dismiss();
        store().set({ status: 'downloading', percent: 10 });
        expect(store().dismissed).toBe(false);
        expect(store().percent).toBe(10);
    });

    it('keeps the dismissal and the percent across progress ticks', () => {
        store().set({ status: 'downloading', percent: 10 });
        store().dismiss();
        store().set({ status: 'downloading', percent: 40 });
        expect(store().dismissed).toBe(true);
        expect(store().percent).toBe(40);
    });
});
