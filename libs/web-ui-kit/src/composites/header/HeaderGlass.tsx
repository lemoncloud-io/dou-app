import { useEffect, useState } from 'react';

import { cn } from '@chatic/ui-kit';

const FADE_MS = 300;

const FADE_FALLBACK_MS = 100;

const PAGE_TRANSITION_ATTRIBUTE = 'data-page-transition';

const TRANSITION_HOLD_MAX_MS = 1500;

export const HeaderGlass = ({ className }: { className?: string }) => {
    const [frosted, setFrosted] = useState(false);

    useEffect(() => {
        const root = document.documentElement;
        const settle = () => setFrosted(true);
        let frame = 0;
        let fallback: ReturnType<typeof setTimeout> | undefined;
        let holdCap: ReturnType<typeof setTimeout> | undefined;
        let observer: MutationObserver | undefined;
        let started = false;

        const startFade = () => {
            if (started) return;
            started = true;
            observer?.disconnect();
            clearTimeout(holdCap);
            frame = requestAnimationFrame(settle);
            fallback = setTimeout(settle, FADE_FALLBACK_MS);
        };

        if (root.hasAttribute(PAGE_TRANSITION_ATTRIBUTE)) {
            observer = new MutationObserver(() => {
                if (!root.hasAttribute(PAGE_TRANSITION_ATTRIBUTE)) startFade();
            });
            observer.observe(root, { attributes: true, attributeFilter: [PAGE_TRANSITION_ATTRIBUTE] });
            holdCap = setTimeout(startFade, TRANSITION_HOLD_MAX_MS);
        } else {
            startFade();
        }

        return () => {
            observer?.disconnect();
            clearTimeout(holdCap);
            cancelAnimationFrame(frame);
            clearTimeout(fallback);
        };
    }, []);

    const fade = 'transition-opacity ease-out [will-change:opacity] motion-reduce:transition-none';

    return (
        <>
            <div
                aria-hidden
                data-testid="header-glass-warmup"
                style={{ transitionDuration: `${FADE_MS}ms` }}
                className={cn(
                    'pointer-events-none absolute inset-0 bg-surface',
                    fade,
                    frosted ? 'opacity-0' : 'opacity-100'
                )}
            />
            <div
                aria-hidden
                data-testid="header-glass-frost"
                style={{ transitionDuration: `${FADE_MS}ms` }}
                className={cn(
                    'pointer-events-none absolute inset-0 backdrop-blur-xl',
                    fade,
                    frosted ? 'opacity-100' : 'opacity-0',
                    className
                )}
            />
        </>
    );
};
