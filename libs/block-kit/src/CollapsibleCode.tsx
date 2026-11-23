import { useState } from 'react';

import { cn } from '@chatic/ui-kit';

import { useBlockKitLabels } from './blockKitLabels';
import { useBlockKitScale } from './blockKitScale';

const COLLAPSED_LINES = 3;

const FOLD_ABOVE = COLLAPSED_LINES + 2;

const FENCE_CLASS = 'block whitespace-pre-wrap break-words font-medium text-label';

const TOGGLE_CLASS = cn(
    'focus-ring mt-2 rounded font-bold text-label underline-offset-2',
    'transition-colors hover:text-foreground hover:underline'
);

export const CollapsibleCode = ({ text }: { text: string }) => {
    const labels = useBlockKitLabels();
    const scale = useBlockKitScale();
    const [open, setOpen] = useState(false);
    const lines = text.split('\n');
    const fence = cn(FENCE_CLASS, scale.fence);

    if (lines.length <= FOLD_ABOVE) return <span className={fence}>{text}</span>;

    return (
        <span className="block">
            <span className={fence}>{open ? text : lines.slice(0, COLLAPSED_LINES).join('\n')}</span>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className={cn(TOGGLE_CLASS, scale.toggle)}
            >
                {open ? labels.collapseCode : labels.expandCode(lines.length - COLLAPSED_LINES)}
            </button>
        </span>
    );
};
