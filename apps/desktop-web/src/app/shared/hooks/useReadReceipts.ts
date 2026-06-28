import { useEffect, useRef } from 'react';

import type { DomainChat } from '@chatic/data';
import { useRepositories } from '@chatic/app-runtime';

import { useReadCursorStore } from '../stores';

const DEBOUNCE_MS = 500;

// Exclude optimistic/pending messages: they carry a sentinel chatNo
// (Number.MAX_SAFE_INTEGER, so they sort to the bottom) which must never be sent
// as the read cursor — the server rejects it (chat.read:error). Only persisted
// messages advance the read position.
const maxChatNoOf = (messages: DomainChat[]): number =>
    messages.reduce(
        (max, m) =>
            !m.isPending && m.chatNo && m.chatNo !== Number.MAX_SAFE_INTEGER && m.chatNo > max ? m.chatNo : max,
        0
    );

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

/**
 * Read-receipt driver. When a channel is open AND the window is focused/visible,
 * reports the highest loaded chatNo to the server via join.readChat (debounced).
 *
 * - Only fires when the max chatNo increases past what we last sent (per channel).
 * - Resets the "last sent" baseline on channel switch.
 * - Re-checks on visibility/focus changes so re-focusing flushes a pending read.
 *
 * Mount this in the ChatPane with the current channel + its loaded messages.
 * No UI; returns nothing.
 */
export const useReadReceipts = (channelId: string | null, messages: DomainChat[]): void => {
    const { join: joinRepository } = useRepositories();
    const lastSentRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Keep the latest messages in a ref so the listener/flush effect does not have
    // to depend on `messages` (a fresh array every tail update) — otherwise the
    // visibility/focus listeners + debounce timer churn on every incoming message.
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const scheduleRef = useRef<(() => void) | null>(null);

    // Reset baseline when the channel changes — a fresh channel starts unsent.
    useEffect(() => {
        lastSentRef.current = 0;
    }, [channelId]);

    // Listener + debounce live only as long as the channel/repo — not per message.
    useEffect(() => {
        if (!channelId) return;

        const clearTimer = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        const flush = () => {
            if (!isWindowActive()) return;
            const chatNo = maxChatNoOf(messagesRef.current);
            if (chatNo <= lastSentRef.current) return;
            lastSentRef.current = chatNo;
            // Optimistically record our read position so the unread badge clears
            // immediately, without waiting for the server join:update round-trip.
            useReadCursorStore.getState().markRead(channelId, chatNo);
            void joinRepository.readChat({ channelId, chatNo }).catch(() => {
                // Roll back so a later attempt retries this chatNo.
                if (lastSentRef.current === chatNo) lastSentRef.current = 0;
            });
        };

        const schedule = () => {
            clearTimer();
            timerRef.current = setTimeout(flush, DEBOUNCE_MS);
        };
        scheduleRef.current = schedule;

        schedule();

        const onActivity = () => {
            if (isWindowActive()) schedule();
        };
        document.addEventListener('visibilitychange', onActivity);
        window.addEventListener('focus', onActivity);

        return () => {
            clearTimer();
            scheduleRef.current = null;
            document.removeEventListener('visibilitychange', onActivity);
            window.removeEventListener('focus', onActivity);
        };
    }, [channelId, joinRepository]);

    // On each tail update: mark read locally the instant a message arrives (while
    // focused) so the badge never flashes during the debounce, then (re)arm the
    // network flush — without tearing down the listeners above.
    useEffect(() => {
        if (!channelId) return;
        if (isWindowActive()) {
            const chatNo = maxChatNoOf(messages);
            if (chatNo > 0) useReadCursorStore.getState().markRead(channelId, chatNo);
        }
        scheduleRef.current?.();
    }, [channelId, messages]);
};
