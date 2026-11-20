import { act, renderHook } from '@testing-library/react';

import { miniApp } from '../testing/setup';
import { useMiniAppEditor } from './useMiniAppEditor';

import type { CloudMiniApps } from './useCloudMiniApps';

/** What a save sends: only what changed, and never the switch of a mini app an admin holds. */

const miniApps = (over: Partial<CloudMiniApps> = {}) =>
    ({
        cloudId: 'c1',
        isOwner: true,
        addMiniApp: jest.fn().mockResolvedValue(undefined),
        updateMiniApp: jest.fn().mockResolvedValue(undefined),
        removeMiniApp: jest.fn().mockResolvedValue(undefined),
        ...over,
    }) as unknown as CloudMiniApps;

describe('useMiniAppEditor', () => {
    it("never sends a held mini app's switch, even when the form says otherwise", async () => {
        const held = miniApp('coupon', { status: 'held', enabled: true });
        const source = miniApps();
        const { result } = renderHook(() => useMiniAppEditor(source));

        await act(() => result.current.submit({ name: 'Deals', url: held.url, enabled: false }, held));

        expect(source.updateMiniApp).toHaveBeenCalledWith('c1', 'coupon', { name: 'Deals' });
    });

    it('sends a changed switch for a mini app that is not held', async () => {
        const off = miniApp('lunch', { status: 'inactive', enabled: false });
        const source = miniApps();
        const { result } = renderHook(() => useMiniAppEditor(source));

        await act(() => result.current.submit({ name: off.name, url: off.url, enabled: true }, off));

        expect(source.updateMiniApp).toHaveBeenCalledWith('c1', 'lunch', { enabled: true });
    });

    it('sends nothing when nothing changed', async () => {
        const app = miniApp('shop');
        const source = miniApps();
        const { result } = renderHook(() => useMiniAppEditor(source));

        await act(() => result.current.submit({ name: app.name, url: app.url, enabled: app.enabled }, app));

        expect(source.updateMiniApp).not.toHaveBeenCalled();
    });

    it('adds a new one with every field', async () => {
        const source = miniApps();
        const { result } = renderHook(() => useMiniAppEditor(source));

        await act(() => result.current.submit({ name: 'Poll', url: 'https://poll.example/', enabled: false }, null));

        expect(source.addMiniApp).toHaveBeenCalledWith('c1', {
            name: 'Poll',
            url: 'https://poll.example/',
            enabled: false,
        });
    });

    it('opens the sheet for the owner only', () => {
        const { result } = renderHook(() => useMiniAppEditor(miniApps({ isOwner: false })));

        act(() => result.current.edit('new'));

        expect(result.current.editing).toBeNull();
    });
});
