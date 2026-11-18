import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Direct file imports, not the barrels: the router mounts this outside the lazily loaded chat
// chunk, and the barrels would pull that chunk into the first load.
import { type HistoryDirection, useHistoryRequestStore } from '../stores/useHistoryRequestStore';
import { historyChord, historyMouseButton } from '../utils/historyNavigation';
import { isOverlayOpen } from '../utils/keyboard';

/**
 * Press Back or Forward, unless a dialog or menu is over the page: there it would move the page
 * out from under something the reader is still looking at. Escape is the way out of those.
 */
export const pressHistory = (direction: HistoryDirection): void => {
    if (isOverlayOpen()) return;
    useHistoryRequestStore.getState().press(direction);
};

/**
 * Whether the page before this one is still the app's. React Router numbers its own entries in
 * `history.state.idx`, from 0 for the first page it showed, and keeps the number across a reload.
 * The location's key cannot say this: a replace gives entry 0 a fresh key, and a reload keeps the
 * key of whatever page it reloaded.
 */
const hasAppHistory = (): boolean => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof idx === 'number' && idx > 0;
};

/**
 * Calls `onPress` for each press made after this mounted. A press made before it (the one that
 * brought the reader to this route, say) is not counted.
 */
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

/**
 * Router-level Back and Forward: binds Mod+[ / Mod+] and the mouse's side buttons, and on any page
 * other than home answers a press by stepping through pages. On home the press is HomePage's to
 * answer, through the channels the reader moved between. The shell's swipes and menu items arrive
 * as `chatic-ui:back` / `chatic-ui:forward` deeplinks, which the router's notification listener
 * turns into the same press.
 */
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
        // On mouseup, where Chromium would act on the button itself in a plain browser tab.
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
        // With no page ahead, navigate(1) does nothing, which is the right answer.
        if (direction === 'forward') navigate(1);
        // On the first page the app showed, stepping back would leave the app's own history.
        else if (hasAppHistory()) navigate(-1);
        else navigate('/');
    });
};
