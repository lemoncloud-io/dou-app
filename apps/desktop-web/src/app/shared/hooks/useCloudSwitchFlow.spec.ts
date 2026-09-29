import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
    selectedCloudId: 'A',
    switchCloud: vi.fn(),
    toast: vi.fn(),
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSwitchCloudSession: () => ({ switchCloud: session.switchCloud, isPending: false }),
            useLogoutCloudSession: () => ({ logoutCloudSession: vi.fn() }),
            useSessionSelection: () => ({ selectedCloudId: session.selectedCloudId }),
        },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: session.toast }) }));

import '../../../i18n';

import { switchCauseKey, useCloudSwitchFlow } from './useCloudSwitchFlow';

describe('switchCauseKey', () => {
    // A failed switch said only "Couldn't switch cloud", whatever went wrong.
    it.each([
        [new Error('Failed to fetch'), 'cloud.switchCause.network'],
        [new Error('403 NOT ALLOWED - cloud access'), 'cloud.switchCause.denied'],
        [new Error('404 NOT FOUND - cloud'), 'cloud.switchCause.notFound'],
        [new Error('400 INVALID - token'), 'cloud.switchCause.other'],
    ])('names the cause of %s', (error, key) => {
        expect(switchCauseKey(error)).toBe(key);
    });
});

describe('useCloudSwitchFlow retry', () => {
    // Retry ran the switch as it was when it failed, so reaching the cloud another way
    // first and then pressing Try again switched a second time and dropped the channel.
    it('does nothing once the reader is already on that cloud', async () => {
        session.switchCloud.mockRejectedValueOnce(new Error('Failed to fetch'));
        const { result, rerender } = renderHook(() => useCloudSwitchFlow());
        await act(() => result.current.switchCloud('B'));
        const action = session.toast.mock.calls[0][0].action as { props: { onClick: () => void } };
        session.selectedCloudId = 'B';
        rerender();
        await act(async () => action.props.onClick());
        expect(session.switchCloud).toHaveBeenCalledTimes(1);
    });
});
