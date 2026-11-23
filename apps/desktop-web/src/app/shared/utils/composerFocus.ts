const ROOM_COMPOSER = 'main [data-composer-input]';

export const focusComposer = () => document.querySelector<HTMLElement>(ROOM_COMPOSER)?.focus({ preventScroll: true });

export const focusComposerIfDropped = () => {
    queueMicrotask(() => {
        const active = document.activeElement;
        if (!active || active === document.body) focusComposer();
    });
};
