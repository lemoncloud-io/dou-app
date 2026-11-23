import { useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

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
