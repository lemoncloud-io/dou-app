import { useState, type CSSProperties, type ReactNode } from 'react';

import { Toaster } from 'sonner';

import { cn } from '@chatic/lib/utils';
import { useTheme } from '@chatic/theme';

import { PaneDivider } from './PaneDivider';
import { SendToDou } from './SendToDou';
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
    /** Copy — it acts on the payload, so it sits over the payload. */
    payloadActions?: ReactNode;
}

const PANE_HEADING = 'px-4 py-3 text-caption font-medium text-muted-foreground';

/** Which pane a narrow screen is showing. Wide screens show all three at once. */
type PaneId = 'compose' | 'message' | 'payload';

/**
 * The tab bar's own wording, which is not the pane headings above.
 *
 * Three tabs share a 390px row, and "Message Preview" in that row wraps or
 * truncates. The heading has a whole column to itself and can afford the longer
 * name the design asks for.
 */
const PANES: { id: PaneId; title: string }[] = [
    { id: 'compose', title: 'Compose' },
    { id: 'message', title: 'Message' },
    { id: 'payload', title: 'Payload' },
];

interface PaneProps {
    title: string;
    /**
     * What assistive tech calls this column, when the visible heading names only
     * the first thing in it. The compose pane is headed "Template" because that
     * is where the design puts the word, but a landmark called "Template" would
     * hide the palette and the block editor living under it.
     */
    label?: string;
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
 * inside them that has to stay put while the rest moves — the rail's palette and
 * the payload's gutter — and a scroller here would carry those away.
 */
const Pane = ({ title, label, children, className, actions, shown, style }: PaneProps) => (
    <section
        aria-label={label ?? title}
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
 * Every pane sits on the well, and the middle one holds the only lit surface on
 * the screen: the stage the message stands on. The boundary between "the
 * message" and "the controls that make it" is then figure against ground rather
 * than a label saying which is which — and the card's edges are where the reader
 * is being asked to look, since its width is what the message has to survive.
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
export const BuilderLayout = ({ rail, preview, previewActions, payload, payloadActions }: BuilderLayoutProps) => {
    const [active, setActive] = useState<PaneId>('compose');
    const { sizes, setSize } = usePaneSizes();
    // The toaster follows the tool's own theme rather than the OS: this builder
    // is switched to dark to read a message against dark, and a light toast over
    // that is the one surface not answering the question being asked.
    const { isDarkTheme } = useTheme();

    return (
        <div className="flex h-[100dvh] flex-col bg-background text-foreground">
            <Toaster theme={isDarkTheme ? 'dark' : 'light'} position="bottom-right" />
            {/* DoU's own mark, as the design has it — bare, not on the lime tile the
                app icon wears. The tab gets the tile version instead, because 16px on
                a strip of someone else's colour is a different problem from 32px on
                our own header.

                Shorter than the design's 88px band: this is a three-pane tool whose
                whole value is watching a long payload and a tall card at once, and
                every row of title bar is a row the panes do not get. The design's
                frame has no browser chrome above it to pay for.

                `alt` is empty because the words beside it already say the name — a
                reader hearing both hears it twice. */}
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline py-1.5 pl-4 pr-2 lg:h-14 lg:px-5">
                <span className="flex items-center gap-2">
                    <img src="/dou-mark.png" alt="" className="h-6 w-auto shrink-0 lg:h-8" />
                    <span className="text-heading lg:text-[1.0625rem] lg:leading-6">
                        <span className="text-primary-ink">DoU</span> Block Kit Builder
                    </span>
                </span>
                <span className="flex items-center gap-1 lg:gap-3">
                    <ThemeToggle />
                    <SendToDou />
                </span>
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
                    title="Template"
                    label="Compose"
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
                    title="Message Preview"
                    label="Message"
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
                    actions={payloadActions}
                    style={{ ['--pane-w' as string]: `${sizes.payload}px` }}
                    className="w-full shrink-0 bg-well lg:w-[var(--pane-w)]"
                >
                    {payload}
                </Pane>
            </div>
        </div>
    );
};
