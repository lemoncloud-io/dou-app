import { act, renderHook } from '@testing-library/react';

import { clearImageSendProgress, setImageSendProgress, useImageSendProgress } from './imageSendProgress';

describe('imageSendProgress', () => {
    afterEach(() => {
        clearImageSendProgress('row-1');
        clearImageSendProgress('row-2');
    });

    it('holds one ratio per slot, unknown until a slot reports', () => {
        const { result } = renderHook(() => useImageSendProgress('row-1'));
        expect(result.current).toBeUndefined();

        act(() => setImageSendProgress('row-1', 2, 30, 120, 3));

        expect(result.current).toEqual([undefined, undefined, 0.25]);
    });

    it('rounds down to whole percents, so a tick that moves less than one does not render', () => {
        let renders = 0;
        const { result } = renderHook(() => {
            renders += 1;
            return useImageSendProgress('row-1');
        });
        act(() => setImageSendProgress('row-1', 0, 1001, 10_000, 1));
        const afterFirst = renders;

        act(() => setImageSendProgress('row-1', 0, 1050, 10_000, 1));

        expect(result.current).toEqual([0.1]);
        expect(renders).toBe(afterFirst);
    });

    it('clamps past either end, and leaves a slot of unknown size unknown', () => {
        const { result } = renderHook(() => useImageSendProgress('row-1'));

        act(() => setImageSendProgress('row-1', 0, 500, 100, 2));
        act(() => setImageSendProgress('row-1', 1, 10, 0, 2));

        expect(result.current).toEqual([1, undefined]);
    });

    it('re-renders only the row a tick belongs to, and forgets a row when cleared', () => {
        let otherRenders = 0;
        renderHook(() => {
            otherRenders += 1;
            return useImageSendProgress('row-2');
        });
        const { result } = renderHook(() => useImageSendProgress('row-1'));
        const before = otherRenders;

        act(() => setImageSendProgress('row-1', 0, 1, 2, 1));
        expect(otherRenders).toBe(before);

        act(() => clearImageSendProgress('row-1'));
        expect(result.current).toBeUndefined();
    });

    it('reads nothing without a row id', () => {
        const { result } = renderHook(() => useImageSendProgress(undefined));
        expect(result.current).toBeUndefined();
    });
});
