import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { runtime } from '@chatic/runtime';
import { useOnBackPressed } from '../bridge';
import { backIsTheAppsToSpend, useStackBack } from '../navigation';

const OPEN_DIALOG_SELECTOR =
    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]';

export const useBackHandler = () => {
    const location = useLocation();
    const backGesture = runtime.appShell.backGesture;
    const consumeBack = useStackBack();

    const reportCanGoBack = useCallback(() => {
        if (!backGesture) return;
        backGesture.setCanGoBack(backIsTheAppsToSpend(document.querySelector(OPEN_DIALOG_SELECTOR) !== null));
    }, [backGesture]);

    useEffect(() => {
        if (!backGesture) return;

        reportCanGoBack();

        const observer = new MutationObserver(() => {
            reportCanGoBack();
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-state'],
            childList: true,
            subtree: true,
        });

        return () => observer.disconnect();
    }, [location, backGesture, reportCanGoBack]);

    const closeTopOverlay = useCallback((): boolean => {
        const openDialogs = document.querySelectorAll(OPEN_DIALOG_SELECTOR);
        const topmostDialog = openDialogs[openDialogs.length - 1];
        if (!topmostDialog) return false;

        if (topmostDialog.hasAttribute('data-prevent-back-close')) return false;

        if (topmostDialog.getAttribute('role') === 'alertdialog') {
            const button = topmostDialog.querySelector('button');
            if (!(button instanceof HTMLElement)) return false;
            button.click();
            return true;
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return true;
    }, []);

    const handleNativeBack = useCallback(() => {
        const outcome = consumeBack({
            hasBlockingOverlay: document.querySelector(OPEN_DIALOG_SELECTOR) !== null,
            closeTopOverlay,
        });
        if (outcome === 'navigated') reportCanGoBack();
        return outcome;
    }, [consumeBack, closeTopOverlay, reportCanGoBack]);

    useOnBackPressed(handleNativeBack);

    return { handleNativeBack };
};
