import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import { OtherCloudUnreadContext } from './otherCloudUnreadContext';
import { useOtherCloudIds, useOtherCloudUnread } from './useOtherCloudUnread';

let mockOwned: { id?: string }[] = [];
let mockInvited: { id?: string }[] = [];

jest.mock('./useCloudCatalog', () => ({ useCloudSessionCatalog: () => ({ clouds: mockOwned }) }));
jest.mock('./useInvitedClouds', () => ({ useInvitedClouds: () => ({ invitedClouds: mockInvited }) }));

beforeEach(() => {
    mockOwned = [{ id: 'cloud_1' }, { id: 'cloud_2' }];
    mockInvited = [];
});

describe('useOtherCloudIds', () => {
    it('is every owned and invited cloud plus the relay, minus the one on screen, sorted', () => {
        mockInvited = [{ id: 'invited_9' }];

        const { result } = renderHook(() => useOtherCloudIds('cloud_1'));

        expect(result.current).toEqual(['cloud_2', 'default', 'invited_9']);
    });

    it('leaves the relay out while the relay is on screen', () => {
        const { result } = renderHook(() => useOtherCloudIds('default'));

        expect(result.current).toEqual(['cloud_1', 'cloud_2']);
    });

    it('keeps the same list across renders that hand it fresh arrays with the same clouds', () => {
        const { result, rerender } = renderHook(() => useOtherCloudIds('cloud_1'));
        const first = result.current;
        mockOwned = [{ id: 'cloud_2' }, { id: 'cloud_1' }];

        rerender();

        expect(result.current).toBe(first);
    });
});

describe('useOtherCloudUnread', () => {
    it('returns the shared value as it is', () => {
        const shared = { byCloud: { cloud_2: 3 }, total: 3 };
        const wrapper = ({ children }: { children: ReactNode }) =>
            createElement(OtherCloudUnreadContext.Provider, { value: shared }, children);

        const { result } = renderHook(() => useOtherCloudUnread(), { wrapper });

        expect(result.current).toBe(shared);
    });

    it('throws without its provider', () => {
        expect(() => renderHook(() => useOtherCloudUnread())).toThrow(/OtherCloudUnreadProvider is missing/);
    });
});
