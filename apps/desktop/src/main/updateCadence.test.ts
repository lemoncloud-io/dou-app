import { createUpdateCheckGate, isBusy, MIN_CHECK_GAP_MS } from './updateCadence';

/** A gate whose clock the test moves by hand. */
const gateAt = (start = 1_000_000) => {
    let time = start;
    const gate = createUpdateCheckGate({ minGapMs: MIN_CHECK_GAP_MS, now: () => time });
    return { gate, advance: (ms: number) => (time += ms) };
};

describe('createUpdateCheckGate', () => {
    it('lets the first check through', () => {
        expect(gateAt().gate.shouldCheck()).toBe(true);
    });

    it('refuses a check inside the gap and allows one at the gap', () => {
        const { gate, advance } = gateAt();
        gate.shouldCheck();
        advance(MIN_CHECK_GAP_MS - 1);
        expect(gate.shouldCheck()).toBe(false);
        advance(1);
        expect(gate.shouldCheck()).toBe(true);
    });

    it('does not move the window on a refused check', () => {
        const { gate, advance } = gateAt();
        gate.shouldCheck();
        advance(MIN_CHECK_GAP_MS / 2);
        gate.shouldCheck(); // refused — must not restart the gap
        advance(MIN_CHECK_GAP_MS / 2);
        expect(gate.shouldCheck()).toBe(true);
    });
});

describe('isBusy', () => {
    it('holds checks while an update is downloading or ready to install', () => {
        expect(isBusy('downloading')).toBe(true);
        expect(isBusy('downloaded')).toBe(true);
    });

    it('lets checks run before any status, after an offer, and after an error', () => {
        expect(isBusy(undefined)).toBe(false);
        expect(isBusy('available')).toBe(false);
        expect(isBusy('error')).toBe(false);
    });
});
