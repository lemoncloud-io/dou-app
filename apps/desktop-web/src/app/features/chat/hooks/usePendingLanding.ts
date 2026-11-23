import { useCallback, useEffect, useRef } from 'react';

export const PENDING_LANDING_TTL_MS = 30_000;

export const usePendingLanding = () => {
    const pendingChannelRef = useRef<string | null>(null);
    const pendingPlaceRef = useRef<string | null>(null);
    const awaitedPlaceRef = useRef<string | null>(null);
    const pendingJumpRef = useRef<{ channelId: string; chatNo: number; restore?: boolean } | null>(null);
    const pendingOpenAtBottomRef = useRef<string | null>(null);
    const pendingThreadRef = useRef<{ channelId: string; rootId: string } | null>(null);

    const abandonPending = useCallback(() => {
        pendingChannelRef.current = null;
        pendingPlaceRef.current = null;
        awaitedPlaceRef.current = null;
        pendingJumpRef.current = null;
        pendingThreadRef.current = null;
        pendingOpenAtBottomRef.current = null;
    }, []);

    const pendingExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const armPendingExpiry = useCallback(() => {
        if (pendingExpiryRef.current) clearTimeout(pendingExpiryRef.current);
        awaitedPlaceRef.current = null;
        pendingExpiryRef.current = setTimeout(() => {
            pendingExpiryRef.current = null;
            abandonPending();
        }, PENDING_LANDING_TTL_MS);
    }, [abandonPending]);
    useEffect(
        () => () => {
            if (pendingExpiryRef.current) clearTimeout(pendingExpiryRef.current);
        },
        []
    );

    return {
        pendingChannelRef,
        pendingPlaceRef,
        awaitedPlaceRef,
        pendingJumpRef,
        pendingOpenAtBottomRef,
        pendingThreadRef,
        armPendingExpiry,
        abandonPending,
    };
};
