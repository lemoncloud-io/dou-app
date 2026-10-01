import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

const profile = vi.hoisted(() => ({ userName: '', isGuest: false }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useRuntimeProfile: () => profile } },
}));

import '../../../i18n';
import { useAccountName } from './useAccountName';

const GUEST_UUID = 'de54529d-1c2b-4f3e-9a8b-7c6d5e4f3a2b';

describe('useAccountName', () => {
    beforeEach(() => {
        profile.userName = '';
        profile.isGuest = false;
    });

    it('shows a real name as it is', () => {
        profile.userName = ' Kim ';

        expect(renderHook(() => useAccountName()).result.current).toBe('Kim');
    });

    // A guest is auto-named with a UUID; that is an id, never something to show as a name.
    it('calls a guest by what they are, not by the UUID they were auto-named with', () => {
        profile.userName = GUEST_UUID;
        profile.isGuest = true;

        expect(renderHook(() => useAccountName()).result.current).toBe('Guest');
    });

    it('leaves any other nameless account blank, for each surface to fill', () => {
        profile.userName = GUEST_UUID;

        expect(renderHook(() => useAccountName()).result.current).toBe('');
    });
});
