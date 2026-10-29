import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainPlace } from '@chatic/data';
import type * as ChaticShared from '@chatic/shared';

import { useRailShortcuts } from './useRailShortcuts';
import type { RailCloud } from '../../../shared';
import { useComposerFocusStore } from '../../../shared';

// The stored order rides the shared `ui.railOrder` hooks; stub the config store out of the render.
const railOrder = vi.hoisted(() => ({ clouds: [] as string[], places: [] as string[], cloudId: '' }));
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<typeof ChaticShared>('@chatic/shared')),
    useCloudOrder: () => ({ storedIds: railOrder.clouds, set: vi.fn() }),
    usePlaceOrder: (cloudId: string | null) => {
        railOrder.cloudId = cloudId ?? '';
        return { storedIds: railOrder.places, set: vi.fn() };
    },
}));

// The lapsed-cloud toast is the row's own behaviour, tested with the row; here it only has to not throw.
const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

import '../../../../i18n';

const clouds: RailCloud[] = [
    { id: 'default', kind: 'home', name: 'Home' },
    { id: 'a', kind: 'owned', name: 'a' },
    { id: 'b', kind: 'owned', name: 'b' },
    { id: 'c', kind: 'invited', name: 'c' },
];

const places = [
    { id: 'p1', cid: 'a' },
    { id: 'p2', cid: 'a' },
    { id: 'p3', cid: 'a' },
] as DomainPlace[];

const press = (digit: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
    const event = new KeyboardEvent('keydown', {
        key: digit,
        code: `Digit${digit}`,
        bubbles: true,
        cancelable: true,
        ...init,
    });
    Object.defineProperty(event, 'target', { value: target });
    target.dispatchEvent(event);
    return event;
};

const renderShortcuts = (props: Partial<Parameters<typeof useRailShortcuts>[0]> = {}) => {
    const onSelectCloud = vi.fn();
    const onSelectPlace = vi.fn();
    renderHook(() =>
        useRailShortcuts({
            clouds,
            places,
            activeCloudId: 'a',
            onSelectCloud,
            onSelectPlace,
            isDefaultMode: false,
            ...props,
        })
    );
    return { onSelectCloud, onSelectPlace };
};

