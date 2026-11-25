import { useEffect, useRef } from 'react';

import type { DomainChat } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

import { useReadCursorStore } from '../stores';
import { registerLiveRead } from './liveReadRegistry';

const DEBOUNCE_MS = 500;

const maxChatNoOf = (messages: DomainChat[]): number =>
    messages.reduce(
        (max, m) =>
            !m.isPending && m.chatNo && m.chatNo !== Number.MAX_SAFE_INTEGER && m.chatNo > max ? m.chatNo : max,
        0
    );

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

export const useReadReceipts = (channelId: string | null, messages: DomainChat[], cid: string): void => {
    const lastSentRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const scheduleRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        lastSentRef.current = 0;
    }, [channelId]);

    useEffect(() => {
        if (!channelId || !cid) return;

        const unregisterLiveRead = registerLiveRead(channelId);

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
            useReadCursorStore.getState().markRead(channelId, chatNo);
            runtime.data
                .getCloudRepositories(cid)
                .join.readChat({ channelId, chatNo })
                .then(receipt => receipt.delivered)
                .catch(() => undefined);
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
            unregisterLiveRead();
            clearTimer();
            scheduleRef.current = null;
            document.removeEventListener('visibilitychange', onActivity);
            window.removeEventListener('focus', onActivity);
        };
    }, [channelId, cid]);

    useEffect(() => {
        if (!channelId) return;
        if (isWindowActive()) {
            const chatNo = maxChatNoOf(messages);
            if (chatNo > 0) useReadCursorStore.getState().markRead(channelId, chatNo);
        }
        scheduleRef.current?.();
    }, [channelId, messages]);
};
