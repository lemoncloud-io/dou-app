import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { useNotificationPrefsStore } from '../../../shared';
import { useSidebarOrderStore } from '../stores';
import { useNextUnreadShortcut } from './useNextUnreadShortcut';

const channels = [
    { id: 'C1', unreadCount: 0 },
    { id: 'C2', unreadCount: 3 },
    { id: 'C3', unreadCount: 1 },
] as DomainChannel[];

const chord = (target: EventTarget = document.body) =>
    target.dispatchEvent(
        new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            altKey: true,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        })
    );

describe('useNextUnreadShortcut', () => {
    let onSelect: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        onSelect = vi.fn();
        useSidebarOrderStore.getState().setIds(['C1', 'C2', 'C3']);
        renderHook(() => useNextUnreadShortcut(channels, 'C1', onSelect));
    });
    afterEach(() => {
        useNotificationPrefsStore.setState({ channelNotify: {} });
        document.body.innerHTML = '';
    });

    // Catching up meant scanning the sidebar for dots.
    it('opens the next channel with unread', () => {
        chord();
        expect(onSelect).toHaveBeenCalledWith('C2');
    });

    it('skips a muted channel', () => {
        useNotificationPrefsStore.setState({ channelNotify: { C2: 'none' } });
        chord();
        expect(onSelect).toHaveBeenCalledWith('C3');
    });

    // The channel behind an open search or switcher changed under it.
    it('leaves the chord to a dialog that is open', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        const input = document.createElement('button');
        dialog.appendChild(input);
        document.body.appendChild(dialog);
        chord(input);
        expect(onSelect).not.toHaveBeenCalled();
    });

    // In a text field the chord extends the selection (macOS).
    it('leaves the chord to a text field, but not to the composer', () => {
        const field = document.createElement('textarea');
        document.body.appendChild(field);
        chord(field);
        expect(onSelect).not.toHaveBeenCalled();
        // jsdom has no isContentEditable, so a marked field stands in for the editor.
        const composer = document.createElement('textarea');
        composer.setAttribute('data-composer-input', '');
        document.body.appendChild(composer);
        chord(composer);
        expect(onSelect).toHaveBeenCalledWith('C2');
    });
});
