import { useEffect, useState } from 'react';

/** How long the pointer rests on something before its explanation shows. */
const DELAY_MS = 350;

/**
 * One tooltip for the whole page: anything with a `data-tip` explains itself when the pointer rests on
 * it. Drawn in a fixed layer of its own, so a scrolling list or a clipped card never cuts it off, and
 * placed below the element unless that would run off the screen.
 */
export const Tooltip = () => {
    const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let current: Element | null = null;
        const hide = () => {
            clearTimeout(timer);
            current = null;
            setTip(null);
        };
        const over = (event: MouseEvent) => {
            const target = (event.target as Element | null)?.closest?.('[data-tip]') ?? null;
            if (target === current) return;
            hide();
            if (!target) return;
            current = target;
            timer = setTimeout(() => {
                const text = target.getAttribute('data-tip');
                if (!text || current !== target) return;
                const box = target.getBoundingClientRect();
                const above = box.bottom + 80 > window.innerHeight;
                const x = Math.min(Math.max(box.left + box.width / 2, 140), window.innerWidth - 140);
                setTip({ text, x, y: above ? box.top - 8 : box.bottom + 8, above });
            }, DELAY_MS);
        };
        document.addEventListener('mouseover', over);
        document.addEventListener('scroll', hide, true);
        document.addEventListener('mousedown', hide);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mouseover', over);
            document.removeEventListener('scroll', hide, true);
            document.removeEventListener('mousedown', hide);
        };
    }, []);

    if (!tip) return null;
    return (
        <div
            className={`vs-tooltip ${tip.above ? 'vs-tooltip-above' : ''}`}
            role="tooltip"
            style={{ left: tip.x, top: tip.y }}
        >
            {tip.text}
        </div>
    );
};