describe('useRailShortcuts', () => {
    beforeEach(() => {
        railOrder.clouds = [];
        railOrder.places = [];
        toast.mockClear();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    // The numbers are the rows the switcher draws, Home first; 0 still goes Home as well.
    it('counts the cloud rows from Home, and sends Mod+0 to Home too', () => {
        const { onSelectCloud } = renderShortcuts({ activeCloudId: null });
        press('1', { metaKey: true });
        expect(onSelectCloud).toHaveBeenLastCalledWith('default');
        press('0', { metaKey: true });
        expect(onSelectCloud).toHaveBeenLastCalledWith('default');
        press('3', { metaKey: true });
        expect(onSelectCloud).toHaveBeenLastCalledWith('b');
    });

    // The room that opens must not take the caret: the next chord would type into the box instead.
    it('asks the room it opens not to take the caret', () => {
        const { onSelectPlace } = renderShortcuts();
        useComposerFocusStore.getState().clearSkip();
        press('2', { metaKey: true });
        expect(useComposerFocusStore.getState().skipNext).toBe(true);
        useComposerFocusStore.getState().clearSkip();
        press('1', { shiftKey: true, key: '!' });
        expect(onSelectPlace).toHaveBeenCalled();
        expect(useComposerFocusStore.getState().skipNext).toBe(true);
    });

    it('counts the rows the reader sees, so a stored order moves the numbers with the rows', () => {
        railOrder.clouds = ['c', 'b'];
        const { onSelectCloud } = renderShortcuts();
        press('2', { ctrlKey: true });
        expect(onSelectCloud).toHaveBeenLastCalledWith('c');
        press('3', { ctrlKey: true });
        expect(onSelectCloud).toHaveBeenLastCalledWith('b');
    });

    it('leaves the cloud already open alone', () => {
        const { onSelectCloud } = renderShortcuts();
        press('2', { metaKey: true });
        expect(onSelectCloud).not.toHaveBeenCalled();
    });

    // The session names no cloud on Home, and Mod+0 there must not clear the jump origin either.
    it('treats Home as the open cloud when the session names none', () => {
        const { onSelectCloud } = renderShortcuts({ activeCloudId: null, isDefaultMode: true });
        press('1', { metaKey: true });
        expect(onSelectCloud).not.toHaveBeenCalled();
    });

    it('does not enter a cloud only a subscription can reopen', () => {
        const withLapsed: RailCloud[] = [...clouds, { id: 'lapsed', kind: 'owned', status: 'suspended' }];
        const { onSelectCloud } = renderShortcuts({ clouds: withLapsed });
        press('5', { metaKey: true });
        expect(onSelectCloud).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalled();
    });

    it('sends Shift+1… to the place tiles in the rail order', () => {
        railOrder.places = ['p2', 'p1'];
        const { onSelectPlace } = renderShortcuts();
        press('1', { shiftKey: true, key: '!' });
        expect(onSelectPlace).toHaveBeenLastCalledWith('p2');
        press('2', { shiftKey: true, key: '@' });
        expect(onSelectPlace).toHaveBeenLastCalledWith('p1');
    });

    it('does not switch place by a number while a text field is being typed in', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        const { onSelectPlace } = renderShortcuts();
        const event = press('1', { shiftKey: true, key: '!' }, input);
        expect(onSelectPlace).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('does switch cloud from a text field, where the chord types nothing', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        const { onSelectCloud } = renderShortcuts();
        press('3', { metaKey: true }, input);
        expect(onSelectCloud).toHaveBeenCalledWith('b');
    });

    it('has no place to switch to on Home, where the one tile is not a place', () => {
        const { onSelectPlace } = renderShortcuts({ isDefaultMode: true });
        press('1', { shiftKey: true, key: '!' });
        expect(onSelectPlace).not.toHaveBeenCalled();
    });

    it('is quiet for a number past the end of either list', () => {
        const { onSelectCloud, onSelectPlace } = renderShortcuts();
        const cloudKey = press('9', { metaKey: true });
        const placeKey = press('9', { shiftKey: true, key: '(' });
        expect(onSelectCloud).not.toHaveBeenCalled();
        expect(onSelectPlace).not.toHaveBeenCalled();
        expect(cloudKey.defaultPrevented).toBe(false);
        expect(placeKey.defaultPrevented).toBe(false);
    });

    it('takes no key while a dialog is open', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('data-state', 'open');
        document.body.appendChild(dialog);
        const { onSelectCloud } = renderShortcuts();
        const event = press('2', { metaKey: true });
        expect(onSelectCloud).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('takes no key while a switch is in flight', () => {
        const { onSelectCloud, onSelectPlace } = renderShortcuts({ isSwitching: true });
        press('2', { metaKey: true });
        press('1', { shiftKey: true, key: '!' });
        expect(onSelectCloud).not.toHaveBeenCalled();
        expect(onSelectPlace).not.toHaveBeenCalled();
    });

    it('ignores a held key, so holding 2 does not walk the rail', () => {
        const { onSelectCloud } = renderShortcuts();
        press('2', { metaKey: true, repeat: true });
        expect(onSelectCloud).not.toHaveBeenCalled();
    });

    it('matches neither chord when both modifiers are down', () => {
        const { onSelectCloud, onSelectPlace } = renderShortcuts();
        press('2', { metaKey: true, shiftKey: true, key: '@' });
        expect(onSelectCloud).not.toHaveBeenCalled();
        expect(onSelectPlace).not.toHaveBeenCalled();
    });

    it('ignores Alt+digit, which belongs to the sidebar chords', () => {
        const { onSelectCloud, onSelectPlace } = renderShortcuts();
        press('2', { altKey: true, metaKey: true });
        press('1', { altKey: true, shiftKey: true, key: '!' });
        expect(onSelectCloud).not.toHaveBeenCalled();
        expect(onSelectPlace).not.toHaveBeenCalled();
    });
});
