import { nativeForegroundPorts } from './foreground';

import type { AppStateSource } from './foreground';

jest.mock('react-native', () => ({ AppState: {} }));

/** An `AppState` stand-in whose state and `change` events the test sets. */
const fakeAppState = (initial: string | null) => {
    const handlers = new Set<() => void>();
    const remove = jest.fn();
    const source = {
        currentState: initial,
        addEventListener: jest.fn((_type: string, handler: () => void) => {
            handlers.add(handler);
            remove.mockImplementation(() => handlers.delete(handler));
            return { remove };
        }),
    };
    const change = (next: string) => {
        source.currentState = next;
        handlers.forEach(handler => handler());
    };
    return { source: source as unknown as AppStateSource, change, remove };
};

describe('nativeForegroundPorts', () => {
    it.each([
        ['active', true],
        ['inactive', true],
        ['unknown', true],
        [null, true],
        ['background', false],
    ])('reads AppState %p as in front: %p', (state, expected) => {
        expect(nativeForegroundPorts(fakeAppState(state).source).read()).toBe(expected);
    });

    it('tells the subscriber when the app goes to the background and when it comes back', () => {
        const appState = fakeAppState('active');
        const ports = nativeForegroundPorts(appState.source);
        const listener = jest.fn();
        ports.subscribe(listener);

        appState.change('background');
        expect(ports.read()).toBe(false);
        expect(listener).toHaveBeenCalledTimes(1);

        appState.change('active');
        expect(ports.read()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('stays quiet while the app only goes inactive and back, as under the control centre', () => {
        const appState = fakeAppState('active');
        const listener = jest.fn();
        nativeForegroundPorts(appState.source).subscribe(listener);

        appState.change('inactive');
        appState.change('active');

        expect(listener).not.toHaveBeenCalled();
    });

    it('counts a return from the background through inactive once', () => {
        const appState = fakeAppState('background');
        const listener = jest.fn();
        nativeForegroundPorts(appState.source).subscribe(listener);

        appState.change('inactive');
        appState.change('active');

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops telling the subscriber once it unsubscribes', () => {
        const appState = fakeAppState('active');
        const listener = jest.fn();
        const unsubscribe = nativeForegroundPorts(appState.source).subscribe(listener);

        unsubscribe();
        appState.change('background');

        expect(appState.remove).toHaveBeenCalledTimes(1);
        expect(listener).not.toHaveBeenCalled();
    });
});
