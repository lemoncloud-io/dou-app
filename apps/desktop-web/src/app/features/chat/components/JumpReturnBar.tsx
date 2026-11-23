import { useTranslation } from 'react-i18next';

import { CornerUpLeft, X } from 'lucide-react';

interface JumpReturnBarProps {
    originName?: string;
    onReturn: () => void;
    onDismiss: () => void;
}

export const JumpReturnBar = ({ originName, onReturn, onDismiss }: JumpReturnBarProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-well px-4 py-1.5">
            <button
                type="button"
                onClick={onReturn}
                className="focus-ring tactile flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-caption text-foreground transition-colors ease-tactile hover:bg-accent"
            >
                <CornerUpLeft size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">
                    {originName ? t('chat.jump.return', { name: originName }) : t('chat.jump.returnHere')}
                </span>
            </button>
            <button
                type="button"
                onClick={onDismiss}
                aria-label={t('chat.jump.dismissReturn')}
                className="focus-ring tactile hit-target ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
            >
                <X size={14} aria-hidden />
            </button>
        </div>
    );
};
