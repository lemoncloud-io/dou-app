import { act, renderHook } from '@testing-library/react';

import { useNavigateWithTransition } from './usePageTransition';

const navigateOriginal = jest.fn();
jest.mock('@lemoncloud/react-page-transition', () => ({
    useNavigateWithTransition: () => navigateOriginal,
}));
let mockPlatform = 'ios';
jest.mock('@chatic/device-utils', () => ({
    useDeviceInfo: () => ({ deviceInfo: { platform: mockPlatform } }),
}));

const deferred = () => {
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

// Spelled out rather than imported: web-ui-kit's HeaderGlass reads this exact name and its tests pin
// the same literal, so renaming it on one side breaks a test instead of silently ending the hold.
const ATTRIBUTE = 'data-page-transition';
const marked = () => document.documentElement.hasAttribute(ATTRIBUTE);

describe('useNavigateWithTransition', () => {
    afterEach(() => {
        navigateOriginal.mockReset();
        mockPlatform = 'ios';
        document.documentElement.removeAttribute(ATTRIBUTE);
    });

    it('marks the document while the transition runs and clears it once the transition is over', async () => {
        const transition = deferred();
        navigateOriginal.mockReturnValue(transition.promise);
        const { result } = renderHook(() => useNavigateWithTransition());

        let done: Promise<void> | undefined;
        act(() => {
            done = result.current('/channels/c1/room');
        });
        // A header mounting inside the transition reads this to hold its opaque pane.
        expect(marked()).toBe(true);
        expect(navigateOriginal).toHaveBeenCalledWith('/channels/c1/room', undefined);

        await act(async () => {
            transition.resolve();
            await done;
        });
        expect(marked()).toBe(false);
    });

    it('keeps the mark until the last of two overlapping navigations has settled', async () => {
        const first = deferred();
        const second = deferred();
        navigateOriginal.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { result } = renderHook(() => useNavigateWithTransition());

        let firstDone: Promise<void> | undefined;
        let secondDone: Promise<void> | undefined;
        act(() => {
            firstDone = result.current('/a');
            secondDone = result.current('/b');
        });

        await act(async () => {
            first.resolve();
            await firstDone;
        });
        expect(marked()).toBe(true);

        await act(async () => {
            second.resolve();
            await secondDone;
        });
        expect(marked()).toBe(false);
    });

    it('clears the mark when the transition fails, so nothing is left holding on it', async () => {
        const transition = deferred();
        navigateOriginal.mockReturnValue(transition.promise);
        const { result } = renderHook(() => useNavigateWithTransition());

        let done: Promise<void> | undefined;
        act(() => {
            done = result.current(-1);
        });
        await act(async () => {
            transition.reject(new Error('transition skipped'));
            await done?.catch(() => undefined);
        });

        expect(marked()).toBe(false);
    });

    it('clears the mark and rethrows when the navigation throws before returning', () => {
        navigateOriginal.mockImplementation(() => {
            throw new Error('history push failed');
        });
        const { result } = renderHook(() => useNavigateWithTransition());

        expect(() => result.current('/a')).toThrow('history push failed');
        expect(marked()).toBe(false);
    });

    it('does not mark the document on Android, whose WebView paints the frost inside the transition', async () => {
        mockPlatform = 'android';
        const transition = deferred();
        navigateOriginal.mockReturnValue(transition.promise);
        const { result } = renderHook(() => useNavigateWithTransition());

        let done: Promise<void> | undefined;
        act(() => {
            done = result.current('/channels/c1/room');
        });
        expect(marked()).toBe(false);
        expect(navigateOriginal).toHaveBeenCalledWith('/channels/c1/room', undefined);

        await act(async () => {
            transition.resolve();
            await done;
        });
        expect(marked()).toBe(false);
    });
});
