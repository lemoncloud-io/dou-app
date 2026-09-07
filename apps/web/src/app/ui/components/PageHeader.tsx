import { ChevronLeft } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { useNavigateWithTransition } from '@chatic/shared';

import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    onBack?: () => void;
    rightAction?: ReactNode;
    /** Hide the left back button (e.g. a modal-style page that closes via a right X action). */
    hideBack?: boolean;
    /**
     * Whether the bar takes the notch inset itself, stretching its glass fill up across the status
     * bar. ON by default, because that is the only arrangement where the glass actually reaches the
     * top edge: an inset applied by the PARENT sits above the fill, leaving a bare strip across the
     * notch — flat next to the frosted bar below it, and on an overlay layout
     * (`KeyboardAwareLayout` + `headerSafeArea={false}`) a window for content to scroll through
     * unblurred.
     *
     * So a caller does not pad above this bar; it pads nothing and lets the bar own the inset.
     * Turn this off only where something else already applied it and the gap would double.
     */
    safeArea?: boolean;
}

export const PageHeader = ({ title, onBack, rightAction, hideBack = false, safeArea = true }: PageHeaderProps) => {
    const navigate = useNavigateWithTransition();

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigate(-1);
        }
    };

    return (
        <header
            className={cn(
                'relative flex items-center justify-center bg-white/[0.32] px-4 pb-3 min-h-[48px] backdrop-blur-xl dark:bg-black/[0.32]',
                // Keep the base 12px top padding, plus the inset when this bar owns it.
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.75rem)]' : 'pt-3'
            )}
        >
            {!hideBack && (
                <button onClick={handleBack} className="absolute left-4 p-2" aria-label="Back">
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
            )}

            <h1 className="text-[17px] font-semibold text-foreground truncate max-w-[60%]">{title || '\u200B'}</h1>

            {rightAction && <div className="absolute right-4">{rightAction}</div>}
        </header>
    );
};
