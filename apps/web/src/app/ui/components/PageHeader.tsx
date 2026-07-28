import { ChevronLeft } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';

import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    onBack?: () => void;
    rightAction?: ReactNode;
    /** Hide the left back button (e.g. a modal-style page that closes via a right X action). */
    hideBack?: boolean;
}

export const PageHeader = ({ title, onBack, rightAction, hideBack = false }: PageHeaderProps) => {
    const navigate = useNavigateWithTransition();

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigate(-1);
        }
    };

    return (
        <header className="relative flex items-center justify-center bg-white/[0.32] px-4 py-3 min-h-[48px] backdrop-blur-xl dark:bg-black/[0.32]">
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
