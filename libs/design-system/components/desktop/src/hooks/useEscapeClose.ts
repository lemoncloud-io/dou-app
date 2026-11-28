import { useEffect } from 'react';

const RADIX_LAYER_SELECTOR = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
    '[role="listbox"][data-state="open"]',
    '[data-radix-popper-content-wrapper]:not(:has([role="tooltip"]))',
].join(',');

const hasOpenOverlay = (): boolean => {
    try {
        return document.querySelector(RADIX_LAYER_SELECTOR) != null;
    } catch {
        return false;
    }
};

export const useEscapeClose = (close?: () => void): void => {
    useEffect(() => {
        if (!close) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (e.defaultPrevented) return;
            if (hasOpenOverlay()) return;
            close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [close]);
};
