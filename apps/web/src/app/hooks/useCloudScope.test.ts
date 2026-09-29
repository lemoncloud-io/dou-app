import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { readSelectedCloudId, toCloudId, useSelectedCloudId } from './useCloudScope';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: jest.fn(),
            getGlobalSessionContext: jest.fn(),
        },
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useCloudScope', () => {
    it('names a missing or empty cloud id as the relay', () => {
        expect(toCloudId(null)).toBe('default');
        expect(toCloudId(undefined)).toBe('default');
        expect(toCloudId('')).toBe('default');
        expect(toCloudId('cloud-a')).toBe('cloud-a');
    });

    it('normalises the selected cloud', () => {
        (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: '' });

        const { result } = renderHook(() => useSelectedCloudId());

        expect(result.current).toBe('default');
    });

    it('reads the selection from the live session context, outside render', () => {
        (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: 'cloud-b' } });

        expect(readSelectedCloudId()).toBe('cloud-b');
    });
});
