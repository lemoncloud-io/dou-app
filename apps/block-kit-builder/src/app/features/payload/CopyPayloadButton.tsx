import { useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

/**
 * Copy the payload, from the pane's heading row.
 *
 * It takes the compiled payload rather than the editor's draft, which differs
 * only while the draft does not parse — and half a brace is not a payload
 * anyone can paste anywhere. That is also why it lives out here instead of
 * inside the editor: the thing worth copying is what the message compiles to,
 * which the editor is one of two ways of writing.
 */
export const CopyPayloadButton = ({ json }: { json: string }) => {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        void navigator.clipboard?.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        });
    };

    return (
        <button
            type="button"
            onClick={copy}
            aria-label="Copy payload"
            className={cn(
                'focus-ring tactile flex items-center gap-1.5 rounded px-2 py-1 text-micro',
                'text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground'
            )}
        >
            {copied ? <Check size={14} className="text-primary-ink" /> : <Copy size={14} />}
            <span className="sr-only lg:not-sr-only">{copied ? 'Copied' : 'Copy'}</span>
        </button>
    );
};
