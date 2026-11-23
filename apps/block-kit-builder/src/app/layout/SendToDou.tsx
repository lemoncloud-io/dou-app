import { toast } from 'sonner';

import { cn } from '@chatic/ui-kit';

export const SendToDou = () => (
    <button
        type="button"
        onClick={() =>
            toast('Send to DoU is not connected yet', {
                description: 'Copy the payload and post it from your bot for now.',
            })
        }
        className={cn(
            'focus-ring tactile shrink-0 rounded-md bg-primary px-3 py-1.5 text-caption font-semibold',
            'text-primary-foreground transition-colors ease-tactile hover:bg-primary/90 lg:px-4 lg:py-2'
        )}
    >
        Send to DoU
    </button>
);
