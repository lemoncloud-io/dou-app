import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Send, Smile } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { EmojiPicker } from '../EmojiPicker';
import { Hint } from '../../../../shared';
import { COMPOSER_ACTION_BUTTON } from './composerActionButton';

/**
 * The smile button and its picker. Controlled so a pick can close it: leaving it open after a
 * choice covers the message you were writing and makes the click read as if it did not register.
 */
export const ComposerEmojiButton = ({ onEmoji }: { onEmoji: (emoji: string) => void }) => {
    const { t } = useTranslation();
    const [isPickerOpen, setPickerOpen] = useState(false);
    // Set when the picker closes because something was chosen: the caller has already put focus
    // back in its text, and Radix would otherwise move it to this button a tick later.
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

/** The send square at the end of the composer's bottom row, lime once there is something to send. */
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
                    // The same lime as every other primary action. Send used the darker
                    // GR2, which put two limes side by side for one role.
                    canSend ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground'
                )}
            >
                <Send size={18} className="fill-current" aria-hidden />
            </button>
        </Hint>
    );
};
