import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

import { useNavigateWithTransition } from '@chatic/shared';

import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    onBack?: () => void;
    rightAction?: ReactNode;
    hideBack?: boolean;
    safeArea?: boolean;
}

export const PageHeader = ({ title, onBack, rightAction, hideBack = false, safeArea = true }: PageHeaderProps) => {
    const { t } = useTranslation();
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
                safeArea ? 'pt-[calc(var(--safe-top,0px)+0.75rem)]' : 'pt-3'
            )}
        >
            {!hideBack && (
                <button onClick={handleBack} className="absolute left-4 p-2" aria-label={t('common.back')}>
                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                </button>
            )}

            <h1 className="text-[17px] font-semibold text-foreground truncate max-w-[60%]">{title || '\u200B'}</h1>

            {rightAction && <div className="absolute right-4">{rightAction}</div>}
        </header>
    );
};
