import { renderHook } from '@testing-library/react';

import { useSafeAreaHandler } from './useSafeAreaHandler';

// iPhone Duo's outer display: the status bar strip is a trailing inset.
const mockInsets = { top: 0, right: 84, bottom: 20, left: 0 };

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => mockInsets,
}));

describe('useSafeAreaHandler', () => {
    it('answers FetchSafeArea with 0 for the side insets the shell already pads', async () => {
        const { result } = renderHook(() => useSafeAreaHandler());

        const res = await result.current.fetchSafeAreaInfo({ type: 'FetchSafeArea' } as any);

        expect(res).toEqual({
            type: 'OnFetchSafeArea',
            success: true,
            data: { top: 0, bottom: 20, left: 0, right: 0 },
        });
    });
});
