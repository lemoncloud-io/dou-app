import { useRestoredSignal } from './useRestoredSignal';

beforeEach(() => useRestoredSignal.setState({ lastState: undefined, restored: false }));

describe('useRestoredSignal', () => {
    it('flags a restore only after seeing the ending first', () => {
        const { observe } = useRestoredSignal.getState();

        observe('active');
        expect(useRestoredSignal.getState().restored).toBe(false);

        observe('cancelScheduled');
        observe('active');
        expect(useRestoredSignal.getState().restored).toBe(true);
    });

    it('keeps the flag through repeated observations until dismissed', () => {
        const { observe, dismiss } = useRestoredSignal.getState();
        observe('expired');
        observe('active');
        observe('active');
        expect(useRestoredSignal.getState().restored).toBe(true);

        dismiss();
        expect(useRestoredSignal.getState().restored).toBe(false);
    });
});
