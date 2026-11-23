import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { type HistoryDirection, useHistoryRequestStore } from '../stores/useHistoryRequestStore';
import { historyChord, historyMouseButton } from '../utils/historyNavigation';
import { isOverlayOpen } from '../utils/keyboard';

export const pressHistory = (direction: HistoryDirection): void => {
    if (isOverlayOpen()) return;
    useHistoryRequestStore.getState().press(direction);
};

const hasAppHistory = (): boolean => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof idx === 'number' && idx > 0;
};

export const useHistoryPress = (onPress: (direction: HistoryDirection) => void): void => {
    const nonce = useHistoryRequestStore(s => s.nonce);
    const seen = useRef(nonce);
    const latest = useRef(onPress);
    latest.current = onPress;
    useEffect(() => {
        if (nonce === seen.current) return;
        seen.current = nonce;
        latest.current(useHistoryRequestStore.getState().direction);
    }, [nonce]);
};

export const useHistoryNavigation = (): void => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing) return;
            const direction = historyChord(event);
            if (!direction) return;
            event.preventDefault();
            pressHistory(direction);
        };
        const onMouseUp = (event: MouseEvent) => {
            const direction = historyMouseButton(event.button);
            if (!direction) return;
            event.preventDefault();
            pressHistory(direction);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    useHistoryPress(direction => {
        if (location.pathname === '/') return;
        if (direction === 'forward') navigate(1);
        else if (hasAppHistory()) navigate(-1);
        else navigate('/');
    });
};
