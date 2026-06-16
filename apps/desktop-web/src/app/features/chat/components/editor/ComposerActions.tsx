import { useTranslation } from 'react-i18next';

import { SendHorizontal, Smile } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { EmojiPicker } from '../EmojiPicker';

interface ComposerActionsProps {
    disabled: boolean;
    canSend: boolean;
    onEmoji: (emoji: string) => void;
    onSend: () => void;
}

/** Emoji picker + send button, right of the input. */
export const ComposerActions = ({ disabled, canSend, onEmoji, onSend }: ComposerActionsProps) => {
    const { t } = useTranslation();
    return (
        <>
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        disabled={disabled}
                        title={t('chat.composer.emoji')}
                        aria-label={t('chat.composer.emoji')}
                        className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground disabled:opacity-50"
                    >
                        <Smile className="h-5 w-5" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" className="w-auto p-2">
                    <EmojiPicker onPick={onEmoji} />
                </PopoverContent>
            </Popover>
            <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                title={t('chat.composer.send')}
                className={cn(
                    'focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all ease-tactile',
                    canSend ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground'
                )}
            >
                <SendHorizontal className="h-4 w-4" aria-hidden />
            </button>
        </>
    );
};
