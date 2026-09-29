import { useEffect, useRef } from 'react';

import type { DomainChannel } from '@chatic/data';

import { channelNotifyMode, useNotificationPrefsStore } from '../../../shared';
import { useSidebarOrderStore } from '../stores';
import { isTypingTarget, nextUnreadChannelId, sidebarMoveChord } from '../utils';

/** Keys pressed here belong to something else: a dialog over the app, or a field other than the composer. */
const ownedElsewhere = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return true;
    // Option+Shift+↑/↓ extends a selection in a text field. The composer is the one
    // field that gives it up, since it is where the reader sits while catching up.
    return isTypingTarget(target) && !target.closest('[data-composer-input]');
};

/**
 * Alt+Shift+↓/↑ opens the next or previous channel with unread, in the sidebar's
 * order, wrapping around. Muted channels are skipped (their unread is not asking
 * for attention), and so is a sidebar filter: the order is the whole list.
 *
 * Inside the sidebar the same chord reorders the focused row; that handler runs
 * first and claims the event.
 */
export const useNextUnreadShortcut = (
    channels: readonly DomainChannel[],
    selectedChannelId: string | null,
    onSelect: (channelId: string) => void
) => {
    const latest = useRef({ channels, selectedChannelId, onSelect });
    latest.current = { channels, selectedChannelId, onSelect };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const direction = sidebarMoveChord(event);
            if (direction === null || event.defaultPrevented || event.isComposing) return;
            if (ownedElsewhere(event.target)) return;
            const { channels: live, selectedChannelId: current, onSelect: select } = latest.current;
            const byId = new Map(live.map(channel => [channel.id ?? '', channel]));
            const prefs = useNotificationPrefsStore.getState();
            const ordered = useSidebarOrderStore
                .getState()
                .ids.flatMap(id => {
                    const channel = byId.get(id);
                    return channel ? [channel] : [];
                })
                .filter(channel => {
                    const joinNotify = channel.$join?.notify;
                    return (
                        channelNotifyMode(prefs, channel.id ?? '', joinNotify === '' ? undefined : joinNotify) === 'all'
                    );
                });
            const next = nextUnreadChannelId(ordered, current, direction);
            if (!next) return;
            event.preventDefault();
            select(next);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
};
