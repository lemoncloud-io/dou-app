import { useEffect, useState } from 'react';

/**
 * Shortest inset that counts as a keyboard. Hundreds of pixels is the real thing; the small
 * viewport deltas a browser reports for its own chrome (a collapsing URL bar, an iOS accessory
 * bar on its own) are not, and reacting to those would flicker the layout.
 */
const KEYBOARD_MIN_PX = 120;

/**
 * Whether the software keyboard is up.
 *
 * Two independent readings, because the two runtimes announce the keyboard differently and neither
 * signal exists in both:
 *
 *  - Native WebView — the shell injects `--keyboard-height` on the document root
 *    (`getSafeAreaScript`) and fires NO event at all: no `window.resize`, no `visualViewport`
 *    change. The only way to hear about it is to let layout do the listening, so an off-screen
 *    probe is sized by the variable and watched with a ResizeObserver. Same trick the chat room
 *    leans on, where the composer's own keyboard padding is what surfaces the change
 *    (`useChatScroll`).
 *  - Plain browser (mobile Safari, device mode) — no injected variable, but the visual viewport
 *    shrinks under the keyboard.
 *
 * Whichever reports more wins, so a runtime that only has one signal still works and one that has
 * both is not double-counted.
 */
export const useKeyboardOpen = (): boolean => {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let injected = 0;
        let viewport = 0;
        const settle = () => setOpen(Math.max(injected, viewport) >= KEYBOARD_MIN_PX);

        // `visibility:hidden`, never `display:none`: a hidden box is still laid out (and still
        // observed), while a displayless one has no size to report and is skipped outright.
        const probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText =
            'position:fixed;top:0;left:0;width:0;height:var(--keyboard-height,0px);pointer-events:none;visibility:hidden';
        document.body.appendChild(probe);

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                injected = entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;
            }
            settle();
        });
        observer.observe(probe, { box: 'border-box' });

        const viewportApi = window.visualViewport;
        const readViewport = () => {
            viewport = viewportApi ? Math.max(0, window.innerHeight - viewportApi.height) : 0;
            settle();
        };
        // `scroll` as well as `resize`: iOS moves the visual viewport as the keyboard settles, and
        // the height it reports mid-animation lands on the scroll event.
        viewportApi?.addEventListener('resize', readViewport);
        viewportApi?.addEventListener('scroll', readViewport);
        readViewport();

        return () => {
            observer.disconnect();
            probe.remove();
            viewportApi?.removeEventListener('resize', readViewport);
            viewportApi?.removeEventListener('scroll', readViewport);
        };
    }, []);

    return open;
};
