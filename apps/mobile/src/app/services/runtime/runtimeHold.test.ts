import { createRuntimeHold } from './runtimeHold';

describe('createRuntimeHold', () => {
    it('starts unheld and tells subscribers of each change, once', () => {
        const hold = createRuntimeHold();
        const listener = jest.fn();
        hold.subscribe(listener);
        expect(hold.read()).toBe(false);

        hold.set(true);
        hold.set(true);

        expect(hold.read()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops telling a subscriber that unsubscribed', () => {
        const hold = createRuntimeHold();
        const listener = jest.fn();
        const unsubscribe = hold.subscribe(listener);

        unsubscribe();
        hold.set(true);

        expect(listener).not.toHaveBeenCalled();
    });
});
