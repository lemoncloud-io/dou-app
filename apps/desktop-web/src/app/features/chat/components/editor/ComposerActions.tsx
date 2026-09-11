import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Send, Smile } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { EmojiPicker } from '../EmojiPicker';

interface ComposerActionsProps {
    canSend: boolean;
    onEmoji: (emoji: string) => void;
    onSend: () => void;
}

/** Emoji picker + send button, right of the input (Figma: bare smile · 38px send square). */
export const ComposerActions = ({ canSend, onEmoji, onSend }: ComposerActionsProps) => {
    const { t } = useTranslation();
    // Controlled so a pick can close it. Leaving it open after a choice covers the
    // message you were writing and makes the click read as if it did not register.
    const [isPickerOpen, setPickerOpen] = useState(false);
    return (
        <>
            <Popover open={isPickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        title={t('chat.composer.emoji')}
                        aria-label={t('chat.composer.emoji')}
                        className="focus-ring tactile flex h-[38px] w-[30px] shrink-0 items-center justify-center rounded-lg text-label transition-colors ease-tactile hover:text-foreground disabled:opacity-50"
                    >
                        <Smile className="h-[22px] w-[22px]" strokeWidth={1.75} />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" className="w-auto p-2">
                    <EmojiPicker
                        onPick={emoji => {
                            onEmoji(emoji);
                            setPickerOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
            <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                title={t('chat.composer.send')}
                aria-label={t('chat.composer.send')}
                className={cn(
                    'focus-ring tactile flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg transition-colors ease-tactile',
                    // Figma GR2 fill with a white plane when there is something to send.
                    canSend ? 'bg-main-accent text-white hover:opacity-90' : 'bg-muted text-placeholder'
                )}
            >
                <Send className="h-5 w-5 fill-current" aria-hidden />
            </button>
        </>
    );
};
