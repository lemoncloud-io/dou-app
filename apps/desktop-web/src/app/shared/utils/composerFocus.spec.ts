import { afterEach, describe, expect, it } from 'vitest';

import { focusComposerIfDropped } from './composerFocus';

const mountComposer = () => {
    const main = document.createElement('main');
    const composer = document.createElement('div');
    composer.setAttribute('data-composer-input', '');
    composer.tabIndex = 0;
    main.appendChild(composer);
    document.body.appendChild(main);
    return composer;
};

const flushMicrotasks = () => new Promise<void>(resolve => queueMicrotask(resolve));

describe('focusComposerIfDropped', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('moves focus to the room composer when it fell to the body', async () => {
        const composer = mountComposer();
        (document.activeElement as HTMLElement | null)?.blur();

        focusComposerIfDropped();
        await flushMicrotasks();

        expect(document.activeElement).toBe(composer);
    });

    it('leaves focus alone when it already landed on a real element', async () => {
        const composer = mountComposer();
        const opener = document.createElement('button');
        document.body.appendChild(opener);

        focusComposerIfDropped();
        // The opener return runs after the caller's handler, in the same task.
        opener.focus();
        await flushMicrotasks();

        expect(document.activeElement).toBe(opener);
        expect(document.activeElement).not.toBe(composer);
    });

    it('does nothing when no composer is on the page', async () => {
        focusComposerIfDropped();
        await flushMicrotasks();

        expect(document.activeElement).toBe(document.body);
    });
});
