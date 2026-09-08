import { useEffect, useMemo, useRef, useState } from 'react';

import { AlertTriangle, Check, Copy } from 'lucide-react';

import type { KnownBlock } from '@chatic/block-kit';
import { cn } from '@chatic/lib/utils';

import { blocksToPayloadJson, payloadJsonToBlocks } from './payloadCodec';

interface PayloadPaneProps {
    /** The payload the current blocks compile to. */
    json: string;
    /** Accept an edited payload. Only called with a payload that parsed. */
    onBlocks: (blocks: KnownBlock[]) => void;
}

// One string for the gutter and the editor: they are two elements drawing one
// grid of text, and a line that disagrees on height puts the numbers out of step
// with what they count.
const CODE = 'font-mono text-[16px] leading-relaxed lg:text-caption';

/**
 * The JSON the blocks compile to, and an editor for it.
 *
 * Editing runs both ways: the rail writes here through `json`, and a paste here
 * writes back through `onBlocks`. Pasting is the point — checking a payload
 * someone already has is a different job from composing one, and it is the one
 * this pane does better than the rail.
 *
 * A payload that does not parse leaves the preview alone and shows why. Blanking
 * the message on a half-typed brace would destroy the thing being edited, and
 * every keystroke in the middle of a paste is half-typed.
 */
export const PayloadPane = ({ json, onBlocks }: PayloadPaneProps) => {
    const [draft, setDraft] = useState(json);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // What this pane last put into the store, formatted the way the store would
    // hand it back. Without it, the effect below would reformat mid-keystroke and
    // move the caret: typing changes the blocks, which changes `json`, which would
    // look like an outside edit.
    const lastEmitted = useRef(json);

    useEffect(() => {
        if (json === lastEmitted.current) return;
        lastEmitted.current = json;
        setDraft(json);
        setError(null);
    }, [json]);

    const edit = (value: string) => {
        setDraft(value);
        const result = payloadJsonToBlocks(value);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(null);
        lastEmitted.current = blocksToPayloadJson(result.blocks);
        onBlocks(result.blocks);
    };

    const copy = () => {
        void navigator.clipboard?.writeText(draft).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        });
    };

    // The gutter is not decoration: `JSON.parse` reports a failure by line, and
    // without numbers to count against, "line 24" is a line the reader has to find
    // by hand in a payload that is mostly punctuation.
    const lines = useMemo(() => draft.split('\n').length, [draft]);

    // The gutter does not scroll itself; it follows the editor. Two scrollers side
    // by side drift the moment one of them is flung, and a number beside the wrong
    // line is worse than no number.
    const gutter = useRef<HTMLDivElement>(null);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-0 flex-1">
                <div
                    ref={gutter}
                    aria-hidden
                    className={cn(
                        CODE,
                        'shrink-0 select-none overflow-hidden py-0 pl-4 pr-2 text-right',
                        'tabular-nums text-muted-foreground/40'
                    )}
                >
                    {Array.from({ length: lines }, (_, index) => (
                        <div key={index}>{index + 1}</div>
                    ))}
                </div>

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
                        if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
                    }}
                    // 16px on a phone for the same reason as the block fields: below that,
                    // iOS Safari zooms in on focus and stays zoomed.
                    className={cn(
                        CODE,
                        'focus-ring min-h-0 flex-1 resize-none overflow-auto bg-transparent pr-4 text-foreground'
                    )}
                />
            </div>

            {/* Below the editor, not over it: an overlay would hide the line the
                reader is being told about. */}
            {error && (
                <p
                    role="status"
                    className="flex shrink-0 items-start gap-1.5 border-t border-hairline px-4 py-2 text-caption text-destructive"
                >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                        {error}{' '}
                        <span className="text-muted-foreground">Preview still shows the last valid payload.</span>
                    </span>
                </p>
            )}

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-4 py-1.5">
                <span className="text-micro tabular-nums text-muted-foreground/70">
                    {lines} {lines === 1 ? 'line' : 'lines'}
                </span>
                <button
                    type="button"
                    onClick={copy}
                    aria-label="Copy payload"
                    className={cn(
                        'focus-ring tactile flex items-center gap-1.5 rounded px-2 py-1 text-micro',
                        'text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground'
                    )}
                >
                    {copied ? <Check size={13} className="text-primary-ink" /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
    );
};
