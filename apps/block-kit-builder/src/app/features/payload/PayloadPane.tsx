import { useEffect, useRef, useState } from 'react';

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

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 justify-end px-4 pb-2">
                <button
                    type="button"
                    onClick={copy}
                    aria-label="Copy payload"
                    className={cn(
                        'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md',
                        'text-muted-foreground transition-colors ease-tactile hover:bg-accent'
                    )}
                >
                    {copied ? <Check size={16} className="text-primary-ink" /> : <Copy size={16} />}
                </button>
            </div>

            <textarea
                aria-label="Payload JSON"
                spellCheck={false}
                value={draft}
                onChange={event => edit(event.target.value)}
                className={cn(
                    'focus-ring min-h-0 flex-1 resize-none bg-transparent px-4 font-mono',
                    'text-caption leading-relaxed text-foreground'
                )}
            />

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
        </div>
    );
};
