import { ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

const FADE = {
    rail: { top: 'bg-gradient-to-b from-rail', bottom: 'bg-gradient-to-t from-rail' },
    'rail-elevated': { top: 'bg-gradient-to-b from-rail-elevated', bottom: 'bg-gradient-to-t from-rail-elevated' },
} as const;

interface ScrollHintProps {
    edge: 'top' | 'bottom';
    /** The surface under the scroll box, so the fade blends into it. */
    surface: keyof typeof FADE;
}

/**
 * A fade with a chevron over the edge of a scroll box that has more beyond it.
 * Decorative: the tiles it points at are still in the tab order.
 */
export const ScrollHint = ({ edge, surface }: ScrollHintProps) => (
    <span
        aria-hidden
        className={cn(
            'pointer-events-none absolute inset-x-0 z-10 flex h-8 justify-center to-transparent text-rail-foreground',
            FADE[surface][edge],
            edge === 'top' ? 'top-0 items-start' : 'bottom-0 items-end'
        )}
    >
        {edge === 'top' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </span>
);
