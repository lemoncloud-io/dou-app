import type { MouseEvent } from 'react';

import { Check, Copy, TriangleAlert } from 'lucide-react';

import { useCopyFeedback, type CopyState } from '../hooks/useCopyFeedback';
import { useDebugSharedStrings } from '../i18n/screens/shared';

const STATE_ICON = { idle: Copy, copied: Check, failed: TriangleAlert } as const;

export const CopyButton = ({ value, label }: { value: () => string | null | undefined; label?: string }) => {
    const { state, copy } = useCopyFeedback();
    const strings = useDebugSharedStrings();
    const stateText: Record<CopyState, string> = strings.copy;

    const handleClick = (event: MouseEvent) => {
        event.stopPropagation();
        void copy(value());
    };

    const Icon = STATE_ICON[state];

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-live="polite"
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition-colors ${
                state === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
            }`}
        >
            <Icon size={12} />
            {state === 'idle' ? (label ?? stateText.idle) : stateText[state]}
        </button>
    );
};
