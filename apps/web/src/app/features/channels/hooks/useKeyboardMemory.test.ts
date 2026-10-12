import { act, renderHook, waitFor } from '@testing-library/react';

import { injectedLength, useKeyboardMemory } from './useKeyboardMemory';

/** What the native shell does when the keyboard moves: a write to the root's inline style. */
const inject = (name: string, value: string) =>
    act(() => {
        document.documentElement.style.setProperty(name, value);
    });

afterEach(() => {
    document.documentElement.style.removeProperty('--keyboard-height');
    document.documentElement.style.removeProperty('--safe-bottom');
});

// The memory lasts for the page's life, so these run in order: the first sees a page with no keyboard.
describe('useKeyboardMemory', () => {
    it('remembers nothing where no keyboard height is injected — a browser', () => {
        const { result } = renderHook(() => useKeyboardMemory());

        expect(result.current()).toBe(0);
    });

    it('keeps the last keyboard height through the keyboard going down', async () => {
        const heard: number[] = [];
        const { result } = renderHook(() => useKeyboardMemory(height => heard.push(height)));

        inject('--keyboard-height', '336px');
        await waitFor(() => expect(heard).toContain(336));
        inject('--keyboard-height', '0px');
        await waitFor(() => expect(heard.at(-1)).toBe(0));

        expect(result.current()).toBe(336);
    });

    it('does not take an accessory bar for a keyboard', async () => {
        const { result } = renderHook(() => useKeyboardMemory());

        inject('--keyboard-height', '291px');
        expect(result.current()).toBe(291);
        inject('--keyboard-height', '55px');

        expect(result.current()).toBe(291);
    });

    it('notices a keyboard already up when it mounts', () => {
        document.documentElement.style.setProperty('--keyboard-height', '310px');

        const { result } = renderHook(() => useKeyboardMemory());
        // Gone before anything asks: only the read at mount can have kept it.
        document.documentElement.style.setProperty('--keyboard-height', '0px');

        expect(result.current()).toBe(310);
    });

    // A height seen in one room is the right guess in the next: one keyboard per device.
    it('carries the height to the next screen that asks', async () => {
        const first = renderHook(() => useKeyboardMemory());
        inject('--keyboard-height', '320px');
        // The observer hears it a microtask later.
        await act(async () => undefined);
        first.unmount();
        inject('--keyboard-height', '0px');

        const { result } = renderHook(() => useKeyboardMemory());

        expect(result.current()).toBe(320);
    });

    it('stops listening once unmounted', async () => {
        const heard: number[] = [];
        const { unmount } = renderHook(() => useKeyboardMemory(height => heard.push(height)));
        unmount();
        const before = heard.length;

        inject('--keyboard-height', '300px');
        await act(async () => undefined);

        expect(heard).toHaveLength(before);
    });
});

describe('injectedLength', () => {
    it('reads an injected px length, and 0 for one that is absent or not a number', () => {
        expect(injectedLength('--safe-bottom')).toBe(0);
        document.documentElement.style.setProperty('--safe-bottom', '34px');
        expect(injectedLength('--safe-bottom')).toBe(34);
        document.documentElement.style.setProperty('--safe-bottom', 'undefinedpx');
        expect(injectedLength('--safe-bottom')).toBe(0);
    });
});
