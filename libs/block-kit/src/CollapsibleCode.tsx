import { useState } from 'react';

import { cn } from '@chatic/lib/utils';

import { MSG_CODE_BLOCK_CLASS } from './messageClasses';

/**
 * How much of a folded block stays visible. Three lines is what the design
 * shows, and it is also the least that still says *what kind* of thing is
 * folded: a stack trace's first line is the error, and the two under it are
 * where it came from.
 */
const COLLAPSED_LINES = 3;

/**
 * Fold only when folding buys back more than the control costs. Two lines saved
 * for one line of chrome is the floor; below it the toggle makes the message
 * worse. The six-line trace in the design's error card is the first that folds,
 * which is what sets this number.
 */
const FOLD_ABOVE = COLLAPSED_LINES + 2;

const TOGGLE_CLASS = cn(
    'focus-ring mt-1 rounded text-caption text-muted-foreground underline-offset-2',
    'transition-colors hover:text-foreground hover:underline'
);

/**
 * A fenced block that folds itself when it is long.
 *
 * This is the design's `자세히 보기` / `간략히 보기`, and it is the one control in
 * a message that does not need somewhere to report a press: what it changes is
 * how much of the text is on screen, which is this reader's own business. A
 * button that had to reach a server would be an `actions` block, which the
 * server contract does not carry.
 *
 * What it folds is deliberately the fenced run rather than the whole section:
 * a fence is the only place where "too long to read inline" is a property of
 * the content instead of a guess about prose, and it is what the design folds.
 *
 * Folded lines are not rendered rather than hidden with CSS. The block scrolls
 * sideways, which rules out a line clamp, and a `max-height` would have to
 * assume a line height the theme is free to change. The cost is that a folded
 * trace is not findable by the browser's own search — one click away, and the
 * flattened copy in `blocksToPlainText` still carries the whole thing for the
 * surfaces that search.
 */
export const CollapsibleCode = ({ text }: { text: string }) => {
    const [open, setOpen] = useState(false);
    const lines = text.split('\n');

    if (lines.length <= FOLD_ABOVE) return <span className={MSG_CODE_BLOCK_CLASS}>{text}</span>;

    return (
        <span className="my-1 block">
            <span className={cn(MSG_CODE_BLOCK_CLASS, 'my-0')}>
                {open ? text : lines.slice(0, COLLAPSED_LINES).join('\n')}
            </span>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={TOGGLE_CLASS}>
                {open ? '간략히 보기' : `자세히 보기 (${lines.length - COLLAPSED_LINES}줄)`}
            </button>
        </span>
    );
};
