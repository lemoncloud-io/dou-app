import { useTranslation } from 'react-i18next';

import { CornerUpLeft, X } from 'lucide-react';

interface JumpReturnBarProps {
    /** Name of the channel the reader left, already display-formatted. */
    originName: string;
    onReturn: () => void;
    onDismiss: () => void;
}

/**
 * The second half of a jump.
 *
 * Search, saved items, mentions and notification clicks all move the reader to
 * another channel, and none of them used to leave a way back: the reading
 * position they left was simply gone. This bar holds that position until they
 * either take it or dismiss it.
 *
 * It sits above the feed rather than floating over it, because it is a statement
 * about where the reader is, not a transient toast — it stays for as long as the
 * detour does.
 */
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
                <span className="truncate">{t('chat.jump.return', { name: originName })}</span>
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
