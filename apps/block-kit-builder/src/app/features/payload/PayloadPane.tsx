import { useEffect, useMemo, useRef, useState } from 'react';

import { XCircle } from 'lucide-react';

import type { KnownBlock } from '@chatic/block-kit';
import { cn } from '@chatic/lib/utils';

import { highlightJsonLine } from './highlightJson';
import { blocksToPayloadJson, payloadJsonToBlocks, type PayloadParseFailure } from './payloadCodec';

interface PayloadPaneProps {
    /** The payload the current blocks compile to. */
    json: string;
    /** Accept an edited payload. Only called with a payload that parsed. */
    onBlocks: (blocks: KnownBlock[]) => void;
    /** Why the preview is stale, or null once the payload parses again. */
    onError: (failure: PayloadParseFailure | null) => void;
}

// One string wherever a line box is drawn. The gutter, the coloured copy and the
// textarea are three elements stacked into one grid of text, and a line that
// disagrees on height puts the numbers, the colours and the caret out of step.
const CODE = 'font-mono text-[16px] leading-relaxed lg:text-caption';

/**
 * The JSON the blocks compile to, and an editor for it.
 *
 * Editing runs both ways: the rail writes here through `json`, and a paste here
 * writes back through `onBlocks`. Pasting is the point — checking a payload
 * someone already has is a different job from composing one, and it is the one
 * this pane does better than the rail.
 *
 * The colours come from a `<pre>` underneath and the caret from a transparent
 * textarea on top. A textarea cannot hold styled text, and the alternative — a
 * contenteditable — means owning the caret, undo, IME composition and paste by
 * hand. Two elements that must agree on every glyph position is the cheaper
 * lie, and it holds as long as they share `CODE` and scroll together.
 *
 * A payload that does not parse leaves the preview alone. Blanking the message
 * on a half-typed brace would destroy the thing being edited, and every
 * keystroke in the middle of a paste is half-typed. Saying so is the preview's
 * job — the notice belongs over the stale card, not over the editor where the
 * reader can already see what they typed. What this pane owes is the location,
 * which it marks in the gutter beside the line rather than spelling out a
 * number to go hunting for.
 */
export const PayloadPane = ({ json, onBlocks, onError }: PayloadPaneProps) => {
    const [draft, setDraft] = useState(json);
    const [failure, setFailure] = useState<PayloadParseFailure | null>(null);

    // What this pane last put into the store, formatted the way the store would
    // hand it back. Without it, the effect below would reformat mid-keystroke and
    // move the caret: typing changes the blocks, which changes `json`, which would
    // look like an outside edit.
    const lastEmitted = useRef(json);

    // One writer for both copies of the state: this pane draws the gutter marker
    // from it and the preview draws the notice, and a pane that told one and not
    // the other would leave a card looking current while it is not.
    const report = (next: PayloadParseFailure | null) => {
        setFailure(next);
        onError(next);
    };

    useEffect(() => {
        if (json === lastEmitted.current) return;
        lastEmitted.current = json;
        setDraft(json);
        report(null);
        // `report` is recreated every render and calling it is the whole point of
        // this effect; listing it would run the effect on every render instead of
        // when the payload actually changed underneath.
    }, [json]);

    const edit = (value: string) => {
        setDraft(value);
        const result = payloadJsonToBlocks(value);
        if (!result.ok) {
            report(result);
            return;
        }
        report(null);
        lastEmitted.current = blocksToPayloadJson(result.blocks);
        onBlocks(result.blocks);
    };

    const lines = useMemo(() => draft.split('\n'), [draft]);

    // Neither the gutter nor the coloured copy scrolls itself; both follow the
    // textarea. Independent scrollers drift the moment one is flung, and a colour
    // or a number beside the wrong line is worse than neither.
    const gutter = useRef<HTMLDivElement>(null);
    const colours = useRef<HTMLPreElement>(null);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="relative flex min-h-0 flex-1">
                {/* The numbers themselves are hidden from assistive tech — read out
                    they are 48 announcements of nothing. The failure marker is not:
                    it is the only thing in here that says something, so it carries a
                    label and the digits beside it stay silent. */}
                <div
                    ref={gutter}
                    className={cn(CODE, 'z-10 shrink-0 select-none overflow-hidden px-2 text-right tabular-nums')}
                >
                    {lines.map((_, index) => {
                        const blamed = failure?.line === index + 1;
                        return (
                            <div
                                key={index}
                                className={cn(
                                    'flex items-center justify-end gap-1',
                                    blamed
                                        ? 'font-semibold text-[hsl(var(--code-error-line))]'
                                        : 'text-muted-foreground/40'
                                )}
                            >
                                {blamed && (
                                    <span role="img" aria-label={`Payload line ${index + 1} failed to parse`}>
                                        <XCircle size={11} className="shrink-0" />
                                    </span>
                                )}
                                <span aria-hidden>{index + 1}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="relative min-w-0 flex-1">
                    <pre
                        ref={colours}
                        aria-hidden
                        className={cn(
                            CODE,
                            'pointer-events-none absolute inset-0 m-0 overflow-hidden pr-4',
                            'text-[hsl(var(--code-punctuation))]'
                        )}
                    >
                        {lines.map((line, index) => (
                            <div
                                key={index}
                                // Sized to the longest line, not the pane, so the wash
                                // still covers the row once the payload is scrolled sideways.
                                className={
                                    failure?.line === index + 1
                                        ? 'w-max min-w-full bg-[hsl(var(--code-error-line)/0.12)]'
                                        : undefined
                                }
                            >
                                {highlightJsonLine(line)}
                            </div>
                        ))}
                    </pre>

                    <textarea
                        aria-label="Payload JSON"
                        spellCheck={false}
                        // Structure over line length. Wrapped JSON puts a continuation at
                        // column zero, where the eye reads it as a new key at the outermost
                        // level; scrolling sideways keeps the indent telling the truth.
                        wrap="off"
                        value={draft}
                        onChange={event => edit(event.target.value)}
                        onScroll={event => {
                            const { scrollTop, scrollLeft } = event.currentTarget;
                            if (gutter.current) gutter.current.scrollTop = scrollTop;
                            if (colours.current) {
                                colours.current.scrollTop = scrollTop;
                                colours.current.scrollLeft = scrollLeft;
                            }
                        }}
                        // Transparent text over the coloured copy, but a visible caret and
                        // the browser's own selection — the two things the `<pre>` cannot
                        // draw and the only reasons this element is on top.
                        // 16px on a phone for the same reason as the block fields: below
                        // that, iOS Safari zooms in on focus and stays zoomed.
                        className={cn(
                            CODE,
                            'focus-ring absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent pr-4',
                            'text-transparent caret-foreground selection:bg-primary/25'
                        )}
                    />
                </div>
            </div>
        </div>
    );
};
