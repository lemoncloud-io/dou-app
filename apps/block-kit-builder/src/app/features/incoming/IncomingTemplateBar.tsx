import { useState } from 'react';

import { cn } from '@chatic/ui-kit';

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
