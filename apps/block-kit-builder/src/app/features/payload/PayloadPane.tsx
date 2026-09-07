import { useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

interface PayloadPaneProps {
    json: string;
}

/**
 * The JSON the blocks compile to.
 *
 * Read-only for now — slice 06 makes it an editor. Copy is the export: the
 * builder sends nothing itself, so the payload leaving through the clipboard is
 * how it reaches a webhook body.
 */
export const PayloadPane = ({ json }: PayloadPaneProps) => {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        void navigator.clipboard?.writeText(json).then(() => {
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
            {/* `pre` keeps the indentation the codec produced. Horizontal scroll is
                on the block itself so a long line never widens the pane. */}
            <pre className="min-h-0 flex-1 overflow-auto px-4 pb-4 font-mono text-caption leading-relaxed text-foreground">
                {json}
            </pre>
        </div>
    );
};
