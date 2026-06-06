import { useEffect, useRef } from 'react';

import type { DomainChat } from '@chatic/data';
import { useRepositories } from '@chatic/app-runtime';

const DEBOUNCE_MS = 500;

const maxChatNoOf = (messages: DomainChat[]): number =>
    messages.reduce((max, m) => (m.chatNo && m.chatNo > max ? m.chatNo : max), 0);

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

    // Reset baseline when the channel changes — a fresh channel starts unsent.
    useEffect(() => {
        lastSentRef.current = 0;
    }, [channelId]);

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
            const chatNo = maxChatNoOf(messages);
            if (chatNo <= lastSentRef.current) return;
            lastSentRef.current = chatNo;
            void joinRepository.readChat({ channelId, chatNo }).catch(() => {
                // Roll back so a later attempt retries this chatNo.
                if (lastSentRef.current === chatNo) lastSentRef.current = 0;
            });
        };

        const schedule = () => {
            clearTimer();
            timerRef.current = setTimeout(flush, DEBOUNCE_MS);
        };

        schedule();

        const onActivity = () => {
            if (isWindowActive()) schedule();
        };
        document.addEventListener('visibilitychange', onActivity);
        window.addEventListener('focus', onActivity);

        return () => {
            clearTimer();
            document.removeEventListener('visibilitychange', onActivity);
            window.removeEventListener('focus', onActivity);
        };
    }, [channelId, messages, joinRepository]);
};
