import type { ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

interface BuilderLayoutProps {
    /** Template list and the block palette. */
    rail: ReactNode;
    /** The message as a channel would draw it. */
    preview: ReactNode;
    /** Undo / redo / clear — they act on the message, so they sit over the preview. */
    previewActions?: ReactNode;
    /** The JSON the blocks compile to. */
    payload: ReactNode;
}

const PANE_HEADING = 'px-4 py-3 text-overline uppercase text-muted-foreground';

interface PaneProps {
    title: string;
    children: ReactNode;
    className?: string;
    /** Controls that act on this pane's content, shown beside its heading. */
    actions?: ReactNode;
}

/**
 * One column. The heading is a landmark, not decoration — three unlabelled
 * columns of similar-looking text leave the reader counting to work out which is
 * the source and which is the result.
 */
const Pane = ({ title, children, className, actions }: PaneProps) => (
    <section aria-label={title} className={cn('flex min-w-0 flex-col overflow-hidden', className)}>
        <div className="flex shrink-0 items-center justify-between gap-2 pr-2">
            <h2 className={PANE_HEADING}>{title}</h2>
            {actions}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
);

/**
 * Rail · preview · payload, side by side.
 *
 * All three read the same edit, so they are one row rather than tabs: the point
 * of the tool is watching the JSON and the rendered card change together. The
 * rail is fixed-width because its content is a fixed list; the other two split
 * what is left, with the preview favoured — it is the thing being judged.
 */
export const BuilderLayout = ({ rail, preview, previewActions, payload }: BuilderLayoutProps) => (
    <div className="flex h-screen flex-col bg-background text-foreground">
        <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-4 py-3">
            <span className="text-heading">
                DoU <span className="text-muted-foreground">Block Kit Builder</span>
            </span>
        </header>
        <div className="flex min-h-0 flex-1">
            <Pane title="Blocks" className="w-80 shrink-0 border-r border-hairline">
                {rail}
            </Pane>
            <Pane title="Message preview" className="flex-[3] border-r border-hairline" actions={previewActions}>
                {preview}
            </Pane>
            <Pane title="Payload" className="flex-[2] bg-well">
                {payload}
            </Pane>
        </div>
    </div>
);
