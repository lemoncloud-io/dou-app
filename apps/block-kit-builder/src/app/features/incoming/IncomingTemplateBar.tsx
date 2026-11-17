import { useState } from 'react';

import { cn } from '@chatic/ui-kit';

/**
 * Which sender builder the open card came from, and the way to make an edit stick.
 *
 * "Apply to next cards" is a placeholder. The sender builds every card in its own code and this
 * builder keeps nothing on a server, so there is nowhere yet for an edit to go that the sender reads
 * back. It needs a template store (id → template), a save API here, and the sender fetching the
 * template at send time.
 */
export const IncomingTemplateBar = ({ templateId }: { templateId: string }) => {
    const [asked, setAsked] = useState(false);

    return (
        <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">
                Builder <code className="font-semibold text-foreground">{templateId}</code>
            </span>
            <button
                type="button"
                onClick={() => setAsked(true)}
                className={cn(
                    'focus-ring tactile rounded px-2 py-1 text-micro',
                    'text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground'
                )}
            >
                Apply to next cards
            </button>
            {asked && (
                <span role="status" className="text-micro text-muted-foreground">
                    TODO — needs a template store on the server
                </span>
            )}
        </div>
    );
};
