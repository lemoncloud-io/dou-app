import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type MessageJumpOrigin, useMessageJumpStore } from '../../../shared';
import { useChannelHistoryStore } from '../stores/useChannelHistoryStore';
import { MODIFIER_HOLD_MS } from '../utils/modifierHold';
import { ShortcutHintBar } from './ShortcutHintBar';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const down = (key: string, flags: KeyboardEventInit = {}) =>
    act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, ...flags }));
    });
const up = (key: string) =>
    act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { key }));
    });
const wait = (ms: number) =>
    act(() => {
        vi.advanceTimersByTime(ms);
    });

const room: MessageJumpOrigin = {
    cloudId: 'c',
    placeId: 'p',
    channelId: 'a',
    label: '#a',
    anchorChatNo: null,
    threadRootId: null,
    sameChannel: false,
};

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <ShortcutHintBar />
        </MemoryRouter>
    );

const bar = () => screen.queryByTestId('shortcut-hint-bar');
const hint = (label: string) => screen.getByText(label).parentElement;

beforeEach(() => {
    vi.useFakeTimers();
    useChannelHistoryStore.setState({ back: [], forward: [] });
    useMessageJumpStore.setState({ origin: null });
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('ShortcutHintBar', () => {
    it('shows the Mod chords once Ctrl has been held on its own, and hides them on release', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS - 1);
        expect(bar()).toBeNull();
        wait(1);
        expect(bar()).not.toBeNull();
        expect(screen.getByText('Ctrl K')).toBeTruthy();
        expect(screen.getByText('Ctrl [')).toBeTruthy();
        up('Control');
        expect(bar()).toBeNull();
    });

    it('shows nothing when the modifier was the start of a chord', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        down('c', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS * 2);
        expect(bar()).toBeNull();
    });

    it('a held key repeating does not restart the wait', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS - 100);
        down('Control', { ctrlKey: true, repeat: true });
        wait(100);
        expect(bar()).not.toBeNull();
    });

    it('a repeat after a chord cancelled the wait starts nothing', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        down('c', { ctrlKey: true });
        down('Control', { ctrlKey: true, repeat: true });
        wait(MODIFIER_HOLD_MS * 2);
        expect(bar()).toBeNull();
    });

    it('Shift joining a held Alt cancels it', () => {
        renderAt('/');
        down('Alt', { altKey: true });
        down('Shift', { altKey: true, shiftKey: true });
        wait(MODIFIER_HOLD_MS * 2);
        expect(bar()).toBeNull();
    });

    it('hides when the page goes hidden', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(bar()).not.toBeNull();
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        visibility.mockRestore();
        expect(bar()).toBeNull();
    });

    it('hides on a click and when the window loses focus', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS);
        act(() => {
            window.dispatchEvent(new MouseEvent('mousedown'));
        });
        expect(bar()).toBeNull();
        down('Alt', { altKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(bar()).not.toBeNull();
        act(() => {
            window.dispatchEvent(new Event('blur'));
        });
        expect(bar()).toBeNull();
    });

    it('shows the Alt chords for Alt', () => {
        renderAt('/');
        down('Alt', { altKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(screen.getByText('shortcutHints.unread')).toBeTruthy();
        expect(screen.queryByText('Ctrl K')).toBeNull();
    });

    it('stays away while a dialog is open', () => {
        renderAt('/');
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('data-state', 'open');
        document.body.appendChild(dialog);
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(bar()).toBeNull();
    });

    it('fades Back and Forward on home when there is nowhere to step', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(hint('shortcutHints.back')?.dataset.idle).toBe('true');
        expect(hint('shortcutHints.forward')?.dataset.idle).toBe('true');
        act(() => {
            useChannelHistoryStore.setState({ back: [room], forward: [] });
        });
        expect(hint('shortcutHints.back')?.dataset.idle).toBeUndefined();
        expect(hint('shortcutHints.forward')?.dataset.idle).toBe('true');
    });

    it('counts a jump origin as somewhere Back goes', () => {
        useMessageJumpStore.setState({ origin: room });
        renderAt('/');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(hint('shortcutHints.back')?.dataset.idle).toBeUndefined();
    });

    it('off home, keeps Back and Forward and fades the chords only home binds', () => {
        renderAt('/settings');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(hint('shortcutHints.back')?.dataset.idle).toBeUndefined();
        expect(hint('shortcutHints.forward')?.dataset.idle).toBeUndefined();
        expect(hint('shortcutHints.all')?.dataset.idle).toBeUndefined();
        expect(hint('shortcutHints.switcher')?.dataset.idle).toBe('true');
        expect(hint('shortcutHints.messageSearch')?.dataset.idle).toBe('true');
        expect(hint('shortcutHints.cloud')?.dataset.idle).toBe('true');
    });

    it('on home, the switcher is live', () => {
        renderAt('/');
        down('Control', { ctrlKey: true });
        wait(MODIFIER_HOLD_MS);
        expect(hint('shortcutHints.switcher')?.dataset.idle).toBeUndefined();
    });
});
