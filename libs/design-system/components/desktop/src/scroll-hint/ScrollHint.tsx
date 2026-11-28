import { ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

const FADE = {
    rail: { top: 'bg-gradient-to-b from-rail', bottom: 'bg-gradient-to-t from-rail' },
} as const;

interface ScrollHintProps {
    edge: 'top' | 'bottom';
    surface: keyof typeof FADE;
}

export const ScrollHint = ({ edge, surface }: ScrollHintProps) => (
    <span
        aria-hidden
        className={cn(
            'pointer-events-none absolute inset-x-0 z-raised flex h-8 justify-center to-transparent text-rail-foreground',
            FADE[surface][edge],
            edge === 'top' ? 'top-0 items-start' : 'bottom-0 items-end'
        )}
    >
        {edge === 'top' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </span>
);
