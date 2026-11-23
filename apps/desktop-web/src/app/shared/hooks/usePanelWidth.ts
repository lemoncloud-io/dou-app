import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { deviceStore } from '../../storage';

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const KEYBOARD_STEP = 16;

export const MIN_CHAT_WIDTH = 420;
const RAIL_WIDTH = 160;

const liveWidths = new Map<string, number>();
const otherPanelsWidth = (self: string): number => {
    let sum = 0;
    liveWidths.forEach((w, key) => {
        if (key !== self) sum += w;
    });
    return sum;
};

const readPreferred = (key: string, fallback: number): number => {
    const stored = Number(deviceStore.get(key));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
};

export type PanelEdge = 'left' | 'right';

interface PanelWidthOptions {
    storageKey: string;
    defaultWidth: number;
    edge?: PanelEdge;
    minWidth?: number;
    maxWidth?: number;
}

export const usePanelWidth = ({
    storageKey,
    defaultWidth,
    edge = 'left',
    minWidth = MIN_WIDTH,
    maxWidth = MAX_WIDTH,
}: PanelWidthOptions) => {
    const clampWidth = useCallback(
        (next: number): number => {
            const room = window.innerWidth - RAIL_WIDTH - MIN_CHAT_WIDTH - otherPanelsWidth(storageKey);
            const ceiling = Math.max(minWidth, Math.min(maxWidth, room));
            return Math.min(ceiling, Math.max(minWidth, next));
        },
        [minWidth, maxWidth, storageKey]
    );
    const grow = edge === 'left' ? 1 : -1;
    const [preferred] = useState(() => readPreferred(storageKey, defaultWidth));
    const preferredRef = useRef(preferred);
    const [width, setWidth] = useState(() => clampWidth(preferred));
    const widthRef = useRef(width);
    const panelRef = useRef<HTMLElement | null>(null);
    const endDragRef = useRef<(() => void) | null>(null);

    const persist = useCallback(() => {
        preferredRef.current = widthRef.current;
        deviceStore.set(storageKey, String(widthRef.current));
    }, [storageKey]);

    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = widthRef.current;
            const onMove = (move: PointerEvent) => {
                const next = clampWidth(startWidth + grow * (startX - move.clientX));
                widthRef.current = next;
                if (panelRef.current) panelRef.current.style.width = `${next}px`;
            };
            const onUp = () => {
                endDragRef.current = null;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                document.body.style.removeProperty('user-select');
                document.body.style.removeProperty('cursor');
                setWidth(widthRef.current);
                persist();
            };
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            endDragRef.current = onUp;
        },
        [clampWidth, grow, persist]
    );

    const keyRef = useRef(storageKey);
    useLayoutEffect(() => {
        if (keyRef.current === storageKey) return;
        liveWidths.delete(keyRef.current);
        keyRef.current = storageKey;
        preferredRef.current = readPreferred(storageKey, defaultWidth);
        widthRef.current = clampWidth(preferredRef.current);
        setWidth(widthRef.current);
    }, [storageKey, defaultWidth, clampWidth]);

    useEffect(() => () => endDragRef.current?.(), []);

    useEffect(() => {
        liveWidths.set(storageKey, width);
        return () => {
            liveWidths.delete(storageKey);
        };
    }, [storageKey, width]);

    useEffect(() => {
        const onResize = () => {
            const next = clampWidth(preferredRef.current);
            if (next === widthRef.current) return;
            widthRef.current = next;
            setWidth(next);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [clampWidth]);

    const resizeByKey = useCallback(
        (event: ReactKeyboardEvent<HTMLElement>) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const step = (event.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP) * grow;
            const next = clampWidth(widthRef.current + step);
            widthRef.current = next;
            setWidth(next);
            persist();
        },
        [clampWidth, grow, persist]
    );

    return { width, minWidth, maxWidth, edge, panelRef, startResize, resizeByKey };
};

export type PanelWidth = ReturnType<typeof usePanelWidth>;
