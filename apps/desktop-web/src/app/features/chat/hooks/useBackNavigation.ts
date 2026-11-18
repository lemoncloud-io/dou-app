import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Direct file imports, not the barrels: the router mounts this outside the lazily loaded chat
// chunk, and the barrels would pull that chunk into the first load.
import { useBackRequestStore } from '../stores/useBackRequestStore';
import { BACK_MOUSE_BUTTON, isBackChord } from '../utils/backNavigation';
import { isOverlayOpen } from '../utils/keyboard';

/**
 * Press Back, unless a dialog or menu is over the page: there it would move the page out from
 * under something the reader is still looking at. Escape is the way out of those.
 */
export const pressBack = (): void => {
    if (isOverlayOpen()) return;
    useBackRequestStore.getState().press();
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
 * Calls `onPress` for each Back press made after this mounted. A press made before it (the one
 * that brought the reader to this route, say) is not counted.
 */
export const useBackPress = (onPress: () => void): void => {
    const nonce = useBackRequestStore(s => s.nonce);
    const seen = useRef(nonce);
    const latest = useRef(onPress);
    latest.current = onPress;
    useEffect(() => {
        if (nonce === seen.current) return;
        seen.current = nonce;
        latest.current();
    }, [nonce]);
};

/**
 * Router-level Back: binds Mod+[ and the mouse's back button, and on any page other than home
 * answers a press by stepping back a page. On home the press is HomePage's to answer, with the
 * jump's way back. The shell's swipe and menu item arrive as a `chatic-ui:back` deeplink, which
 * the router's notification listener turns into the same press.
 */
export const useBackNavigation = (): void => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing || !isBackChord(event)) return;
            event.preventDefault();
            pressBack();
        };
        // On mouseup, where Chromium would act on the button itself in a plain browser tab.
        const onMouseUp = (event: MouseEvent) => {
            if (event.button !== BACK_MOUSE_BUTTON) return;
            event.preventDefault();
            pressBack();
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    useBackPress(() => {
        if (location.pathname === '/') return;
        // On the first page the app showed, stepping back would leave the app's own history.
        if (hasAppHistory()) navigate(-1);
        else navigate('/');
    });
};
