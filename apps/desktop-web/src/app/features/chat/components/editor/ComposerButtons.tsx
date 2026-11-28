import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Send, Smile } from 'lucide-react';

import { cn, Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit';
import { Hint } from '@chatic/design-system-components-desktop';

import { EmojiPicker } from '../EmojiPicker';
import { COMPOSER_ACTION_BUTTON } from './composerActionButton';

export const ComposerEmojiButton = ({ onEmoji }: { onEmoji: (emoji: string) => void }) => {
    const { t } = useTranslation();
    const [isPickerOpen, setPickerOpen] = useState(false);
    const pickedRef = useRef(false);
    return (
        <Popover open={isPickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
                <Hint label={t('chat.composer.emoji')}>
                    <button type="button" aria-label={t('chat.composer.emoji')} className={COMPOSER_ACTION_BUTTON}>
                        <Smile size={18} aria-hidden />
                    </button>
                </Hint>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="top"
                className="w-auto p-2"
                onCloseAutoFocus={event => {
                    if (!pickedRef.current) return;
                    pickedRef.current = false;
                    event.preventDefault();
                }}
            >
                <EmojiPicker
                    onPick={emoji => {
                        pickedRef.current = true;
                        onEmoji(emoji);
                        setPickerOpen(false);
                    }}
                />
            </PopoverContent>
        </Popover>
    );
};

export const ComposerSendButton = ({ canSend, onSend }: { canSend: boolean; onSend: () => void }) => {
    const { t } = useTranslation();
    return (
        <Hint label={t('chat.composer.send')}>
            <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                aria-label={t('chat.composer.send')}
                className={cn(
                    'focus-ring tactile flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ease-tactile',
                    canSend ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground'
                )}
            >
                <Send size={18} className="fill-current" aria-hidden />
            </button>
        </Hint>
    );
};
