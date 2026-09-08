import { useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { PaneDivider } from './PaneDivider';
import { ThemeToggle } from './ThemeToggle';
import { PANE_LIMITS, usePaneSizes } from './usePaneSizes';

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

const PANE_HEADING = 'px-4 py-3 text-caption font-medium text-muted-foreground';

/** Which pane a narrow screen is showing. Wide screens show all three at once. */
type PaneId = 'compose' | 'message' | 'payload';

const PANES: { id: PaneId; title: string }[] = [
    { id: 'compose', title: 'Compose' },
    { id: 'message', title: 'Message' },
    { id: 'payload', title: 'Payload' },
];

interface PaneProps {
    title: string;
    children: ReactNode;
    className?: string;
    /** Controls that act on this pane's content, shown beside its heading. */
    actions?: ReactNode;
    /** False on a narrow screen when another pane is the one being shown. */
    shown: boolean;
    /** Carries the dragged width, which has no build-time class. */
    style?: CSSProperties;
}

/**
 * One column. The heading is a landmark, not decoration — three unlabelled
 * columns of similar-looking text leave the reader counting to work out which is
 * the source and which is the result. On a narrow screen the tab bar already
 * names the pane, so the heading would say it twice and is dropped.
 *
 * A pane that is not being shown is hidden rather than unmounted: the payload
 * editor holds an unparsed draft, and switching tabs is not a reason to lose it.
 *
 * The body does not scroll; its content does. All three panes have something
 * inside them that has to stay put while the rest moves — the rail's palette,
 * the payload's gutter and footer — and a scroller here would carry those away.
 */
const Pane = ({ title, children, className, actions, shown, style }: PaneProps) => (
    <section
        aria-label={title}
        style={style}
        className={cn('min-w-0 flex-col overflow-hidden', shown ? 'flex' : 'hidden lg:flex', className)}
    >
        <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-hairline pr-3 lg:flex">
            <h2 className={PANE_HEADING}>{title}</h2>
            {actions}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
);

/**
 * Compose · message · payload, side by side on a wide screen.
 *
 * Every pane sits on the well, and the message card inside the middle one is the
 * only lit surface on the screen. The boundary between "the message" and "the
 * controls that make it" is then figure against ground rather than a label
 * saying which is which — and the card's edges are where the reader is being
 * asked to look, since its width is what the message has to survive.
 *
 * All three read the same edit, so they are one row rather than tabs: the point
 * of the tool is watching the JSON and the rendered card change together.
 *
 * The two outer panes are dragged to a width and the message takes what is left,
 * because which pane deserves the room depends on the payload in front of you:
 * composing from the rail wants the rail, and checking a long payload someone
 * pasted wants the editor. Sizing the message directly would be the wrong handle
 * — it is the pane whose width is already a deliberate choice, made with the
 * Desktop/Mobile toggle against a client rather than against the window.
 *
 * Below `lg` there is no width to spend on watching two things at once, so the
 * panes become tabs. Undo/redo/clear move up beside the tabs there: they act on
 * the message from whichever pane the edit was made in, and a control that
 * disappears when you switch tabs is a control you cannot rely on.
 */
export const BuilderLayout = ({ rail, preview, previewActions, payload }: BuilderLayoutProps) => {
    const [active, setActive] = useState<PaneId>('compose');
    const { sizes, setSize } = usePaneSizes();

    return (
        <div className="flex h-[100dvh] flex-col bg-background text-foreground">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline py-1.5 pl-4 pr-2">
                <span className="text-heading">
                    DoU <span className="text-muted-foreground">Block Kit Builder</span>
                </span>
                <ThemeToggle />
            </header>

            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline pr-2 lg:hidden">
                <div role="tablist" aria-label="Builder panes" className="flex">
                    {PANES.map(pane => (
                        <button
                            key={pane.id}
                            type="button"
                            role="tab"
                            aria-selected={active === pane.id}
                            onClick={() => setActive(pane.id)}
                            className={cn(
                                'focus-ring -mb-px border-b-2 px-4 py-2.5 text-caption transition-colors ease-tactile',
                                active === pane.id
                                    ? 'border-primary font-semibold text-foreground'
                                    : 'border-transparent text-muted-foreground'
                            )}
                        >
                            {pane.title}
                        </button>
                    ))}
                </div>
                {previewActions}
            </div>

            <div className="flex min-h-0 flex-1">
                {/* The width arrives as a custom property because it is a dragged
                    pixel value and Tailwind cannot build a class for a number that
                    did not exist yet. Only `lg:w-[var(--pane-w)]` reads it, so the
                    tab layout below `lg` keeps its full width and ignores the drag. */}
                <Pane
                    title="Compose"
                    shown={active === 'compose'}
                    style={{ ['--pane-w' as string]: `${sizes.rail}px` }}
                    className="w-full shrink-0 bg-well lg:w-[var(--pane-w)]"
                >
                    {rail}
                </Pane>
                <PaneDivider
                    value={sizes.rail}
                    onValue={value => setSize('rail', value)}
                    direction={1}
                    label="the compose pane"
                    {...PANE_LIMITS.rail}
                />
                <Pane
                    title="Message"
                    shown={active === 'message'}
                    className="w-full bg-well lg:w-auto lg:flex-1"
                    actions={previewActions}
                >
                    {preview}
                </Pane>
                <PaneDivider
                    value={sizes.payload}
                    onValue={value => setSize('payload', value)}
                    direction={-1}
                    label="the payload pane"
                    {...PANE_LIMITS.payload}
                />
                <Pane
                    title="Payload"
                    shown={active === 'payload'}
                    style={{ ['--pane-w' as string]: `${sizes.payload}px` }}
                    className="w-full shrink-0 bg-well lg:w-[var(--pane-w)]"
                >
                    {payload}
                </Pane>
            </div>
        </div>
    );
};
