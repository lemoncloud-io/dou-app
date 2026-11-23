import { useEffect, useRef } from 'react';

import type { DomainChannel } from '@chatic/runtime';

import { channelNotifyMode, isNotifyDm, useNotificationPrefsStore } from '../../../shared';
import { useSidebarOrderStore } from '../stores';
import { isTypingTarget, nextUnreadChannelId, sidebarMoveChord } from '../utils';

const ownedElsewhere = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return true;
    return isTypingTarget(target) && !target.closest('[data-composer-input]');
};

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
                        channelNotifyMode(
                            prefs,
                            channel.id ?? '',
                            joinNotify === '' ? undefined : joinNotify,
                            isNotifyDm(channel)
                        ) === 'all'
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
