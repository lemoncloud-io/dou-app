import type { MouseEvent } from 'react';

import { Check, Copy, TriangleAlert } from 'lucide-react';

import { useCopyFeedback, type CopyState } from '../hooks/useCopyFeedback';

const STATE_TEXT: Record<CopyState, string> = {
    idle: '복사',
    copied: '복사됨',
    failed: '복사 실패',
};

const STATE_ICON = { idle: Copy, copied: Check, failed: TriangleAlert } as const;

/**
 * The panel's copy control: one look, and it always says what happened.
 *
 * Replaces four different-looking silent buttons (a bordered one, a pill, and two bare text
 * links). The variety was drift rather than design, and a tester scanning the panel should not
 * have to learn which shape copies.
 *
 * `value` is a getter, not a string: these screens poll, so the snapshot has to be the one on
 * screen when the button was pressed rather than whatever the last render serialized.
 */
export const CopyButton = ({ value, label }: { value: () => string | null | undefined; label?: string }) => {
    const { state, copy } = useCopyFeedback();

    // Copy buttons sit inside rows that are themselves clickable (the DB browser's expander). A
    // copy should never also toggle the row it lives in.
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
            {state === 'idle' ? (label ?? STATE_TEXT.idle) : STATE_TEXT[state]}
        </button>
    );
};
