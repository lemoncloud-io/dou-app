import { useCallback, useLayoutEffect, useRef } from 'react';

const scrollPositions = new Map<string, number>();

export const stashScroll = (key: string, top: number): void => {
    scrollPositions.set(key, top);
};

export const takeScroll = (key: string): number | null => {
    const saved = scrollPositions.get(key);
    if (saved === undefined) return null;
    scrollPositions.delete(key);
    return saved;
};

export interface UseScrollRestorationResult {
    containerRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    hasPendingRestore: () => boolean;
    consumePendingRestore: () => void;
}

export interface UseScrollRestorationOptions {
    manualConsume?: boolean;
}

export const useScrollRestoration = (
    key: string | null | undefined,
    ready: boolean,
    options?: UseScrollRestorationOptions
): UseScrollRestorationResult => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pendingRef = useRef<{ key: string; top: number } | null>(null);
    const manualConsume = !!options?.manualConsume;

    useLayoutEffect(() => {
        if (!key) return;
        const saved = takeScroll(key);
        if (saved !== null) pendingRef.current = { key, top: saved };

        return () => {
            const unspent = pendingRef.current;
            if (unspent?.key === key && !scrollPositions.has(key)) stashScroll(key, unspent.top);
        };
    }, [key]);

    useLayoutEffect(() => {
        if (!key) return;
        const pending = pendingRef.current;
        if (!pending || pending.key !== key || !ready) return;
        const el = containerRef.current;
        if (!el) return;
        if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = pending.top;
            if (!manualConsume) pendingRef.current = null;
        }
    }, [key, ready, manualConsume]);

    const onScroll = useCallback(() => {
        if (!key) return;
        const el = containerRef.current;
        if (el) stashScroll(key, el.scrollTop);
    }, [key]);

    const hasPendingRestore = useCallback(() => !!key && pendingRef.current?.key === key, [key]);
    const consumePendingRestore = useCallback(() => {
        if (key && pendingRef.current?.key === key) pendingRef.current = null;
    }, [key]);

    return { containerRef, onScroll, hasPendingRestore, consumePendingRestore };
};
