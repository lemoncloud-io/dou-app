import { AtSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MentionButtonProps {
    /** Whether the `@` list is showing, read out as the button's expanded state. */
    open: boolean;
    onClick: () => void;
    disabled?: boolean;
}

/**
 * The composer's `@` button, beside the attach button: it starts an `@` in the field and opens the
 * list, for a person who would rather tap a name than type the start of one. Typing `@` opens the same
 * list; the button is only another way in.
 *
 * Drawn like the attach button, the same 32px circle, so the two read as one row of controls. A tap on
 * it keeps the field's caret and keyboard: the composer cancels a press on anything but its field.
 */
export const MentionButton = ({ open, onClick, disabled = false }: MentionButtonProps) => {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={t('chat.mention.open')}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-control-surface bg-control-surface transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
            <AtSign className="size-[18px] text-brand-ink" strokeWidth={2.5} />
        </button>
    );
};
