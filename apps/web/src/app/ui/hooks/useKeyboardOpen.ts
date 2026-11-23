import { useEffect, useState } from 'react';

export const KEYBOARD_MIN_PX = 120;

export const useKeyboardOpen = (): boolean => {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let injected = 0;
        let viewport = 0;
        const settle = () => setOpen(Math.max(injected, viewport) >= KEYBOARD_MIN_PX);

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
